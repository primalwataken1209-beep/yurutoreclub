-- REVIEWED ROLLBACK ONLY. Not applied anywhere. Puts back the transaction-id drain of deletion_u1_prepare.sql (6034394).
-- This is the WEAKER rule (see the header of deletion_u1_drain_capture.sql): keep new deletions stopped while it is in place.
-- Kept on purpose: the captured rows (deletion_drain_waits), drain_captured_at, the view, R and L. Nothing is deleted.
begin;
create or replace function public.yt_deletion_drain_mark(p_job uuid) returns bigint
  language plpgsql security definer set search_path = '' as $$
declare v bigint;
begin
  update yt_private.account_deletion_jobs
     set drain_xmax = (pg_snapshot_xmax(pg_current_snapshot()))::text::bigint
   where id = p_job and drain_xmax is null;
  select drain_xmax into v from yt_private.account_deletion_jobs where id = p_job;
  if v is null then raise exception 'job not found'; end if;
  return v;
end
$$;
create or replace function public.yt_deletion_drained(p_job uuid) returns boolean
  language sql stable security definer set search_path = '' as $$
  select j.drain_xmax is not null and (pg_snapshot_xmin(pg_current_snapshot()))::text::bigint >= j.drain_xmax
    from yt_private.account_deletion_jobs j where j.id = p_job
$$;
revoke all on function public.yt_deletion_drain_mark(uuid) from public, anon, authenticated;
revoke all on function public.yt_deletion_drained(uuid) from public, anon, authenticated;
grant execute on function public.yt_deletion_drain_mark(uuid) to service_role;
grant execute on function public.yt_deletion_drained(uuid) to service_role;
commit;
