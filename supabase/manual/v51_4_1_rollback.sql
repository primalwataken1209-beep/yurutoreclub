-- ═══════════════════════════════════════════════════════════════════════════
-- ゆるトレ倶楽部 v51.4.1 — ロールバック（v51.3 の状態へ戻す）
--   supabase/manual/v51_4_1_rollback.sql
--
--   ※ migrations フォルダには入れていません（`supabase db push` で誤って流れないように）。
--   ※ 戻すのは v51.4 / v51.4.1 で変更したものだけです：
--        profiles / comments / post_reactions / follows の SELECT ポリシー
--        comments / post_reactions の INSERT ポリシー
--        追加した VIEW（public_profiles）と 関数（yt_follow_counts）
--   ※ posts / blocks / reports / storage.objects / バケット / Edge Function /
--     v51.2 の image_path 関連・テーブル定義・既存データには一切触れません。
--   ※ アプリ側（index.html）は v51.4.1 のままでも動きます
--     （VIEW と関数が無いときは自動的に従来の取得方法へ戻ります）。
-- ═══════════════════════════════════════════════════════════════════════════

begin;

-- 1. profiles の SELECT を v43（＝v51.3の状態）へ
drop policy if exists "profiles: read own or public" on public.profiles;
drop policy if exists "profiles: read for authenticated" on public.profiles;
create policy "profiles: read for authenticated" on public.profiles
  for select to authenticated using (true);

-- 2. comments の SELECT を v43 へ
drop policy if exists "comments: read visible posts" on public.comments;
drop policy if exists "comments: read alive" on public.comments;
create policy "comments: read alive" on public.comments
  for select to authenticated using (is_deleted = false or user_id = auth.uid());

-- 3. comments の INSERT を v43（本人チェックのみ）へ  ← v51.4.1 で変更した分
drop policy if exists "comments: insert own" on public.comments;
create policy "comments: insert own" on public.comments
  for insert to authenticated with check (user_id = auth.uid());

-- 4. post_reactions の SELECT を v43 へ
drop policy if exists "reactions: read visible posts" on public.post_reactions;
drop policy if exists "reactions: read for authenticated" on public.post_reactions;
create policy "reactions: read for authenticated" on public.post_reactions
  for select to authenticated using (true);

-- 5. post_reactions の INSERT を v43（本人チェックのみ）へ  ← v51.4.1 で変更した分
drop policy if exists "reactions: insert own" on public.post_reactions;
create policy "reactions: insert own" on public.post_reactions
  for insert to authenticated with check (user_id = auth.uid());

-- 6. follows の SELECT を v43 へ
drop policy if exists "follows: read own" on public.follows;
drop policy if exists "follows: read for authenticated" on public.follows;
create policy "follows: read for authenticated" on public.follows
  for select to authenticated using (true);

-- 7. v51.4 で追加した VIEW・関数を削除
drop view if exists public.public_profiles;
drop function if exists public.yt_follow_counts(uuid);

commit;

-- 確認：v43（v51.3）と同じポリシー構成に戻っていること
select tablename, policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('profiles','comments','post_reactions','follows')
order by tablename, cmd, policyname;
