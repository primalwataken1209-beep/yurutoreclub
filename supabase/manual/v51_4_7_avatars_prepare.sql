-- REVIEWED PREPARATION ONLY. Not applied to any hosted Supabase project.
-- New-bucket path only: abort if avatars already exists. Execute only after separate production approval.
-- No object/file deletion, no profile updates, no changes to post-images or existing grants.
begin;
do $preflight$
begin
  if exists(select 1 from storage.buckets where id='avatars') then
    raise exception 'avatars already exists; inspect its configuration instead of overwriting it';
  end if;
  if not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='storage' and c.relname='objects' and c.relrowsecurity) then
    raise exception 'storage.objects RLS must already be enabled';
  end if;
  if not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname='profiles' and c.relrowsecurity) then
    raise exception 'profiles RLS must already be enabled';
  end if;
end
$preflight$;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('avatars','avatars',false,3145728,array['image/jpeg']);
create policy "yt v51.4.7 avatars read" on storage.objects
  for select to authenticated using(
    bucket_id='avatars' and (
      name=(select auth.uid())::text||'/avatar.jpg' or exists(
        select 1 from public.profiles pr where pr.is_public=true and objects.name=pr.id::text||'/avatar.jpg'
      )
    )
  );
create policy "yt v51.4.7 avatars insert" on storage.objects
  for insert to authenticated with check(bucket_id='avatars' and name=(select auth.uid())::text||'/avatar.jpg');
create policy "yt v51.4.7 avatars update" on storage.objects
  for update to authenticated using(bucket_id='avatars' and name=(select auth.uid())::text||'/avatar.jpg')
  with check(bucket_id='avatars' and name=(select auth.uid())::text||'/avatar.jpg');
create policy "yt v51.4.7 avatars delete" on storage.objects
  for delete to authenticated using(bucket_id='avatars' and name=(select auth.uid())::text||'/avatar.jpg');
-- Restrictive guards remain effective even if a broad permissive policy exists.
create policy "yt v51.4.7 avatars read limit" on storage.objects as restrictive
  for select to authenticated using(
    bucket_id is distinct from 'avatars' or (
      name=(select auth.uid())::text||'/avatar.jpg' or exists(
        select 1 from public.profiles pr where pr.is_public=true and objects.name=pr.id::text||'/avatar.jpg'
      )
    )
  );
create policy "yt v51.4.7 avatars anon limit" on storage.objects as restrictive
  for select to anon using(bucket_id is distinct from 'avatars');
create policy "yt v51.4.7 avatars insert limit" on storage.objects as restrictive
  for insert to anon,authenticated with check(
    bucket_id is distinct from 'avatars' or name=(select auth.uid())::text||'/avatar.jpg');
create policy "yt v51.4.7 avatars update limit" on storage.objects as restrictive
  for update to anon,authenticated using(
    bucket_id is distinct from 'avatars' or name=(select auth.uid())::text||'/avatar.jpg')
  with check(bucket_id is distinct from 'avatars' or name=(select auth.uid())::text||'/avatar.jpg');
create policy "yt v51.4.7 avatars delete limit" on storage.objects as restrictive
  for delete to anon,authenticated using(
    bucket_id is distinct from 'avatars' or name=(select auth.uid())::text||'/avatar.jpg');
commit;
