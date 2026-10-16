-- ═══════════════════════════════════════════════════════════════════════════
-- ゆるトレ倶楽部 v51.2 — 本番確認用SQL（読み取りのみ・何も変更しません）
--   supabase/manual/v51_2_verify_readonly.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- ① 【適用前に必ず確認】posts の現在の RLS ポリシー
--    SELECT の qual に「user_id = auth.uid()」または
--    「is_deleted = false かつ profiles.is_public = true」の考え方が入っていること。
select policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public' and tablename = 'posts'
order by cmd, policyname;

-- ② posts の RLS が有効か（relrowsecurity = true であること）
select relname, relrowsecurity from pg_class
where oid = 'public.posts'::regclass;

-- ③ 【適用後】image_path 列と制約
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'posts' and column_name = 'image_path';
select conname, pg_get_constraintdef(oid)
from pg_constraint where conrelid = 'public.posts'::regclass and conname = 'posts_image_path_valid';

-- ④ 【適用後】バケット設定（public = false / 3145728 / {image/jpeg} であること）
select id, public, file_size_limit, allowed_mime_types
from storage.buckets where id = 'post-images';

-- ⑤ 【適用後】post-images のポリシー（insert / select / delete の3件だけ。update は無いこと）
select policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'storage' and tablename = 'objects' and policyname like 'post-images:%'
order by cmd;

-- ⑥ 【運用】置き去り画像（生きている投稿から参照されていない画像）の一覧
--    削除は Dashboard の Storage 画面から行ってください。
select o.name, o.created_at
from storage.objects o
where o.bucket_id = 'post-images'
  and o.created_at < now() - interval '1 day'
  and not exists (
    select 1 from public.posts p
    where p.image_path = o.name and p.is_deleted = false
  )
order by o.created_at;
