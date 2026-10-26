-- ONLY yurutore-club-staging / knftduojdalnawvkbelt.
-- Respect the caller's profiles RLS through the public profile view.
alter view public.public_profiles set (security_invoker=true);
alter function public.set_updated_at() set search_path = '';
-- Trigger execution remains available; the trigger function is not an RPC.
revoke execute on function public.handle_new_user() from public,anon,authenticated;
-- yt_follow_counts intentionally exposes only aggregate counts after checking
-- auth.uid() and target profile visibility. Keep its existing authenticated grant.
