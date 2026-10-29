-- ═══════════════════════════════════════════════════════════════════════════
-- ストア準備: ユーザー通報 確認用（読み取り専用・何も変更しません）
--   適用前・適用後のどちらでも実行できます。結果は保存しておいてください。
-- ═══════════════════════════════════════════════════════════════════════════

-- ① reports のポリシー
--   適用前の期待値：INSERT "reports: insert own" の1件だけ。with_check = (reporter_user_id = auth.uid())
--   適用後の期待値：同じ名前の1件だけ。with_check に target_type と public_profiles が含まれる
--   どちらでも SELECT / UPDATE / DELETE のポリシーは0件であること
select policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public' and tablename = 'reports'
order by cmd, policyname;

-- ② target_type の CHECK 制約
--   適用前：('post','comment')　適用後：('post','comment','user')
select conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.reports'::regclass and contype = 'c'
order by conname;

-- ③ RLS が有効か（true であること）
select relname, relrowsecurity from pg_class where oid = 'public.reports'::regclass;

-- ④ 前提の VIEW があるか（1行返ること）
select table_name from information_schema.views
where table_schema = 'public' and table_name = 'public_profiles';

-- ⑤ 権限：anon は0行、authenticated は INSERT のみであること
select grantee, privilege_type from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'reports' and grantee in ('anon','authenticated')
order by grantee, privilege_type;

-- ⑥ 件数だけ（内容は読まない）
select target_type, status, count(*) from public.reports group by 1, 2 order by 1, 2;
