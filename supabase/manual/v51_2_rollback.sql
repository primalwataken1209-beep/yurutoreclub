-- ═══════════════════════════════════════════════════════════════════════════
-- ゆるトレ倶楽部 v51.2 — ロールバック用SQL（必要なときだけ手動で実行）
--   supabase/manual/v51_2_rollback.sql
--
--   ※ migrations フォルダには入れていません（`supabase db push` で誤って流れないように）。
--   ※ 既存の posts / avatars のポリシーには触れません。
--
-- 手順A（推奨）：アプリを v51.1 に戻す＋写真の閲覧・投稿だけ止める
--   → 下の「A」だけを実行。posts.image_path 列は残しても v51.1 は影響を受けません。
-- 手順B（完全撤去）：A を実行し、Storage の画像を削除したあとで「B」を実行。
-- ═══════════════════════════════════════════════════════════════════════════

-- ── A. post-images の Storage ポリシーを外す（画像の新規投稿・閲覧・削除が止まる）
drop policy if exists "post-images: insert own folder" on storage.objects;
drop policy if exists "post-images: read visible"      on storage.objects;
drop policy if exists "post-images: delete own"        on storage.objects;

-- ── B. 完全撤去（任意・データが消えます）
--   1) 先に Supabase ダッシュボード → Storage → post-images → すべてのファイルを削除
--      （Supabase は SQL での storage.objects 直接削除を推奨していません）
--   2) バケットを削除：Dashboard → Storage → post-images → Delete bucket
--   3) 列を削除する場合のみ、次の3行のコメントを外して実行
-- drop index if exists public.posts_image_path_uniq;
-- alter table public.posts drop constraint if exists posts_image_path_valid;
-- alter table public.posts drop column if exists image_path;
