-- REVIEWED DRAFT ONLY. Not applied to any hosted Supabase project. Requires deletion_u1_prepare.sql (6034394) and deletion_u1_sweep_v2.sql (ce97a44).
-- Shortens only the DETAIL of a deletion job (L): the log and last_error. The L row and R are kept; nothing else changes.
-- Spec: claude-handoff/retention-decision-packet-20261122.txt (2章, revised after Work's review).
--
-- Version: every update of an L row raises detail_version by 1 (trigger). A caller lists candidates with their detail_version and
--   passes them back; a row whose version changed in between is skipped (no time-based ordering is assumed: now() is the transaction
--   start and does not order concurrent writers).
-- Quiet time: last_activity_at = clock_timestamp() of the last update that was activity (state, generation, lease, sweep counters,
--   hold, or a log entry added without compacting). A compaction itself is not activity. Eligible only 30 days after the last activity.
-- Eligible only when, under the row lock in the same transaction: version unchanged; R has auth_deleted_at and final_empty_at;
--   state AWAITING_ASSURANCE; no live lease; no sweep failure since the last successful sweep (and no stored error class); no detail hold;
--   quiet 30 days; and something to compact (a log entry that is not a summary, or a last_error).
-- Compaction: log becomes ONE summary entry {compacted:true, at, entries, last_to}; last_error becomes null; detail_compacted_at is set.
--   A row that holds only the summary is not compacted again; a new log entry added later makes it a candidate again (after 30 quiet days).
-- Manual only (no scheduler). Input: 1..50 items {job_id, row_version}, an approval reference and an operator; any bad item rejects all.
begin;
do $pre$
begin
  if to_regclass('yt_private.account_deletion_jobs') is null or to_regclass('yt_private.deletion_refusals') is null
     or to_regprocedure('public.yt_deletion_sweep_begin(uuid,text,integer)') is null then
    raise exception 'apply deletion_u1_prepare.sql and deletion_u1_sweep_v2.sql first';
  end if;
end
$pre$;

alter table yt_private.account_deletion_jobs add column if not exists detail_version bigint not null default 0;
alter table yt_private.account_deletion_jobs add column if not exists last_activity_at timestamptz not null default clock_timestamp();
alter table yt_private.account_deletion_jobs add column if not exists detail_hold boolean not null default false;
alter table yt_private.account_deletion_jobs add column if not exists detail_hold_reason text;
alter table yt_private.account_deletion_jobs add column if not exists detail_compacted_at timestamptz;

create table if not exists yt_private.detail_compaction_runs(
  id           bigserial primary key,
  approval_ref text not null check (char_length(approval_ref) between 1 and 200),
  executed_by  text not null check (char_length(executed_by) between 1 and 100),
  executed_at  timestamptz not null default now(),
  requested    integer not null check (requested between 1 and 50),
  compacted    integer not null check (compacted >= 0),
  skipped      integer not null check (skipped >= 0)
);
revoke all on yt_private.detail_compaction_runs from public, anon, authenticated;
revoke all on sequence yt_private.detail_compaction_runs_id_seq from public, anon, authenticated;

-- Version and activity on every update (runs after jobs_guard's BEFORE trigger by name order: "yt_jobs_detail" > "jobs_guard").
create or replace function yt_private.jobs_detail_version() returns trigger language plpgsql set search_path = '' as $$
declare v_keys text[] := array['updated_at','detail_version','last_activity_at','log','last_error','detail_compacted_at'];
begin
  new.detail_version := old.detail_version + 1;
  if (to_jsonb(new) - v_keys) is distinct from (to_jsonb(old) - v_keys)
     or (new.log is distinct from old.log and new.detail_compacted_at is not distinct from old.detail_compacted_at) then
    new.last_activity_at := clock_timestamp();
  else
    new.last_activity_at := old.last_activity_at;
  end if;
  return new;
end
$$;
drop trigger if exists yt_jobs_detail on yt_private.account_deletion_jobs;
create trigger yt_jobs_detail before update on yt_private.account_deletion_jobs
  for each row execute function yt_private.jobs_detail_version();
revoke all on function yt_private.jobs_detail_version() from public, anon, authenticated;

-- Hold / release the detail of one job (reason and operator required). Setting or releasing is activity (restarts the quiet time).
create or replace function public.yt_deletion_detail_hold(p_job uuid, p_hold boolean, p_reason text, p_by text) returns bigint
  language plpgsql security definer set search_path = '' as $$
declare v bigint;
begin
  if p_hold is null or coalesce(btrim(p_reason), '') = '' or coalesce(btrim(p_by), '') = '' then raise exception 'hold flag, reason and operator are required'; end if;
  update yt_private.account_deletion_jobs
     set detail_hold = p_hold, detail_hold_reason = case when p_hold then left(p_reason, 200) else null end
   where id = p_job returning detail_version into v;
  if not found then raise exception 'job not found'; end if;
  return v;
end
$$;

create or replace function public.yt_deletion_compact_detail(p_items jsonb, p_approval_ref text, p_by text)
  returns table(job_id uuid, result text, detail text)
  language plpgsql security definer set search_path = '' as $$
declare
  it jsonb; v_raw jsonb; v_id uuid; v_ver bigint; v_ids uuid[] := '{}'; v_vers bigint[] := '{}'; i integer;
  r yt_private.account_deletion_jobs; x yt_private.deletion_refusals; v_now timestamptz := now();
  v_entries bigint; v_open bigint; n_done integer := 0; n_skip integer := 0;
begin
  if coalesce(btrim(p_approval_ref), '') = '' or char_length(p_approval_ref) > 200 then raise exception 'approval reference (1-200 characters) is required'; end if;
  if coalesce(btrim(p_by), '') = '' or char_length(p_by) > 100 then raise exception 'operator (1-100 characters) is required'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then raise exception 'p_items must be a JSON array'; end if;
  if jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 50 then raise exception 'p_items must hold 1 to 50 items'; end if;
  for it in select * from jsonb_array_elements(p_items) loop
    if jsonb_typeof(it) <> 'object' or (select count(*) from jsonb_object_keys(it)) <> 2 or not (it ? 'job_id' and it ? 'row_version') then
      raise exception 'each item must be exactly {job_id, row_version}'; end if;
    if jsonb_typeof(it -> 'job_id') <> 'string'
       or (it ->> 'job_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'invalid job_id'; end if;
    v_raw := it -> 'row_version';
    if jsonb_typeof(v_raw) <> 'number' or (v_raw #>> '{}') !~ '^[0-9]{1,18}$' then raise exception 'invalid row_version'; end if;
    v_id := (it ->> 'job_id')::uuid; v_ver := (v_raw #>> '{}')::bigint;
    if v_id = any(v_ids) then raise exception 'duplicate job_id'; end if;
    v_ids := v_ids || v_id; v_vers := v_vers || v_ver;
  end loop;

  perform 1 from yt_private.account_deletion_jobs j where j.id = any(v_ids) order by j.id for update;

  for i in select ord from unnest(v_ids) with ordinality u(v, ord) order by v loop
    v_id := v_ids[i]; v_ver := v_vers[i]; job_id := v_id; detail := null;
    select * into r from yt_private.account_deletion_jobs j where j.id = v_id;
    if not found then result := 'missing'; n_skip := n_skip + 1; return next; continue; end if;
    if r.detail_version is distinct from v_ver then result := 'skipped_changed'; n_skip := n_skip + 1; return next; continue; end if;
    select * into x from yt_private.deletion_refusals d where d.user_id = r.user_id;
    result := 'not_eligible';
    if not found or x.auth_deleted_at is null or x.final_empty_at is null then detail := 'no_evidence';
    elsif r.state <> 'AWAITING_ASSURANCE' then detail := 'state';
    elsif r.lease_owner is not null and r.lease_expires_at is not null and r.lease_expires_at > v_now then detail := 'lease';
    elsif r.sweep_last_error_class is not null
       or (r.last_sweep_failed_at is not null and (r.last_swept_at is null or r.last_sweep_failed_at > r.last_swept_at)) then detail := 'sweep_failed';
    elsif r.detail_hold then detail := 'hold';
    elsif not (r.last_activity_at + interval '30 days' < v_now) then detail := 'not_quiet';
    else
      select count(*) filter (where not coalesce((e ->> 'compacted')::boolean, false)),
             coalesce(sum(case when coalesce((e ->> 'compacted')::boolean, false) then coalesce((e ->> 'entries')::bigint, 0) else 1 end), 0)
        into v_open, v_entries from jsonb_array_elements(r.log) e;
      if v_open = 0 and r.last_error is null then detail := 'nothing_to_compact';
      end if;
    end if;
    if detail is not null then n_skip := n_skip + 1; return next; continue; end if;
    update yt_private.account_deletion_jobs j
       set log = jsonb_build_array(jsonb_build_object('compacted', true, 'at', v_now, 'entries', v_entries, 'last_to', r.state)),
           last_error = null, detail_compacted_at = clock_timestamp()
     where j.id = v_id and j.detail_version = v_ver;
    if not found then raise exception 'row changed under lock'; end if;
    result := 'compacted'; detail := null; n_done := n_done + 1; return next;
  end loop;
  insert into yt_private.detail_compaction_runs(approval_ref, executed_by, executed_at, requested, compacted, skipped)
    values (p_approval_ref, p_by, v_now, cardinality(v_ids), n_done, n_skip);
end
$$;

-- Read-only candidate list for the operator (counts only; no log text).
create or replace function public.yt_deletion_detail_candidates() returns table(job_id uuid, row_version bigint, state text,
  last_activity_at timestamptz, log_entries integer, has_last_error boolean, detail_hold boolean, detail_compacted_at timestamptz)
  language sql stable security definer set search_path = '' as $$
  select j.id, j.detail_version, j.state, j.last_activity_at, jsonb_array_length(j.log), j.last_error is not null, j.detail_hold, j.detail_compacted_at
    from yt_private.account_deletion_jobs j
   where j.auth_deleted_at is not null
   order by j.last_activity_at
$$;

do $svc$
declare f text;
begin
  foreach f in array array['public.yt_deletion_compact_detail(jsonb,text,text)','public.yt_deletion_detail_hold(uuid,boolean,text,text)',
                           'public.yt_deletion_detail_candidates()'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end
$svc$;
commit;
