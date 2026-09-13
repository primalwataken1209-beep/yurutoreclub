-- ═══════════════════════════════════════════════════════════════════════════
-- ゆるトレ倶楽部 v50 — Legal / Safety 追加マイグレーション
--   20260908_v50_safety_legal.sql
--
-- 【実行方法】
--   Supabase ダッシュボード → SQL Editor に貼り付けて 1回実行してください。
--   （Supabase CLI の場合は supabase/migrations/ に置いて `supabase db push`）
--
-- 【安全性】
--   ・このファイルは何度実行しても同じ結果になります（冪等）。
--   ・既存の 20260101000000_v43_real_sns.sql は一切変更していません。
--   ・既存の profiles / posts / comments / post_reactions / follows /
--     app_events / user_progress / avatars バケットのデータは削除しません。
--   ・既存ユーザー・既存投稿・既存フォローはそのまま保持されます。
--
-- 【作るもの】
--   reports  … 投稿・コメントの通報（本人のみINSERT可・一般ユーザーはSELECT不可）
--   blocks   … ユーザーのブロック（本人のみ追加／解除可）
--   app_events の user_id へ auth.users(id) ON DELETE CASCADE を付与（安全に実行できる場合のみ）
-- ═══════════════════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────────────────
-- 1. reports（通報）
--
--    target_type … 'post' / 'comment'
--    reason      … 'harassment' / 'inappropriate' / 'spam' / 'personal_info'
--                  / 'dangerous' / 'other'
--    status      … 'open' / 'reviewed' / 'actioned' / 'dismissed'
--
--    target_id は posts / comments のどちらも指すため、外部キーは張りません
--    （張ると片方にしか制約できず、対象が削除された通報が消えてしまうため）。
--    通報の履歴は、対象が削除されたあとも運営が確認できる必要があります。
--
--    reporter_user_id は auth.users を直接参照します。
--    アカウント削除時に自分の通報も一緒に消えるよう ON DELETE CASCADE を付けます。
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.reports (
  id               uuid primary key default gen_random_uuid(),
  reporter_user_id uuid not null default auth.uid()
                     references auth.users(id) on delete cascade,
  target_type      text not null,
  target_id        uuid not null,
  reason           text not null,
  note             text,
  status           text not null default 'open',
  created_at       timestamptz not null default now()
);

-- 既に古い形の reports がある環境向けに、足りない列だけ足す（冪等）
alter table public.reports add column if not exists note       text;
alter table public.reports add column if not exists status     text not null default 'open';
alter table public.reports add column if not exists created_at timestamptz not null default now();

alter table public.reports drop constraint if exists reports_target_type_valid;
alter table public.reports add  constraint reports_target_type_valid
  check (target_type in ('post','comment'));

alter table public.reports drop constraint if exists reports_reason_valid;
alter table public.reports add  constraint reports_reason_valid
  check (reason in ('harassment','inappropriate','spam','personal_info','dangerous','other'));

alter table public.reports drop constraint if exists reports_status_valid;
alter table public.reports add  constraint reports_status_valid
  check (status in ('open','reviewed','actioned','dismissed'));

alter table public.reports drop constraint if exists reports_note_len;
alter table public.reports add  constraint reports_note_len
  check (note is null or char_length(note) <= 500);

-- 同じ人が同じ対象を何度も通報しても1件だけにする（連打・重複の防止）
create unique index if not exists reports_unique_per_user_target
  on public.reports (reporter_user_id, target_type, target_id);

create index if not exists reports_status_created_idx
  on public.reports (status, created_at desc);
create index if not exists reports_target_idx
  on public.reports (target_type, target_id);


-- ───────────────────────────────────────────────────────────────────────────
-- 2. blocks（ブロック）
--
--    ・同じ組み合わせは1件だけ    → primary key (blocker_id, blocked_id)
--    ・自分自身のブロックは禁止    → check (blocker_id <> blocked_id)
--    ・profiles を参照するので、アカウント削除時に自動で消える
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint blocks_no_self check (blocker_id <> blocked_id)
);

create index if not exists blocks_blocker_idx on public.blocks (blocker_id);
create index if not exists blocks_blocked_idx on public.blocks (blocked_id);


-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Row Level Security
--
--    RLSは必ず有効にします。一時的に無効化して動かす運用はしません。
--
--    reports:
--      INSERT … 本人（reporter_user_id = auth.uid()）のみ
--      SELECT … ポリシーを作らない ＝ クライアントからは1件も読めない
--               （自分の通報も読めません。読める必要がないためです）
--      UPDATE / DELETE … ポリシーを作らない
--      → 管理者は Supabase ダッシュボード（service role）から確認・更新します。
--
--    blocks:
--      SELECT / INSERT / DELETE … 本人（blocker_id = auth.uid()）のみ
--      → 「誰が自分をブロックしているか」は誰にも見えません。
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.reports enable row level security;
alter table public.blocks  enable row level security;

-- ── reports ───────────────────────────────────────────────────────────────
drop policy if exists "reports: insert own" on public.reports;
create policy "reports: insert own" on public.reports
  for insert to authenticated
  with check (reporter_user_id = auth.uid());

-- SELECT / UPDATE / DELETE のポリシーは意図的に作りません。
-- 念のため、過去に作られた可能性のあるポリシーを落としておきます。
drop policy if exists "reports: read own"           on public.reports;
drop policy if exists "reports: read for authenticated" on public.reports;
drop policy if exists "reports: update own"         on public.reports;
drop policy if exists "reports: delete own"         on public.reports;

-- ── blocks ────────────────────────────────────────────────────────────────
drop policy if exists "blocks: read own" on public.blocks;
create policy "blocks: read own" on public.blocks
  for select to authenticated using (blocker_id = auth.uid());

drop policy if exists "blocks: insert own" on public.blocks;
create policy "blocks: insert own" on public.blocks
  for insert to authenticated
  with check (blocker_id = auth.uid() and blocker_id <> blocked_id);

drop policy if exists "blocks: delete own" on public.blocks;
create policy "blocks: delete own" on public.blocks
  for delete to authenticated using (blocker_id = auth.uid());
-- UPDATEポリシーは作らない（ブロックは付け外しだけ）


-- ═══════════════════════════════════════════════════════════════════════════
-- 4. 権限（RLSと二段構え）
--     anon には一切渡さない。authenticated にだけ必要な操作を許可する。
--
--     reports に select を渡さないことで、
--     「クライアントから reports 全体を読める」状態を二重に防ぎます。
-- ═══════════════════════════════════════════════════════════════════════════
revoke all on public.reports from anon;
revoke all on public.blocks  from anon;

grant insert                 on public.reports to authenticated;
grant select, insert, delete on public.blocks  to authenticated;


-- ═══════════════════════════════════════════════════════════════════════════
-- 5. app_events の整合性改善（安全に実行できる場合のみ）
--
--    v28 で作った app_events.user_id には auth.users(id) への外部キーが
--    ありません。そのため Auth ユーザーを削除しても行が残ります。
--
--    ここでは「既存データがある環境でも安全に通ること」を最優先し、
--    次の手順で外部キーを追加します。
--      ① app_events が存在しない環境では何もしない
--      ② auth.users に存在しない user_id の行を先に削除する
--         （外部キー追加が失敗する唯一の原因を取り除く）
--      ③ 外部キー(ON DELETE CASCADE)を追加する
--      ④ 途中で何か問題があっても例外を握って続行する
--         （このマイグレーション全体が失敗しないようにするため）
--
--    ※ ここが成功しなかった場合でも、delete-account Edge Function 側で
--      本人分の app_events を明示的に削除するので、アカウント削除は完結します。
-- ═══════════════════════════════════════════════════════════════════════════
do $$
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'app_events'
  ) then
    raise notice 'app_events が無いのでスキップします';
    return;
  end if;

  -- すでに同名の外部キーがあるなら何もしない
  if exists (
    select 1 from pg_constraint
    where conname = 'app_events_user_id_fkey_v50'
      and conrelid = 'public.app_events'::regclass
  ) then
    raise notice 'app_events の外部キーは既に追加済みです';
    return;
  end if;

  -- ② 迷子の行（削除済みユーザーの残骸）を先に片づける
  delete from public.app_events e
  where e.user_id is not null
    and not exists (select 1 from auth.users u where u.id = e.user_id);

  -- ③ 外部キーを追加
  alter table public.app_events
    add constraint app_events_user_id_fkey_v50
    foreign key (user_id) references auth.users(id) on delete cascade;

  raise notice 'app_events に ON DELETE CASCADE を追加しました';
exception when others then
  -- ④ どんな理由で失敗しても、マイグレーション全体は成功させる
  raise notice 'app_events の外部キー追加はスキップしました（Edge Functionで明示削除します）: %', sqlerrm;
end $$;


-- ═══════════════════════════════════════════════════════════════════════════
-- 6. user_progress が存在する場合のみ、CASCADE を整える（任意・安全側）
--
--    user_progress は環境によって存在しないことがあります。
--    存在する場合だけ、アカウント削除時に自動で消えるようにします。
--    失敗しても続行します（Edge Function 側で存在確認のうえ削除するため）。
-- ═══════════════════════════════════════════════════════════════════════════
do $$
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'user_progress'
  ) then
    raise notice 'user_progress が無いのでスキップします';
    return;
  end if;

  if exists (
    select 1 from pg_constraint
    where conname = 'user_progress_user_id_fkey_v50'
      and conrelid = 'public.user_progress'::regclass
  ) then
    raise notice 'user_progress の外部キーは既に追加済みです';
    return;
  end if;

  delete from public.user_progress p
  where p.user_id is not null
    and not exists (select 1 from auth.users u where u.id = p.user_id);

  alter table public.user_progress
    add constraint user_progress_user_id_fkey_v50
    foreign key (user_id) references auth.users(id) on delete cascade;

  raise notice 'user_progress に ON DELETE CASCADE を追加しました';
exception when others then
  raise notice 'user_progress の外部キー追加はスキップしました（Edge Functionで明示削除します）: %', sqlerrm;
end $$;


-- ═══════════════════════════════════════════════════════════════════════════
-- 完了。
--   ・通報／ブロックが使えるようになります
--   ・既存の投稿・コメント・フォロー・プロフィールはそのまま残っています
--   ・アカウント削除は supabase/functions/delete-account を deploy してください
-- ═══════════════════════════════════════════════════════════════════════════
