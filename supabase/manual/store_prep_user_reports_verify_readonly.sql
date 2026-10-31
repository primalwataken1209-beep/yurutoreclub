-- ═══════════════════════════════════════════════════════════════════════════
-- ストア準備: ユーザー通報 確認用（読み取り専用・何も変更しません）
--   適用前・適用後のどちらでも実行できます。結果は保存しておいてください。
-- ═══════════════════════════════════════════════════════════════════════════

-- ① reports のポリシー（全件）
--   適用前の期待値：INSERT "staging reports insert own" の1件だけ。
--     with_check = (reporter_user_id = auth.uid()) AND (status = 'open')
--   適用後の期待値：INSERT "reports: insert own" の1件だけ。
--     with_check に status = 'open'、target_type、profiles / comments / posts の存在確認が含まれる（public_profiles は使わない）
--   どちらでも SELECT / UPDATE / DELETE / ALL のポリシーは0件であること。
--   これ以外のポリシーがあれば、差分案は中止する（想定外のため）。
select policyname, permissive, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public' and tablename = 'reports'
order by cmd, policyname;

-- ② CHECK 制約（全件）
--   target_type を含む CHECK は1件だけで、名前は reports_target_type_check
--   適用前：('post','comment')　適用後：('post','comment','user')
--   reports_status_check（open/reviewed/actioned/dismissed）と note の長さ制限は変わらないこと
select conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.reports'::regclass and contype = 'c'
order by conname;

-- ③ RLS が有効か（true であること）
select relname, relrowsecurity from pg_class where oid = 'public.reports'::regclass;

-- ④ 通報対象の確認に使う3テーブルの SELECT ポリシー（この差分では変えない。非公開の扱いを記録する）
select tablename, policyname, cmd, qual
from pg_policies
where schemaname = 'public' and tablename in ('profiles','comments','posts') and cmd in ('SELECT','ALL')
order by tablename, policyname;

-- ⑤ 権限：anon は0行、authenticated は INSERT のみであること
select grantee, privilege_type from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'reports' and grantee in ('anon','authenticated')
order by grantee, privilege_type;

-- ⑥ 件数だけ（内容は読まない）
select target_type, status, count(*) from public.reports group by 1, 2 order by 1, 2;
