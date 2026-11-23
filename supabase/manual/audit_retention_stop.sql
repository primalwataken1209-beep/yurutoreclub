-- REVIEWED STOP ONLY. Not applied anywhere. Stops deletion of hold records: EXECUTE is removed from public, anon, authenticated and
-- service_role. The candidate list stays readable for service_role.
-- Not stopped: a call already running finishes or rolls back on its own; the owner and superusers can still call it.
-- Deleted hold records are not restored by this or any step. Execution records (report_purge_runs, detail_compaction_runs) have no
-- deletion function in this draft.
begin;
revoke all on function public.yt_audit_purge_hold_events(jsonb, text, text) from public, anon, authenticated, service_role;
commit;
