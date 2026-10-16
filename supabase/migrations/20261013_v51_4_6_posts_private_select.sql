-- ═══════════════════════════════════════════════════════════════════════════
-- ゆるトレ倶楽部 v51.4.6 — posts の閲覧(SELECT)ポリシーをリポジトリで明示する
--   20261013_v51_4_6_posts_private_select.sql
--
-- 【背景（Codexレビュー P1）】
--   リポジトリ上の posts の SELECT ポリシーは v43 の "posts: read alive"
--     using (is_deleted = false or user_id = auth.uid())
--   だけで、投稿者が非公開アカウントかどうかを見ていない。
--   v51.4.1 の comments / post_reactions、v51.2 の post-images は
--   「その投稿が見えるか」を posts の RLS に任せているため、
--   posts が上記のままだと非公開アカウントの投稿・コメント・リアクション・写真が
--   ログインユーザー全員から取得できる。
--   本番の posts ポリシーはリポジトリに記録が無く未確認のため、ここで明示的に定義する。
--
-- 【実行前に必ず】
--   supabase/manual/v51_4_6_verify_readonly.sql の「適用前」を実行し、
--   結果（posts の現在のポリシー名と条件）を保存・共有してください。
--   このファイルは本番へ自動適用されません。確認後に SQL Editor で手動実行します。
--
-- 【変更するもの】
--   posts … SELECT ポリシーのみ
--     変更後: 自分の投稿（削除済みを含む）
--             または「削除されていない かつ 投稿者の profiles.is_public = true」の投稿
--
-- 【触らないもの】
--   posts の INSERT / UPDATE / DELETE ポリシー、他テーブル、Storage、データ、テーブル定義
--
-- 【安全性】
--   ・1トランザクション。最後に「想定外の SELECT/ALL ポリシーが posts に残っていないか」を
--     検査し、残っていれば例外で全体をロールバック（DBは変更されない）。
--     本番に別名のポリシーがある場合はここで止まるので、内容を確認してから相談してください。
--   ・profiles の SELECT ポリシー（v51.4.1: 自分 or 公開）は posts を参照しないため、
--     posts → profiles の参照で循環（infinite recursion）は起きない。
--   ・冪等（何度実行しても同じ結果）。
-- ═══════════════════════════════════════════════════════════════════════════

begin;

drop policy if exists "posts: read alive"          on public.posts;
drop policy if exists "posts: read own or public"  on public.posts;
create policy "posts: read own or public" on public.posts
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (
      is_deleted = false
      and exists (
        select 1 from public.profiles pr
        where pr.id = posts.user_id
          and pr.is_public = true
      )
    )
  );

-- 最終検査：今回作ったもの以外の SELECT / ALL ポリシーが posts に残っていないか
-- （許可ポリシーは OR で合成されるため、緩いポリシーが1つでも残ると無効になる）
do $$
declare
  r record;
  extra text := '';
begin
  for r in
    select policyname, cmd
      from pg_policies
     where schemaname = 'public'
       and tablename = 'posts'
       and cmd in ('SELECT','ALL')
       and policyname <> 'posts: read own or public'
  loop
    extra := extra || format('posts.「%s」(%s) / ', r.policyname, r.cmd);
  end loop;
  if extra <> '' then
    raise exception 'v51.4.6: posts に想定外のポリシーが残っているため中止しました → %  （内容を確認してからご相談ください。DBは変更されていません）', extra;
  end if;
end $$;

commit;
