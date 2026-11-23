-- REVIEWED DRAFT ONLY. Not applied to any hosted Supabase project.
-- Requires: deletion_u1_prepare.sql, deletion_u1_sweep_v2.sql, deletion_u1_detail_compact.sql (ee7c471), report_retention_prepare.sql (8327150),
--           report_purge_prepare.sql (e45c8ac).
-- Retention management of the three operational audit tables (365 days as an operating target + up to 31 days until the monthly run;
-- not a legal period and not a public guarantee):
--   * yt_private.report_purge_runs and yt_private.detail_compaction_runs (execution records): these rows cannot be put on hold
--     (no hold column), so NO deletion function is provided for them. Only a read-only candidate list (counts and oldest time).
--   * yt_private.detail_hold_events (hold/release records of a deletion job's detail): deletion per job, only for ONE closed hold cycle,
--     counted from the cycle's first hold record (plan B): eligible when start + 365 days < now() and the job is not on hold now.
--     Release does not restart the 365 days. Anything unclear keeps ALL records of the job (safe side):
--       more than one cycle, a release without a preceding hold (orphan), more than 100 records, two records with the same decided_at,
--       the job currently on hold, or no records.
-- Concurrency: the job's L row is locked first (the hold function updates that row, so a new hold/release waits); the caller passes the
--   job's detail_version seen in the candidate list and a changed version is skipped.
-- Manual only. Input: 1..100 items {job_id, row_version}, approval reference and operator; any bad item rejects the whole call.
-- A call removes at most 100 records in total; a job that would exceed the total is skipped whole (over_limit), never partly removed.
-- Nothing here touches R, L rows, reports or images.
begin;
do $pre$
begin
  if to_regclass('yt_private.detail_hold_events') is null or to_regclass('yt_private.detail_compaction_runs') is null
     or to_regclass('yt_private.report_purge_runs') is null or to_regprocedure('public.yt_deletion_detail_hold(uuid,boolean,text,text)') is null then
    raise exception 'apply deletion_u1_detail_compact.sql and report_purge_prepare.sql first';
  end if;
end
$pre$;

-- The classification of one job's hold records (shared by the candidate list and the deletion).
create or replace function yt_private.hold_events_status(p_job uuid, p_now timestamptz,
  out status text, out records integer, out cycle_start timestamptz)
  language plpgsql stable set search_path = '' as $$
declare v_held boolean; v_first boolean; v_releases integer; v_last boolean; v_dupes integer; v_order_ok boolean;
begin
  select count(*), min(e.decided_at) into records, cycle_start from yt_private.detail_hold_events e where e.job_id = p_job;
  if records = 0 then status := 'no_records'; return; end if;
  select j.detail_hold into v_held from yt_private.account_deletion_jobs j where j.id = p_job;
  if v_held is null then status := 'no_job'; return; end if;
  if v_held then status := 'held'; return; end if;
  if records > 100 then status := 'too_many_records'; return; end if;
  select count(*) - count(distinct e.decided_at) into v_dupes from yt_private.detail_hold_events e where e.job_id = p_job;
  if v_dupes > 0 then status := 'same_time'; return; end if;
  -- id order and time order must agree (otherwise the order of records is not clear)
  select bool_and(x.ok) into v_order_ok from (
    select (lag(e.decided_at) over (order by e.id) is null or lag(e.decided_at) over (order by e.id) < e.decided_at) as ok
      from yt_private.detail_hold_events e where e.job_id = p_job) x;
  if not v_order_ok then status := 'same_time'; return; end if;
  select e.hold into v_first from yt_private.detail_hold_events e where e.job_id = p_job order by e.decided_at, e.id limit 1;
  if not v_first then status := 'orphan_release'; return; end if;
  select count(*) filter (where not e.hold) into v_releases from yt_private.detail_hold_events e where e.job_id = p_job;
  select e.hold into v_last from yt_private.detail_hold_events e where e.job_id = p_job order by e.decided_at desc, e.id desc limit 1;
  if v_releases <> 1 or v_last then status := 'multiple_cycles'; return; end if;   -- exactly one release, and it is the last record
  if not (cycle_start + interval '365 days' < p_now) then status := 'not_due'; return; end if;
  status := 'eligible';
end
$$;
revoke all on function yt_private.hold_events_status(uuid, timestamptz) from public, anon, authenticated;

-- Read-only candidates (no free text is returned).
create or replace function public.yt_audit_retention_candidates()
  returns table(table_name text, job_id uuid, row_version bigint, records integer, oldest timestamptz, status text)
  language sql stable security definer set search_path = '' as $$
  select 'report_purge_runs', null::uuid, null::bigint, count(*)::integer, min(executed_at),
         'past_365_days: ' || count(*) filter (where executed_at + interval '365 days' < now())
    from yt_private.report_purge_runs
  union all
  select 'detail_compaction_runs', null, null, count(*)::integer, min(executed_at),
         'past_365_days: ' || count(*) filter (where executed_at + interval '365 days' < now())
    from yt_private.detail_compaction_runs
  union all
  select 'detail_hold_events', j.id, j.detail_version, s.records, s.cycle_start, s.status
    from (select distinct e.job_id from yt_private.detail_hold_events e) d
    join yt_private.account_deletion_jobs j on j.id = d.job_id
    cross join lateral yt_private.hold_events_status(j.id, now()) s
$$;

create or replace function public.yt_audit_purge_hold_events(p_items jsonb, p_approval_ref text, p_by text)
  returns table(job_id uuid, result text, detail text, removed integer)
  language plpgsql security definer set search_path = '' as $$
declare
  it jsonb; v_raw jsonb; v_id uuid; v_ver bigint; v_ids uuid[] := '{}'; v_vers bigint[] := '{}'; i integer;
  v_now timestamptz := now(); v_total integer := 0; v_cur_ver bigint; s record; v_n integer;
begin
  if coalesce(btrim(p_approval_ref), '') = '' or char_length(p_approval_ref) > 200 then raise exception 'approval reference (1-200 characters) is required'; end if;
  if coalesce(btrim(p_by), '') = '' or char_length(p_by) > 100 then raise exception 'operator (1-100 characters) is required'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then raise exception 'p_items must be a JSON array'; end if;
  if jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 100 then raise exception 'p_items must hold 1 to 100 items'; end if;
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

  -- Lock the jobs' L rows in id order: a concurrent hold/release (which updates the same row) waits or makes us see a new version.
  perform 1 from yt_private.account_deletion_jobs j where j.id = any(v_ids) order by j.id for update;

  for i in select ord from unnest(v_ids) with ordinality u(v, ord) order by v loop
    v_id := v_ids[i]; v_ver := v_vers[i]; job_id := v_id; detail := null; removed := 0;
    select j.detail_version into v_cur_ver from yt_private.account_deletion_jobs j where j.id = v_id;
    if not found then result := 'missing'; return next; continue; end if;
    if v_cur_ver is distinct from v_ver then result := 'skipped_changed'; return next; continue; end if;
    select * into s from yt_private.hold_events_status(v_id, v_now);
    if s.status <> 'eligible' then result := 'not_eligible'; detail := s.status; return next; continue; end if;
    if v_total + s.records > 100 then result := 'over_limit'; detail := 'total would exceed 100'; return next; continue; end if;
    delete from yt_private.detail_hold_events e where e.job_id = v_id;
    get diagnostics v_n = row_count;
    if v_n <> s.records then raise exception 'records changed under lock'; end if;
    v_total := v_total + v_n; removed := v_n; result := 'deleted'; return next;
  end loop;
end
$$;

do $svc$
declare f text;
begin
  foreach f in array array['public.yt_audit_retention_candidates()','public.yt_audit_purge_hold_events(jsonb,text,text)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end
$svc$;
commit;
