-- REVIEWED PREPARATION ONLY. Not applied to any hosted Supabase project. Staging (knftduojdalnawvkbelt) only, after separate approval.
-- Report review and retention management (proposal values: review 14 days from receipt, deletion candidate 90 days after closing;
-- both are settings, not legal requirements). Nothing here deletes a report: it lists candidates and re-checks them only.
-- Users keep sending reports with the same five columns the app sends (app.js: reporter_user_id, target_type, target_id, reason, note).
-- Users can no longer set or change any other column. Existing RLS policies on reports are not changed.
begin;
do $preflight$
begin
  if to_regclass('public.reports') is null then raise exception 'public.reports must exist'; end if;
  if not exists(select 1 from pg_roles where rolname='service_role') then raise exception 'service_role must exist'; end if;
  if not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
                 where n.nspname='public' and c.relname='reports' and c.relrowsecurity) then
    raise exception 'reports RLS must already be enabled';
  end if;
end
$preflight$;

create schema if not exists yt_private;
revoke all on schema yt_private from public;

-- Proposal values, changeable by the operator without a code change.
create table if not exists yt_private.report_retention_settings(
  id              boolean primary key default true check (id),
  review_days     integer not null default 14 check (review_days between 1 and 365),
  retention_days  integer not null default 90 check (retention_days between 1 and 3650),
  max_extend_days integer not null default 14 check (max_extend_days between 1 and 365)
);
insert into yt_private.report_retention_settings(id) values (true) on conflict (id) do nothing;
revoke all on yt_private.report_retention_settings from public, anon, authenticated;

-- Management columns. Added once; the one-time migration of existing rows runs only when they are first added.
do $columns$
declare v_review integer;
begin
  if exists(select 1 from information_schema.columns where table_schema='public' and table_name='reports' and column_name='row_version') then
    return;   -- already prepared: do not migrate again
  end if;
  alter table public.reports
    add column review_due_at          timestamptz,
    add column closed_at              timestamptz,
    add column closed_by              text,
    add column close_reason           text,
    add column retention_until        timestamptz,
    add column retention_hold         boolean not null default false,
    add column hold_reason            text,
    add column legacy_review_required boolean not null default false,
    add column migration_review_due_at timestamptz,
    add column last_action            text,
    add column last_reason            text,
    add column last_decided_by        text,
    add column last_decided_at        timestamptz,
    add column row_version            bigint not null default 0;
  select review_days into v_review from yt_private.report_retention_settings;
  -- Receipt date is never changed. review_due_at counts from receipt, so old open reports show as overdue (not hidden).
  update public.reports set review_due_at = created_at + make_interval(days => v_review);
  -- Existing open reports also get a separate one-time migration review date.
  update public.reports set migration_review_due_at = now() + make_interval(days => v_review) where status = 'open';
  -- Existing closed reports: their completion date is unknown. Do not guess; a person must review them first.
  update public.reports set legacy_review_required = true where status <> 'open';
end
$columns$;

-- Inserts: whatever the caller sends, management columns start from fixed values (second line of defence behind column privileges).
-- Security definer: a user's insert must read the private settings without being granted access to them.
create or replace function yt_private.reports_before_insert() returns trigger language plpgsql security definer set search_path = '' as $$
declare v_review integer;
begin
  select review_days into v_review from yt_private.report_retention_settings;
  new.review_due_at := coalesce(new.created_at, now()) + make_interval(days => v_review);
  new.closed_at := null; new.closed_by := null; new.close_reason := null;
  new.retention_until := null; new.retention_hold := false; new.hold_reason := null;
  new.legacy_review_required := false; new.migration_review_due_at := null;
  new.last_action := null; new.last_reason := null; new.last_decided_by := null; new.last_decided_at := null;
  new.row_version := 0;
  return new;
end
$$;
drop trigger if exists yt_reports_before_insert on public.reports;
create trigger yt_reports_before_insert before insert on public.reports
  for each row execute function yt_private.reports_before_insert();

-- Updates: row_version goes up by one whenever anything other than row_version changes; it cannot be set by hand.
create or replace function yt_private.reports_before_update() returns trigger language plpgsql set search_path = '' as $$
begin
  if (to_jsonb(new) - 'row_version') is distinct from (to_jsonb(old) - 'row_version') then
    new.row_version := old.row_version + 1;
  else
    new.row_version := old.row_version;
  end if;
  return new;
end
$$;
drop trigger if exists yt_reports_before_update on public.reports;
create trigger yt_reports_before_update before update on public.reports
  for each row execute function yt_private.reports_before_update();

-- Privileges: a table-wide INSERT/UPDATE grant would make column grants meaningless, so remove table-wide grants first,
-- then allow INSERT of the five app columns only. No UPDATE, DELETE or SELECT for users (as before: users cannot read reports).
revoke all on public.reports from anon, authenticated;
grant insert (reporter_user_id, target_type, target_id, reason, note) on public.reports to authenticated;

-- One rule for "may be deleted", used by both the candidate list and the re-check.
create or replace function yt_private.report_deletable(r public.reports, p_now timestamptz) returns boolean
  language sql stable set search_path = '' as $$
  select r.status <> 'open'
     and r.closed_at is not null
     and not r.legacy_review_required
     and not r.retention_hold
     and r.retention_until is not null
     and r.retention_until < p_now
$$;

-- Operator functions (service_role only). Each records what was decided, by whom and why.
create or replace function public.yt_report_close(p_id uuid, p_status text, p_reason text, p_by text) returns bigint
  language plpgsql security definer set search_path = '' as $$
declare v_days integer; v_ver bigint;
begin
  if p_status not in ('reviewed','actioned','dismissed') then raise exception 'closing status must be reviewed, actioned or dismissed'; end if;
  if coalesce(p_reason,'') = '' or coalesce(p_by,'') = '' then raise exception 'reason and decider are required'; end if;
  select retention_days into v_days from yt_private.report_retention_settings;
  update public.reports set status = p_status, closed_at = now(), closed_by = p_by, close_reason = p_reason,
         retention_until = now() + make_interval(days => v_days), retention_hold = false, hold_reason = null,
         legacy_review_required = false,
         last_action = 'close', last_reason = p_reason, last_decided_by = p_by, last_decided_at = now()
   where id = p_id returning row_version into v_ver;
  if not found then raise exception 'report not found'; end if;
  return v_ver;
end
$$;

-- Extend the review of an open report: reason, decider and the next review date (at most max_extend_days ahead) are required.
create or replace function public.yt_report_extend_review(p_id uuid, p_next_review timestamptz, p_reason text, p_by text) returns bigint
  language plpgsql security definer set search_path = '' as $$
declare v_max integer; v_ver bigint;
begin
  if coalesce(p_reason,'') = '' or coalesce(p_by,'') = '' or p_next_review is null then raise exception 'reason, decider and next review date are required'; end if;
  select max_extend_days into v_max from yt_private.report_retention_settings;
  if p_next_review <= now() or p_next_review > now() + make_interval(days => v_max) then raise exception 'next review must be within the allowed extension'; end if;
  update public.reports set review_due_at = p_next_review,
         last_action = 'extend_review', last_reason = p_reason, last_decided_by = p_by, last_decided_at = now()
   where id = p_id and status = 'open' returning row_version into v_ver;
  if not found then raise exception 'open report not found'; end if;
  return v_ver;
end
$$;

-- Keep a closed report longer (hold) or end the hold. Ending the hold does not shorten retention_until.
create or replace function public.yt_report_hold(p_id uuid, p_hold boolean, p_until timestamptz, p_reason text, p_by text) returns bigint
  language plpgsql security definer set search_path = '' as $$
declare v_ver bigint;
begin
  if coalesce(p_reason,'') = '' or coalesce(p_by,'') = '' then raise exception 'reason and decider are required'; end if;
  update public.reports set retention_hold = p_hold, hold_reason = case when p_hold then p_reason else null end,
         retention_until = greatest(retention_until, coalesce(p_until, retention_until)),
         last_action = case when p_hold then 'hold' else 'end_hold' end, last_reason = p_reason, last_decided_by = p_by, last_decided_at = now()
   where id = p_id and closed_at is not null returning row_version into v_ver;
  if not found then raise exception 'closed report not found'; end if;
  return v_ver;
end
$$;

-- Reopen: back to open; completion and retention are cleared; the review clock restarts from now.
create or replace function public.yt_report_reopen(p_id uuid, p_reason text, p_by text) returns bigint
  language plpgsql security definer set search_path = '' as $$
declare v_review integer; v_ver bigint;
begin
  if coalesce(p_reason,'') = '' or coalesce(p_by,'') = '' then raise exception 'reason and decider are required'; end if;
  select review_days into v_review from yt_private.report_retention_settings;
  update public.reports set status = 'open', closed_at = null, closed_by = null, close_reason = null,
         retention_until = null, retention_hold = false, hold_reason = null,
         review_due_at = now() + make_interval(days => v_review),
         last_action = 'reopen', last_reason = p_reason, last_decided_by = p_by, last_decided_at = now()
   where id = p_id returning row_version into v_ver;
  if not found then raise exception 'report not found'; end if;
  return v_ver;
end
$$;

-- An existing closed report with unknown completion date: a person confirms it, giving the date to count from (e.g. the review date).
create or replace function public.yt_report_resolve_legacy(p_id uuid, p_closed_at timestamptz, p_reason text, p_by text) returns bigint
  language plpgsql security definer set search_path = '' as $$
declare v_days integer; v_ver bigint;
begin
  if coalesce(p_reason,'') = '' or coalesce(p_by,'') = '' or p_closed_at is null or p_closed_at > now() then
    raise exception 'reason, decider and a confirmed date (not in the future) are required';
  end if;
  select retention_days into v_days from yt_private.report_retention_settings;
  update public.reports set closed_at = p_closed_at, closed_by = p_by, close_reason = p_reason,
         retention_until = p_closed_at + make_interval(days => v_days), legacy_review_required = false,
         last_action = 'resolve_legacy', last_reason = p_reason, last_decided_by = p_by, last_decided_at = now()
   where id = p_id and legacy_review_required and status <> 'open' returning row_version into v_ver;
  if not found then raise exception 'legacy closed report not found'; end if;
  return v_ver;
end
$$;

-- Candidates for deletion (list only; nothing is deleted).
create or replace function public.yt_report_deletion_candidates(p_now timestamptz default now())
  returns table(id uuid, row_version bigint, closed_at timestamptz, retention_until timestamptz)
  language sql stable security definer set search_path = '' as $$
  select r.id, r.row_version, r.closed_at, r.retention_until
    from public.reports r where yt_private.report_deletable(r, p_now) order by r.retention_until, r.id
$$;

-- Re-check listed candidates under row locks, with the same rule plus an unchanged row_version. Nothing is deleted.
-- p_items: [{"id": "...", "row_version": n}, ...]
create or replace function public.yt_report_deletion_recheck(p_items jsonb, p_now timestamptz default now())
  returns table(id uuid, eligible boolean, reason text)
  language plpgsql security definer set search_path = '' as $$
declare it jsonb; r public.reports;
begin
  for it in select * from jsonb_array_elements(p_items) loop
    select * into r from public.reports x where x.id = (it ->> 'id')::uuid for update;
    id := (it ->> 'id')::uuid;
    if not found then eligible := false; reason := 'missing'; return next; continue; end if;
    if r.row_version <> (it ->> 'row_version')::bigint then eligible := false; reason := 'changed_after_listing'; return next; continue; end if;
    if not yt_private.report_deletable(r, p_now) then eligible := false; reason := 'not_deletable_now'; return next; continue; end if;
    eligible := true; reason := 'ok'; return next;
  end loop;
end
$$;

-- Review list: open reports, with the overdue days counted from receipt and the separate migration review date.
create or replace function public.yt_report_review_list(p_now timestamptz default now())
  returns table(id uuid, created_at timestamptz, review_due_at timestamptz, days_since_receipt integer,
                review_overdue boolean, migration_review_due_at timestamptz, legacy_review_required boolean, status text)
  language sql stable security definer set search_path = '' as $$
  select r.id, r.created_at, r.review_due_at, (extract(epoch from (p_now - r.created_at)) / 86400)::integer,
         r.review_due_at < p_now, r.migration_review_due_at, r.legacy_review_required, r.status
    from public.reports r
   where r.status = 'open' or r.legacy_review_required
   order by r.created_at
$$;

do $grants$
declare f text;
begin
  foreach f in array array[
    'public.yt_report_close(uuid,text,text,text)', 'public.yt_report_extend_review(uuid,timestamptz,text,text)',
    'public.yt_report_hold(uuid,boolean,timestamptz,text,text)', 'public.yt_report_reopen(uuid,text,text)',
    'public.yt_report_resolve_legacy(uuid,timestamptz,text,text)', 'public.yt_report_deletion_candidates(timestamptz)',
    'public.yt_report_deletion_recheck(jsonb,timestamptz)', 'public.yt_report_review_list(timestamptz)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end
$grants$;
revoke all on function yt_private.report_deletable(public.reports, timestamptz) from public, anon, authenticated;
revoke all on function yt_private.reports_before_insert() from public, anon, authenticated;
revoke all on function yt_private.reports_before_update() from public, anon, authenticated;
-- Boundaries (for review): every function above has search_path = '' and fully qualified names. The security-definer ones run as
-- the owner of this file's objects (the role that applies it, normally postgres). Operator functions are executable only by
-- service_role; p_by is a text the operator supplies (not an authenticated identity) and is recorded as given. Users can execute
-- none of them and have no access to yt_private.report_retention_settings.
commit;
