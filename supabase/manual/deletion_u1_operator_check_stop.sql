-- REVIEWED STOP ONLY. Not applied anywhere. Removes the operator check's EXECUTE from service_role too: delete-account then accepts
-- only the byte-identical runtime key as the operator (the behaviour of ce97a44). Nothing else changes; no data is touched.
begin;
revoke all on function public.yt_deletion_operator_check() from public, anon, authenticated, service_role;
commit;
