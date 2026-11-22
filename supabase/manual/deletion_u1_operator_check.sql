-- REVIEWED DRAFT ONLY. Not applied to any hosted Supabase project.
-- Operator check for delete-account: a function that only service_role may execute. delete-account calls it with the caller's own token
-- (through PostgREST); it returns true only when the platform has verified that token as service_role. It reads and changes nothing.
-- SECURITY INVOKER (stated explicitly; never SECURITY DEFINER): the caller's role is what is being checked.
begin;
create or replace function public.yt_deletion_operator_check() returns boolean
  language sql stable security invoker set search_path = '' as $$ select true $$;
revoke all on function public.yt_deletion_operator_check() from public, anon, authenticated;
grant execute on function public.yt_deletion_operator_check() to service_role;
commit;
