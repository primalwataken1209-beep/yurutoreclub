-- ═══════════════════════════════════════════════════════════════════════════
-- ゆるトレ倶楽部 v51.4.1 — 確認用SQL（読み取りのみ・何も変更しません）
--   supabase/manual/v51_4_1_verify_readonly.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- ════════ 適用前に実行 ════════

-- ① 変更対象4テーブルの現在の SELECT ポリシー と、
--    comments / post_reactions の INSERT ポリシー
--    v43 のままなら次の4つが出ます：
--      profiles       : "profiles: read for authenticated"   (true)
--      comments       : "comments: read alive"
--      post_reactions : "reactions: read for authenticated"  (true)
--      follows        : "follows: read for authenticated"    (true)
--    これ以外の名前があれば、適用前にご相談ください（migration は中止する作りです）。
select tablename, policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('profiles','comments','post_reactions','follows')
  and cmd in ('SELECT','INSERT','ALL')
order by tablename, cmd, policyname;

-- ② posts（今回は変更しません。現状確認のみ）
select policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public' and tablename = 'posts'
order by cmd, policyname;

-- ③ blocks / reports（安全であることの確認）
--    blocks  … SELECT が blocker_id = auth.uid() のみ
--    reports … SELECT ポリシーが1件も無いこと
select tablename, policyname, cmd, qual
from pg_policies
where schemaname = 'public' and tablename in ('blocks','reports')
order by tablename, cmd;

-- ④ RLSが全テーブルで有効か（すべて true であること）
select relname, relrowsecurity
from pg_class
where oid in ('public.profiles'::regclass,'public.posts'::regclass,'public.comments'::regclass,
              'public.post_reactions'::regclass,'public.follows'::regclass,
              'public.blocks'::regclass,'public.reports'::regclass);

-- ⑤ anon（未ログイン）に権限が渡っていないこと（0行であること）
select table_name, privilege_type, grantee
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee = 'anon'
  and table_name in ('profiles','posts','comments','post_reactions','follows','blocks','reports');


-- ════════ 適用後に実行 ════════

-- ⑥ 新しいポリシーになっていること
--    SELECT
--      profiles       : "profiles: read own or public"
--      comments       : "comments: read visible posts"
--      post_reactions : "reactions: read visible posts"
--      follows        : "follows: read own"
--    INSERT（with_check に exists(... posts ...) が入っていること）
--      comments       : "comments: insert own"
--      post_reactions : "reactions: insert own"
select tablename, policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('profiles','comments','post_reactions','follows')
order by tablename, cmd, policyname;

-- ⑦ VIEW が3列だけであること（id / nickname / avatar_url）
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'public_profiles'
order by ordinal_position;

-- ⑧ VIEW / 関数の権限（authenticated だけに付いていること）
select table_name, privilege_type, grantee
from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'public_profiles';

select p.proname, p.prosecdef as security_definer, p.proconfig, r.rolname as owner,
       has_function_privilege('authenticated', p.oid, 'execute') as authenticated_can_execute,
       has_function_privilege('anon',          p.oid, 'execute') as anon_can_execute
from pg_proc p join pg_roles r on r.oid = p.proowner
where p.pronamespace = 'public'::regnamespace and p.proname = 'yt_follow_counts';

-- ⑨ 動作確認（ダッシュボードの SQL Editor は postgres 権限で動くため、
--    RLS の効きは「アプリで実際に試す」のが確実です。README §9 のテスト手順を参照）
