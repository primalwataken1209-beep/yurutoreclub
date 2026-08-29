-- ═══════════════════════════════════════════════════════════
-- ゆるトレ倶楽部 v28 計測テーブル (supabase_v28_events.sql)
-- SupabaseのSQL Editorに貼り付けて1回実行してください。
-- ═══════════════════════════════════════════════════════════
-- 方針:
--  ・イベントは5種類のみ
--  ・ログイン中のユーザーが「自分のイベントをINSERTすることだけ」できる
--  ・SELECT/UPDATE/DELETEのポリシーは作らない(アプリからは読み書き不可)
--  ・集計は管理者がSupabaseダッシュボード(service role)から行う

create table if not exists public.app_events (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid(),
  event text not null check (event in
    ('app_open','panda_room_open','panda_tap','exercise_recorded','mission_completed')),
  created_at timestamptz not null default now()
);

alter table public.app_events enable row level security;

-- 自分のイベントだけINSERT可能(user_idは既定値auth.uid()なのでクライアントから指定不要)
drop policy if exists "insert own events" on public.app_events;
create policy "insert own events" on public.app_events
  for insert to authenticated
  with check (user_id = auth.uid());

-- 参考: 集計クエリの例(ダッシュボードで実行)
--   日別アクティブユーザー:
--     select created_at::date as day, count(distinct user_id)
--     from app_events where event='app_open' group by 1 order by 1;
--   7日継続率などはapp_openのuser_id×dayから算出できます。
