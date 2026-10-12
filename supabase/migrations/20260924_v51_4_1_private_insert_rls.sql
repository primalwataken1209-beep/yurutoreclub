-- ═══════════════════════════════════════════════════════════════════════════
-- ゆるトレ倶楽部 v51.4.1 — 非公開アカウントのプライバシー強化（RLS）【最終版】
--   20260924_v51_4_1_private_insert_rls.sql
--
--   このファイル1本で「v51.4 の変更 ＋ v51.4.1 の INSERT 制限」がすべて適用されます。
--   （v51.4 の migration は同梱していません。実行するのはこのファイルだけです）
--
-- 【実行方法】
--   Supabase ダッシュボード → SQL Editor に全文を貼り付けて1回実行。
--   ※ 実行前に supabase/manual/v51_4_verify_readonly.sql の「適用前」を必ず実行し、
--     現在のポリシー名を確認してください（README §6）。
--
-- 【この migration が変更するもの】
--   profiles       … SELECT ポリシー（行の見える範囲を「自分 or 公開アカウント」に）
--   public_profiles… 新規VIEW（誰の分でも id / nickname / avatar_url だけを返す）
--   comments       … SELECT ポリシー（自分のコメント or 自分が見られる投稿のコメント）
--   post_reactions … SELECT ポリシー（自分のリアクション or 自分が見られる投稿の分）
--   follows        … SELECT ポリシー（自分が当事者の行だけ）
--   yt_follow_counts() … 新規関数（フォロー数・フォロワー数の件数だけを返す）
--   comments       … INSERT ポリシー【v51.4.1】（自分が閲覧できる投稿にだけコメントできる）
--   post_reactions … INSERT ポリシー【v51.4.1】（自分が閲覧できる投稿にだけリアクションできる）
--
-- 【触らないもの】
--   ・posts のポリシー（本番で確認済みのため一切変更しません）
--   ・blocks / reports のポリシー（すでに安全なため変更しません。§確認結果はREADME）
--   ・storage.objects（v51.2）/ バケット / Edge Function / 既存データ / テーブル定義
--   ・UPDATE / DELETE のポリシー（すべて現状維持）
--   ・profiles / posts / follows / blocks / reports の INSERT ポリシー（現状維持）
--
-- 【安全性】
--   ・全体を1つのトランザクション（BEGIN〜COMMIT）で実行します。
--   ・最後に「想定外のSELECTポリシーが残っていないか」を検査し、
--     残っていた場合は例外を出して**全部ロールバック**します（中途半端な状態を残さない）。
--   ・DROP するのは v43 / v50 で作った SELECT ポリシーだけで、テーブルもデータも消しません。
--   ・何度実行しても同じ結果になります（冪等）。
-- ═══════════════════════════════════════════════════════════════════════════

begin;

-- ───────────────────────────────────────────────────────────────────────────
-- 1. profiles：行の見える範囲を「自分 or 公開アカウント」に
--
--    変更前： for select to authenticated using (true)
--             → ログインしていれば、非公開ユーザーの intro / hitokoto / region /
--               fav_acts / pace まで API から取得できてしまう
--    変更後： 自分の行、または is_public = true の行だけ
--
--    ※ 非公開ユーザーの「名前・アイコン」は、下の public_profiles VIEW から
--      取得できるようにします（公開ユーザーの投稿に非公開ユーザーがコメントした場合に
--      名前が出なくなるのを防ぐため。README §4）。
-- ───────────────────────────────────────────────────────────────────────────
drop policy if exists "profiles: read for authenticated" on public.profiles;
drop policy if exists "profiles: read own or public"     on public.profiles;
create policy "profiles: read own or public" on public.profiles
  for select to authenticated
  using (
    id = (select auth.uid())
    or is_public = true
  );


-- ───────────────────────────────────────────────────────────────────────────
-- 2. public_profiles VIEW（SNS表示に必要な最小情報だけ）
--
--    返す列は id / nickname / avatar_url の3つだけ。
--    intro / hitokoto / region / fav_acts / pace / created_at / is_public は返しません。
--
--    このVIEWは「定義者の権限」で動くため profiles のRLSを通りません。
--    ＝ 非公開ユーザーの名前とアイコンも取得できます（それが目的）。
--    Supabase のセキュリティ診断で "security definer view" として表示されますが、
--    公開してよい3列だけに絞った意図的な設計です。
-- ───────────────────────────────────────────────────────────────────────────
create or replace view public.public_profiles
  with (security_barrier = true) as
  select p.id, p.nickname, p.avatar_url
  from public.profiles p;

-- PostgreSQL 15 以降では security_invoker を明示できる（既定値 false と同じ意味）。
-- 未対応バージョンでも失敗しないように、例外を握って続行する。
do $$
begin
  begin
    execute 'alter view public.public_profiles set (security_invoker = false)';
  exception when others then
    raise notice 'security_invoker は設定できませんでした（既定で定義者権限のため問題ありません）: %', sqlerrm;
  end;
end $$;

revoke all on public.public_profiles from public;
revoke all on public.public_profiles from anon;
grant select on public.public_profiles to authenticated;


-- ───────────────────────────────────────────────────────────────────────────
-- 3. comments：自分が見られる投稿のコメントだけ
--
--    変更前： using (is_deleted = false or user_id = auth.uid())
--             → 非公開ユーザーの投稿に付いたコメントまで API から取得できる
--    変更後： 自分のコメント、または「自分がSELECTできる投稿」に紐づくコメント
--
--    exists(...) の中の posts も posts のRLSを通るため、
--    「投稿が見えない人にはコメントも見えない」が自動的に成立します。
--    posts のポリシーは変更していません。
-- ───────────────────────────────────────────────────────────────────────────
drop policy if exists "comments: read alive"          on public.comments;
drop policy if exists "comments: read visible posts"  on public.comments;
create policy "comments: read visible posts" on public.comments
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (
      is_deleted = false
      and exists (select 1 from public.posts p where p.id = comments.post_id)
    )
  );


-- ───────────────────────────────────────────────────────────────────────────
-- 4. post_reactions：自分が見られる投稿のリアクションだけ
--
--    変更前： using (true)
--    変更後： 自分が付けたリアクション、または自分がSELECTできる投稿の分
-- ───────────────────────────────────────────────────────────────────────────
drop policy if exists "reactions: read for authenticated" on public.post_reactions;
drop policy if exists "reactions: read visible posts"     on public.post_reactions;
create policy "reactions: read visible posts" on public.post_reactions
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or exists (select 1 from public.posts p where p.id = post_reactions.post_id)
  );


-- ───────────────────────────────────────────────────────────────────────────
-- 5. follows：自分が当事者の行だけ
--
--    変更前： using (true)
--             → 誰が誰をフォローしているかの一覧が、全ログインユーザーから取得できる
--    変更後： 自分がフォローした行／自分がフォローされた行だけ
--
--    画面で使う「フォロー数・フォロワー数」は、行を見せずに件数だけ返す
--    yt_follow_counts()（次の節）で今までどおり表示できます。
-- ───────────────────────────────────────────────────────────────────────────
drop policy if exists "follows: read for authenticated" on public.follows;
drop policy if exists "follows: read own"               on public.follows;
create policy "follows: read own" on public.follows
  for select to authenticated
  using (
    follower_id = (select auth.uid())
    or following_id = (select auth.uid())
  );


-- ───────────────────────────────────────────────────────────────────────────
-- 6. yt_follow_counts()：フォロー数・フォロワー数（件数だけ）
--
--    SECURITY DEFINER を使う理由：
--      5. で follows の行を本人以外に見せない設計にしたため、
--      「公開アカウントのフォロー数」を今までどおり表示するには、
--      行を返さずに件数だけ返す関数が必要になるため。
--
--    §7 の必須条件：
--      ・search_path を固定（public, pg_temp）
--      ・入力は uuid 1つだけ。文字列連結・動的SQLなし
--      ・返すのは整数2つだけ（誰がフォローしているかは一切返さない）
--      ・execute 権限は authenticated のみ（anon / public からは revoke）
--      ・自分 または 公開アカウント以外を指定した場合は 0 を返す
--        （非公開アカウントの規模も他人には見せない）
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.yt_follow_counts(target uuid)
returns table (following_count integer, followers_count integer)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  me uuid := auth.uid();
  allowed boolean := false;
begin
  if me is null or target is null then
    return query select 0, 0;
    return;
  end if;

  select (target = me) or coalesce(p.is_public, false)
    into allowed
    from public.profiles p
   where p.id = target;

  if not coalesce(allowed, false) then
    return query select 0, 0;
    return;
  end if;

  return query
    select
      (select count(*)::integer from public.follows f where f.follower_id  = target),
      (select count(*)::integer from public.follows f where f.following_id = target);
end;
$$;

revoke all on function public.yt_follow_counts(uuid) from public;
revoke all on function public.yt_follow_counts(uuid) from anon;
grant execute on function public.yt_follow_counts(uuid) to authenticated;


-- ───────────────────────────────────────────────────────────────────────────
-- 6-2.【v51.4.1】comments の INSERT：自分が閲覧できる投稿にだけコメントできる
--
--    変更前： with check (user_id = auth.uid())
--             → post_id さえ分かれば、見えないはずの非公開投稿にもコメントを
--               書き込めてしまう（画面からはできないが、API を直接叩けば可能）
--    変更後： 本人確認に加えて「その投稿が自分から見えること」を条件にする
--
--    exists(...) の中の posts は posts のRLS（本番で確認済み・今回も変更なし）を
--    通るため、判定基準は投稿の閲覧条件とまったく同じになります。
--    非公開アカウント本人は自分の投稿が見えるので、
--    自分の非公開投稿へのコメントは今までどおりできます。
-- ───────────────────────────────────────────────────────────────────────────
drop policy if exists "comments: insert own" on public.comments;
create policy "comments: insert own" on public.comments
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.posts p where p.id = comments.post_id)
  );


-- ───────────────────────────────────────────────────────────────────────────
-- 6-3.【v51.4.1】post_reactions の INSERT：自分が閲覧できる投稿にだけ
--
--    変更前： with check (user_id = auth.uid())
--    変更後： 本人確認 ＋ その投稿が自分から見えること
--
--    リアクションの取り消し（DELETE）は従来どおり本人のみで、変更していません。
-- ───────────────────────────────────────────────────────────────────────────
drop policy if exists "reactions: insert own" on public.post_reactions;
create policy "reactions: insert own" on public.post_reactions
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.posts p where p.id = post_reactions.post_id)
  );


-- ───────────────────────────────────────────────────────────────────────────
-- 7. blocks / reports は現状のままで安全（変更しません）
--      blocks  … select/insert/delete とも blocker_id = auth.uid() のみ（v50）
--      reports … SELECT ポリシーなし＋ select 権限なし＝クライアントからは読めない（v50）
--    ここでは「意図せず緩いポリシーが増えていないか」だけを検査します。
-- ───────────────────────────────────────────────────────────────────────────
do $$
declare
  r record;
  bad text := '';
begin
  for r in
    select tablename, policyname, cmd, qual
      from pg_policies
     where schemaname = 'public'
       and tablename in ('blocks','reports')
       and cmd in ('SELECT','ALL')
  loop
    if r.tablename = 'reports' then
      bad := bad || format('reports に SELECT 系ポリシー「%s」があります / ', r.policyname);
    elsif r.tablename = 'blocks' and coalesce(r.qual,'') not like '%auth.uid()%' then
      bad := bad || format('blocks のポリシー「%s」が本人限定になっていません / ', r.policyname);
    end if;
  end loop;
  if bad <> '' then
    raise exception 'v51.4.1: blocks / reports の確認で問題を検出したため中止しました → %', bad;
  end if;
end $$;


-- ───────────────────────────────────────────────────────────────────────────
-- 8. 最終検査：今回作ったもの以外の SELECT / INSERT ポリシーが残っていないか
--
--    RLSの許可ポリシーは「どれか1つでも通れば見える（OR）」ため、
--    古い using (true) のポリシーが1つでも残っていると今回の対策が無効になります。
--    残っていた場合は例外を出し、この migration 全体をロールバックします。
-- ───────────────────────────────────────────────────────────────────────────
do $$
declare
  r record;
  extra text := '';
begin
  for r in
    select tablename, policyname
      from pg_policies
     where schemaname = 'public'
       and tablename in ('profiles','comments','post_reactions','follows')
       and cmd in ('SELECT','ALL')
       and policyname not in (
         'profiles: read own or public',
         'comments: read visible posts',
         'reactions: read visible posts',
         'follows: read own'
       )
  loop
    extra := extra || format('%s.「%s」(SELECT) / ', r.tablename, r.policyname);
  end loop;

  -- 【v51.4.1】INSERT 側も同じ確認。許可ポリシーは OR で合成されるため、
  -- 古い「本人チェックだけ」のポリシーが別名で残っていると今回の対策が効かない。
  for r in
    select tablename, policyname
      from pg_policies
     where schemaname = 'public'
       and tablename in ('comments','post_reactions')
       and cmd in ('INSERT','ALL')
       and policyname not in ('comments: insert own','reactions: insert own')
  loop
    extra := extra || format('%s.「%s」(INSERT) / ', r.tablename, r.policyname);
  end loop;

  if extra <> '' then
    raise exception 'v51.4.1: 想定外のポリシーが残っているため中止しました → %  （このポリシーの内容を確認してからご相談ください。DBは変更されていません）', extra;
  end if;
end $$;

commit;

-- ═══════════════════════════════════════════════════════════════════════════
-- 完了。
--   ・適用後の確認は supabase/manual/v51_4_1_verify_readonly.sql の「適用後」を実行
--   ・元に戻す場合は supabase/manual/v51_4_1_rollback.sql（v51.3 の状態へ戻ります）
-- ═══════════════════════════════════════════════════════════════════════════
