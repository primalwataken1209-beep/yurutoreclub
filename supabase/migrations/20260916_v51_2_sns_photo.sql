-- ═══════════════════════════════════════════════════════════════════════════
-- ゆるトレ倶楽部 v51.2 — SNS投稿写真（1投稿につき最大1枚）
--   20260916_v51_2_sns_photo.sql
--
-- 【実行方法】
--   Supabase ダッシュボード → SQL Editor に貼り付けて 1回実行してください。
--   （Supabase CLI の場合は supabase/migrations/ に置いて `supabase db push`）
--   ※ 実行前に README_v51_2_sns_photo.md の「本番適用手順」を必ず読んでください。
--
-- 【安全性】
--   ・何度実行しても同じ結果になります（冪等）。
--   ・既存の posts / profiles / comments / post_reactions / follows / reports /
--     blocks / avatars バケットのデータは一切変更・削除しません。
--   ・既存の posts の RLS ポリシー（SELECT / INSERT / UPDATE / DELETE）には
--     一切触れません（drop も create もしません）。
--   ・RLS を無効化する文はありません。
--   ・service_role key は不要です（SQL Editor の実行権限だけで完結します）。
--
-- 【作るもの】
--   1. public.posts.image_path（text, NULL可）… Storage 内の object path だけを保存
--      ・公開URLは保存しない（private bucket のため。表示時に署名付きURLを発行する）
--      ・形式チェック：{投稿者のuser_id}/{uuid}.jpg 以外は保存できない
--        → 他人のフォルダの画像を自分の投稿に紐付けることはできない
--   2. Storage bucket「post-images」… private（public = false）
--      ・1ファイル 3MB まで / image/jpeg のみ（SVG・HTML 等は保存できない）
--   3. storage.objects の RLS ポリシー（post-images バケット専用）
--      INSERT … 本人のUIDフォルダへだけ
--      SELECT … 本人の画像 ／ 他人の画像は「その画像を使った投稿が
--               削除されておらず、投稿者が公開アカウント」の場合だけ
--               （さらに posts 自身の SELECT RLS も必ず通る）
--      DELETE … 本人のUIDフォルダの画像だけ
--      UPDATE … ポリシーを作らない（上書き・移動は不可）
-- ═══════════════════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────────────────
-- 1. posts.image_path
-- ───────────────────────────────────────────────────────────────────────────
alter table public.posts add column if not exists image_path text;

-- 形式チェック。既存行はすべて image_path = NULL なので、既存データは必ず通る。
alter table public.posts drop constraint if exists posts_image_path_valid;
alter table public.posts add constraint posts_image_path_valid check (
  image_path is null
  or (
    image_path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$'
    and split_part(image_path, '/', 1) = user_id::text
  )
);

-- 1枚の画像を複数の投稿で使い回せないようにする（兼：Storage RLS の検索用インデックス）
create unique index if not exists posts_image_path_uniq
  on public.posts (image_path) where image_path is not null;


-- ───────────────────────────────────────────────────────────────────────────
-- 2. Storage bucket: post-images（private）
--    public = false … URLを知っているだけでは取得できない。
--    表示はアプリが createSignedUrls で発行する期限付きURL（1時間）で行う。
-- ───────────────────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('post-images', 'post-images', false, 3145728, array['image/jpeg'])
on conflict (id) do update
  set public             = false,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;


-- ───────────────────────────────────────────────────────────────────────────
-- 3. storage.objects の RLS（post-images 専用）
--    storage.objects の RLS は Supabase 標準で有効です（ここでは変更しません）。
--    avatars など他バケットのポリシーには触れません。
-- ───────────────────────────────────────────────────────────────────────────

-- INSERT：本人のUIDフォルダ直下に {uuid}.jpg だけ
drop policy if exists "post-images: insert own folder" on storage.objects;
create policy "post-images: insert own folder" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'post-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$'
  );

-- SELECT：
--   (a) 本人のフォルダの画像 … 常に見られる（自分の非公開投稿の画像も含む）
--   (b) 他人の画像 … 次の全部を満たすときだけ
--        ・その画像を image_path に持つ投稿が存在し
--        ・投稿者 = 画像フォルダの持ち主
--        ・投稿が削除されていない（is_deleted = false）
--        ・投稿者の profiles.is_public = true
--      このサブクエリ自体も posts / profiles の RLS を通るため、
--      「投稿が見えない人には画像も見えない」が二重に保証される。
--   ※ 署名付きURLの発行（createSignedUrls）もこの SELECT 判定を通ります。
drop policy if exists "post-images: read visible" on storage.objects;
create policy "post-images: read visible" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'post-images'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or exists (
        select 1
        from public.posts p
        join public.profiles pr on pr.id = p.user_id
        where p.image_path = objects.name
          and p.user_id::text = (storage.foldername(objects.name))[1]
          and p.is_deleted = false
          and pr.is_public = true
      )
    )
  );

-- DELETE：本人のフォルダの画像だけ
drop policy if exists "post-images: delete own" on storage.objects;
create policy "post-images: delete own" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'post-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- UPDATE：ポリシーを作らない（＝誰も上書き・移動できない）。
-- 過去に作られた可能性のあるものは念のため落としておく（post-images 用の名前のみ）。
drop policy if exists "post-images: update own" on storage.objects;

-- anon（未ログイン）向けのポリシーは作らない。


-- ═══════════════════════════════════════════════════════════════════════════
-- 完了。
--   ・既存投稿は image_path = NULL のまま、今まで通り表示されます
--   ・アカウント削除時に投稿画像も消すには、
--     supabase/functions/delete-account を再 deploy してください（README参照）
-- ═══════════════════════════════════════════════════════════════════════════
