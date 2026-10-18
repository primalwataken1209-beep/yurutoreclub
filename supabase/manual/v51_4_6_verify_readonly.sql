-- ═══════════════════════════════════════════════════════════════════════════
-- v51.4.6 posts SELECT ポリシー 確認用（読み取り専用・何も変更しません）
--   適用前・適用後のどちらでも実行できます。結果は保存しておいてください。
-- ═══════════════════════════════════════════════════════════════════════════

-- ① posts の全ポリシー（適用前：現在の本番の状態を記録する）
--   適用後の期待値：SELECT は "posts: read own or public" の1件だけ。
--   qual に is_public と auth.uid() が含まれていること。
select policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public' and tablename = 'posts'
order by cmd, policyname;

-- ② posts の RLS が有効か（true であること）
select relname, relrowsecurity, relforcerowsecurity
from pg_class
where oid = 'public.posts'::regclass;

-- ③ 参考：posts を参照している他テーブルのポリシー（この結果は今回変わりません）
select schemaname, tablename, policyname, cmd
from pg_policies
where (qual ilike '%public.posts%' or with_check ilike '%public.posts%'
       or qual ilike '%from posts%' or with_check ilike '%from posts%')
order by schemaname, tablename, policyname;
