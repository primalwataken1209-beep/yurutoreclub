-- ═══════════════════════════════════════════════════════════════════════════
-- v51.4.6 ロールバック：posts の SELECT ポリシーを v43（リポジトリ記載）の状態へ戻す
--
-- 【注意】
--   これは「リポジトリに記録されている v43 の定義」に戻します。
--   適用前の本番が別の定義だった場合は、v51_4_6_verify_readonly.sql の
--   「適用前」の結果（qual）をもとに元の定義へ戻してください。
--   v43 の定義は非公開アカウントの投稿を保護しません。
-- ═══════════════════════════════════════════════════════════════════════════
begin;
drop policy if exists "posts: read own or public" on public.posts;
drop policy if exists "posts: read alive"         on public.posts;
create policy "posts: read alive" on public.posts
  for select to authenticated using (is_deleted = false or user_id = auth.uid());
commit;
