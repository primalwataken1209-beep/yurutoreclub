-- REVIEWED DRAFT ONLY. Not applied to any hosted Supabase project. Requires report_retention_prepare.sql (8327150) first.
-- Conditional deletion of closed reports whose retention has passed, for an explicit, limited list chosen by the operator.
-- Spec: store-candidate-20261105/deletion-completion-and-purge-plan-20261121.txt, section 2.
--   * Input: a JSON array of 1..100 objects, each exactly {"id": "<uuid>", "row_version": <integer >= 0>}, plus an approval reference
--     and the operator's name. Duplicates, extra keys or any malformed item reject the whole call (nothing is deleted).
--     No "all rows" form, no filter: only the listed ids can ever be touched.
--   * Time: the database's own now() (transaction start). The caller cannot pass a time.
--   * In ONE transaction: lock the listed rows in id order, then for each id (in id order) compare row_version, re-evaluate
--     yt_private.report_deletable(row, now()) and DELETE only that row, with the version re-checked in the DELETE itself.
--     Nothing decided by an earlier candidate list or re-check call is reused.
--   * Result per id: deleted / skipped_changed / skipped_held_or_open / missing. skipped_held_or_open means report_deletable is false
--     now (open, on hold, legacy review required, no completion date, or retention not yet passed); `detail` says which.
--   * A database error anywhere rolls back the whole call (no partial deletion).
--   * One run record: approval reference, operator, time and counts only. No report text, no ids, no e-mail, no image URLs.
--   * service_role only. Existing privileges, R/L guards and report functions are not changed.
-- Not included: any scheduler or automatic purge; deletion of R (deletion_refusals) or L (account_deletion_jobs).
begin;
do $pre$
begin
  if to_regprocedure('yt_private.report_deletable(public.reports,timestamptz)') is null
     or to_regclass('yt_private.report_retention_settings') is null then
    raise exception 'apply report_retention_prepare.sql first';
  end if;
end
$pre$;

create table if not exists yt_private.report_purge_runs(
  id                    bigserial primary key,
  approval_ref          text not null check (char_length(approval_ref) between 1 and 200),
  executed_by           text not null check (char_length(executed_by) between 1 and 100),
  executed_at           timestamptz not null default now(),
  requested             integer not null check (requested between 1 and 100),
  deleted               integer not null check (deleted >= 0),
  skipped_changed       integer not null check (skipped_changed >= 0),
  skipped_held_or_open  integer not null check (skipped_held_or_open >= 0),
  missing               integer not null check (missing >= 0)
);
revoke all on yt_private.report_purge_runs from public, anon, authenticated;
revoke all on sequence yt_private.report_purge_runs_id_seq from public, anon, authenticated;

create or replace function public.yt_report_purge(p_items jsonb, p_approval_ref text, p_by text)
  returns table(id uuid, result text, detail text)
  language plpgsql security definer set search_path = '' as $$
declare
  it jsonb; v_raw jsonb; v_id uuid; v_ver bigint;
  v_ids uuid[] := '{}'; v_vers bigint[] := '{}';
  v_now timestamptz := now();
  r public.reports; i integer;
  n_del integer := 0; n_chg integer := 0; n_held integer := 0; n_miss integer := 0;
begin
  if coalesce(btrim(p_approval_ref), '') = '' or char_length(p_approval_ref) > 200 then raise exception 'approval reference (1-200 characters) is required'; end if;
  if coalesce(btrim(p_by), '') = '' or char_length(p_by) > 100 then raise exception 'operator (1-100 characters) is required'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then raise exception 'p_items must be a JSON array'; end if;
  if jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 100 then raise exception 'p_items must hold 1 to 100 items'; end if;
  for it in select * from jsonb_array_elements(p_items) loop
    if jsonb_typeof(it) <> 'object' or (select count(*) from jsonb_object_keys(it)) <> 2
       or not (it ? 'id' and it ? 'row_version') then raise exception 'each item must be exactly {id, row_version}'; end if;
    if jsonb_typeof(it -> 'id') <> 'string'
       or (it ->> 'id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'invalid id'; end if;
    v_raw := it -> 'row_version';
    if jsonb_typeof(v_raw) <> 'number' or (v_raw #>> '{}') !~ '^[0-9]{1,18}$' then raise exception 'invalid row_version'; end if;
    v_id := (it ->> 'id')::uuid; v_ver := (v_raw #>> '{}')::bigint;
    if v_id = any(v_ids) then raise exception 'duplicate id'; end if;
    v_ids := v_ids || v_id; v_vers := v_vers || v_ver;
  end loop;

  -- Lock every listed row that exists, in id order (one statement; rows are locked in the order returned).
  perform 1 from public.reports x where x.id = any(v_ids) order by x.id for update;

  for i in select ord from unnest(v_ids) with ordinality u(v, ord) order by v loop
    v_id := v_ids[i]; v_ver := v_vers[i]; id := v_id;
    select * into r from public.reports x where x.id = v_id;
    if not found then result := 'missing'; detail := null; n_miss := n_miss + 1; return next; continue; end if;
    if r.row_version is distinct from v_ver then result := 'skipped_changed'; detail := null; n_chg := n_chg + 1; return next; continue; end if;
    if yt_private.report_deletable(r, v_now) is not true then
      result := 'skipped_held_or_open';
      detail := case when r.status = 'open' then 'open'
                     when r.retention_hold then 'hold'
                     when r.legacy_review_required then 'legacy_review_required'
                     when r.closed_at is null then 'no_closed_at'
                     else 'retention_not_passed' end;
      n_held := n_held + 1; return next; continue;
    end if;
    delete from public.reports x where x.id = v_id and x.row_version = v_ver;
    if not found then raise exception 'row changed under lock'; end if;   -- cannot happen while locked; fail the whole call if it does
    result := 'deleted'; detail := null; n_del := n_del + 1; return next;
  end loop;

  insert into yt_private.report_purge_runs(approval_ref, executed_by, executed_at, requested, deleted, skipped_changed, skipped_held_or_open, missing)
    values (p_approval_ref, p_by, v_now, cardinality(v_ids), n_del, n_chg, n_held, n_miss);
end
$$;
revoke all on function public.yt_report_purge(jsonb, text, text) from public, anon, authenticated;
grant execute on function public.yt_report_purge(jsonb, text, text) to service_role;
commit;
