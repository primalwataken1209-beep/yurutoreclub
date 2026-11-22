-- REVIEWED STOP ONLY. Not applied anywhere. Stops new compactions and hold changes: EXECUTE is removed from public, anon, authenticated
-- and service_role for the compaction and hold functions. The candidate list stays readable for service_role.
-- Not stopped: a compaction call already running finishes or rolls back on its own; the owner and superusers can still call the functions;
-- the version/activity trigger keeps counting (it changes no detail). Compacted logs are not restored by this or any step. R and L rows are kept.
begin;
revoke all on function public.yt_deletion_compact_detail(jsonb, text, text) from public, anon, authenticated, service_role;
revoke all on function public.yt_deletion_detail_hold(uuid, boolean, text, text) from public, anon, authenticated, service_role;
commit;
