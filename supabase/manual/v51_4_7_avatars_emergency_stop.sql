-- EMERGENCY ACCESS STOP ONLY; separate approval required. Preserves files, references and bucket privacy.
-- This is not a database snapshot restore and does not roll back legitimate user deletions.
begin;
do $preflight$
begin
  if not exists(select 1 from storage.buckets where id='avatars' and public=false) then
    raise exception 'Expected private avatars bucket; stop and inspect';
  end if;
end
$preflight$;
create policy "yt v51.4.7 avatars emergency stop" on storage.objects as restrictive
  for all to anon,authenticated
  using(bucket_id is distinct from 'avatars')
  with check(bucket_id is distinct from 'avatars');
commit;
