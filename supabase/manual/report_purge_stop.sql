-- REVIEWED STOP ONLY. Not applied anywhere. Stops ONLY the new purge function by removing EXECUTE from public, anon,
-- authenticated and service_role (the roles the app and the operator use).
-- Limits: the function's owner and superusers can still run it (an owner's rights are not removed by REVOKE), and a call already
-- running when this is applied is not interrupted (it finishes or rolls back on its own).
-- Kept: the function definition (for review), the run records, every other report function, privileges, R and L guards.
-- Deleted reports are not restored by this or any step.
begin;
revoke all on function public.yt_report_purge(jsonb, text, text) from public, anon, authenticated, service_role;
commit;
