-- REVIEWED DRAFT ONLY. Not applied to any hosted Supabase project. Requires deletion_u1_prepare.sql (6034394) first.
-- Uses only supported pieces: our own schema (yt_private), service-only functions in public, and the standard pg_stat_activity view.
-- Does NOT change the storage schema.
--
-- Why: the drain in deletion_u1_prepare.sql waits for transaction ids. A transaction that took its snapshot before the refusal (R)
-- committed but was given its transaction id later (its first write came after) is not waited for, and in READ COMMITTED its policy
-- check (Storage v1.96.4 completeUpload: testPermission probe as the caller) may not have seen R. A read-only snapshot has no id at all.
-- New rule: right after R has committed (yt_deletion_drain_mark is a separate call after yt_deletion_accept returned), record every
-- client transaction that is open at that moment (pid, backend_start, xact_start). Drained = none of them is still open.
-- Any transaction that starts after that moment takes its snapshots after R committed, so a policy check in it sees R.
-- Any transaction that ended before it has already written its rows, which the deletion then removes.
-- Limits: (a) signed uploads write as the service user without policies, so this does not refuse them (see the experimental trigger
-- file, or the time bound asked from support); (b) a long idle transaction anywhere delays the drain (the reply stays in progress);
-- (c) it relies on the function owner (postgres on staging: member of pg_read_all_stats, read 2026-11-18) seeing all backends.
begin;
do $pre$
begin
  if to_regclass('yt_private.account_deletion_jobs') is null or to_regclass('yt_private.deletion_refusals') is null then
    raise exception 'apply deletion_u1_prepare.sql first';
  end if;
end
$pre$;

alter table yt_private.account_deletion_jobs add column if not exists drain_captured_at timestamptz;
create table if not exists yt_private.deletion_drain_waits(
  job_id        uuid not null,
  pid           integer not null,
  backend_start timestamptz not null,
  xact_start    timestamptz not null,
  primary key (job_id, pid)
);
revoke all on yt_private.deletion_drain_waits from public, anon, authenticated;

-- The one place that reads backend activity (tests replace this view with fixed rows; nothing else reads pg_stat_activity).
create or replace view yt_private.backend_activity as
  select a.pid, a.backend_start, a.xact_start, a.backend_type, a.state from pg_catalog.pg_stat_activity a;
revoke all on yt_private.backend_activity from public, anon, authenticated;

-- Fail closed when the activity data could be incomplete. pg_stat_activity hides other sessions' columns (NULL) from a role without
-- pg_read_all_stats, and with track_activities off the state/timing columns are not kept; a hidden row would otherwise look like
-- "no transaction" and the drain would pass. Runs as the caller (no SECURITY DEFINER), i.e. as the owner of the definer function that
-- calls it. pg_stat_clear_snapshot() is called before each read so that a statistics snapshot taken earlier in the same transaction
-- is not reused (PostgreSQL 17 docs, monitoring-stats: activity data is a per-transaction snapshot until cleared).
create or replace function yt_private.assert_activity_visible() returns void
  language plpgsql volatile set search_path = '' as $$
begin
  if current_setting('track_activities') <> 'on' then
    raise exception 'drain capture: track_activities must be on (fail closed)';
  end if;
  if not (pg_catalog.pg_has_role(current_user, 'pg_read_all_stats', 'member')
          or exists (select 1 from pg_catalog.pg_roles where rolname = current_user and rolsuper)) then
    raise exception 'drain capture: function owner cannot read all statistics (fail closed)';
  end if;
  if exists (select 1 from yt_private.backend_activity a
              where a.backend_type = 'client backend' and a.pid <> pg_backend_pid()
                and (a.state is null or a.backend_start is null)) then
    raise exception 'drain capture: a client backend is not fully visible (fail closed)';
  end if;
end
$$;
revoke all on function yt_private.assert_activity_visible() from public, anon, authenticated;

create or replace function public.yt_deletion_drain_mark(p_job uuid) returns bigint
  language plpgsql security definer set search_path = '' as $$
declare v bigint; v_user uuid; v_captured timestamptz;
begin
  select user_id, drain_captured_at into v_user, v_captured from yt_private.account_deletion_jobs where id = p_job;
  if v_user is null then raise exception 'job not found'; end if;
  -- Must run after R is visible (committed): otherwise the capture could precede it.
  if not exists (select 1 from yt_private.deletion_refusals r where r.user_id = v_user) then raise exception 'refusal not visible yet'; end if;
  if v_captured is null then
    perform pg_catalog.pg_stat_clear_snapshot();
    perform yt_private.assert_activity_visible();
    insert into yt_private.deletion_drain_waits(job_id, pid, backend_start, xact_start)
      select p_job, a.pid, a.backend_start, a.xact_start from yt_private.backend_activity a
       where a.xact_start is not null and a.backend_start is not null and a.backend_type = 'client backend'
         and a.pid <> pg_backend_pid()
      on conflict do nothing;
    update yt_private.account_deletion_jobs
       set drain_captured_at = clock_timestamp(),
           drain_xmax = coalesce(drain_xmax, (pg_snapshot_xmax(pg_current_snapshot()))::text::bigint)
     where id = p_job and drain_captured_at is null;
  end if;
  select drain_xmax into v from yt_private.account_deletion_jobs where id = p_job;
  return v;
end
$$;

-- Drained: the capture exists, no captured transaction is still open (same backend, same transaction start), and the earlier
-- transaction-id rule also holds (kept: it is never weaker to require both).
create or replace function public.yt_deletion_drained(p_job uuid) returns boolean
  language plpgsql volatile security definer set search_path = '' as $$
declare v boolean;
begin
  perform pg_catalog.pg_stat_clear_snapshot();
  perform yt_private.assert_activity_visible();
  select j.drain_captured_at is not null
     and j.drain_xmax is not null
     and (pg_snapshot_xmin(pg_current_snapshot()))::text::bigint >= j.drain_xmax
     and not exists (select 1 from yt_private.deletion_drain_waits w
                       join yt_private.backend_activity a
                         on a.pid = w.pid and a.backend_start = w.backend_start and a.xact_start = w.xact_start
                      where w.job_id = j.id)
    into v
    from yt_private.account_deletion_jobs j where j.id = p_job;
  return coalesce(v, false);
end
$$;

revoke all on function public.yt_deletion_drain_mark(uuid) from public, anon, authenticated;
revoke all on function public.yt_deletion_drained(uuid) from public, anon, authenticated;
grant execute on function public.yt_deletion_drain_mark(uuid) to service_role;
grant execute on function public.yt_deletion_drained(uuid) to service_role;
commit;
