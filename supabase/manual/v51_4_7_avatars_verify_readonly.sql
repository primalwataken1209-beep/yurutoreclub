-- Read-only inventory; does not prove Storage HTTP behavior. Run only against the intended project.
select id,public,file_size_limit,allowed_mime_types from storage.buckets where id in ('avatars','post-images');
select policyname,permissive,roles,cmd,qual,with_check from pg_policies
where schemaname='storage' and tablename='objects' order by policyname;
select c.relname,c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace
where (n.nspname='storage' and c.relname='objects') or (n.nspname='public' and c.relname='profiles');
select count(*) as post_images from storage.objects where bucket_id='post-images';
select count(*) as avatars from storage.objects where bucket_id='avatars';
select grantee,privilege_type from information_schema.role_table_grants
where table_schema='storage' and table_name='objects' and grantee in ('anon','authenticated');
