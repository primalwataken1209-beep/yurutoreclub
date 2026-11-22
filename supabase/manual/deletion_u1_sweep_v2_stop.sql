-- REVIEWED STOP ONLY. Not applied anywhere. Stops NEW v2 sweeps: nobody among public/anon/authenticated/service_role can begin one.
-- A v2 sweep already running keeps its lease until it finishes (or the lease expires); its alive/finish calls still work so that it can
-- record and release. A removal request it already sent cannot be cancelled. The owner and superusers can still call the function.
-- Kept: all functions, the column, the job log, R and L. Deleted files are not restored by this or any step.
begin;
revoke all on function public.yt_deletion_sweep_begin(uuid, text, integer) from public, anon, authenticated, service_role;
commit;
