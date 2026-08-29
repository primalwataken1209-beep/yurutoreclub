-- ═══════════════════════════════════════════════════════════════════════════
-- ゆるトレ倶楽部 v43 — 実ユーザーSNS基盤
--   20260101000000_v43_real_sns.sql
--
-- 【実行方法】
--   Supabase ダッシュボード → SQL Editor に貼り付けて 1回実行するだけです。
--   （Supabase CLI を使う場合は supabase/migrations/ に置いて `supabase db push`）
--
-- 【安全性】
--   このファイルは何度実行しても同じ結果になります（冪等）。
--   ・create table if not exists / add column if not exists / drop policy if exists
--   ・すでに profiles テーブルがある環境でも、足りない列だけを足します
--   ・既存の app_events / user_progress / avatars バケットには一切触れません
--
-- 【作るもの】
--   profiles        … SNS表示用プロフィール（既存テーブルがあれば拡張）
--   posts           … 投稿
--   post_reactions  … ゆるリアクション
--   comments        … コメント
--   follows         … フォロー
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- 1. profiles（既存テーブルを活かす。無ければ作る）
--
--    v25 の時点でアプリは profiles へ upsert していました（nickname / hitokoto /
--    intro / avatar_url / fav_acts / pace / region / is_public / updated_at）。
--    v43 でもその列名をそのまま使い、重複テーブルは作りません。
--    指示書の推奨名との対応は次のとおりです。
--        display_name → nickname   （ニックネーム。本名は不要）
--        bio          → intro      （自己紹介・長め） / hitokoto（ひとこと・短め）
--        prefecture   → region     （都道府県まで。任意。市区町村以下は扱わない）
--        avatar_url   → avatar_url （そのまま）
--    足りなかった created_at だけ v43 で追加します。
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade
);

alter table public.profiles add column if not exists nickname    text;
alter table public.profiles add column if not exists hitokoto    text;
alter table public.profiles add column if not exists intro       text;
alter table public.profiles add column if not exists avatar_url  text;
alter table public.profiles add column if not exists fav_acts    jsonb   default '[]'::jsonb;
alter table public.profiles add column if not exists pace        text;
alter table public.profiles add column if not exists region      text;   -- 都道府県まで（任意）
alter table public.profiles add column if not exists is_public   boolean not null default true;
alter table public.profiles add column if not exists created_at  timestamptz not null default now();
alter table public.profiles add column if not exists updated_at  timestamptz not null default now();

-- 表示名は空でも落ちないように。長さだけ緩く制限する（本名必須にはしない）
alter table public.profiles drop constraint if exists profiles_nickname_len;
alter table public.profiles add  constraint profiles_nickname_len check (nickname is null or char_length(nickname) <= 40);
alter table public.profiles drop constraint if exists profiles_intro_len;
alter table public.profiles add  constraint profiles_intro_len    check (intro    is null or char_length(intro)    <= 300);
alter table public.profiles drop constraint if exists profiles_hitokoto_len;
alter table public.profiles add  constraint profiles_hitokoto_len check (hitokoto is null or char_length(hitokoto) <= 60);

-- ───────────────────────────────────────────────────────────────────────────
-- 2. posts（投稿）
--    ・本文は短文中心。画像はv43では必須ではないので列も作らない
--    ・activity_type は既存アプリの運動種別ID（walk/run/stretch/gym/home/other）
--    ・削除はソフトデリート（is_deleted）。物理削除に依存しない
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.posts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  body        text not null default '',
  activity_type text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  is_deleted  boolean not null default false,
  constraint posts_body_len check (char_length(body) <= 300),
  constraint posts_activity_type_valid check (
    activity_type is null or activity_type in ('walk','run','stretch','gym','home','other')
  ),
  -- 本文も種別も空の投稿は作れない
  constraint posts_not_empty check (char_length(btrim(body)) > 0 or activity_type is not null)
);

-- ───────────────────────────────────────────────────────────────────────────
-- 3. post_reactions（ゆるリアクション）
--    ・同じ人が同じ投稿へ同じリアクションを2回入れられない（連打対策）
--      → primary key (post_id, user_id, reaction_type)
--    ・種類が違えば複数付けられる（🐼えらすぎ ＋ 🍜飯テロ など）
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.post_reactions (
  post_id       uuid not null references public.posts(id) on delete cascade,
  user_id       uuid not null references public.profiles(id) on delete cascade,
  reaction_type text not null,
  created_at    timestamptz not null default now(),
  primary key (post_id, user_id, reaction_type),
  constraint post_reactions_type_valid check (
    reaction_type in ('panda','ramen','zero','night','yuru')
  )
);

-- ───────────────────────────────────────────────────────────────────────────
-- 4. comments（コメント）
--    ・v43では返信ツリーなし（フラット）
--    ・削除はソフトデリート
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.comments (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references public.posts(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  body       text not null,
  created_at timestamptz not null default now(),
  is_deleted boolean not null default false,
  constraint comments_body_len check (char_length(body) between 1 and 200)
);

-- ───────────────────────────────────────────────────────────────────────────
-- 5. follows（フォロー）
--    ・同一人物への重複フォロー不可 → primary key (follower_id, following_id)
--    ・自分自身のフォロー禁止      → check (follower_id <> following_id)
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.follows (
  follower_id  uuid not null references public.profiles(id) on delete cascade,
  following_id uuid not null references public.profiles(id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (follower_id, following_id),
  constraint follows_no_self check (follower_id <> following_id)
);

-- ───────────────────────────────────────────────────────────────────────────
-- 6. インデックス
--    タイムラインは「新着順」なので created_at desc を効かせる。
-- ───────────────────────────────────────────────────────────────────────────
create index if not exists posts_created_at_idx
  on public.posts (created_at desc) where is_deleted = false;
create index if not exists posts_user_created_idx
  on public.posts (user_id, created_at desc) where is_deleted = false;
create index if not exists comments_post_idx
  on public.comments (post_id, created_at) where is_deleted = false;
create index if not exists post_reactions_post_idx
  on public.post_reactions (post_id);
create index if not exists follows_following_idx
  on public.follows (following_id);
create index if not exists follows_follower_idx
  on public.follows (follower_id);

-- ───────────────────────────────────────────────────────────────────────────
-- 7. updated_at を自動更新するトリガー
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists posts_set_updated_at on public.posts;
create trigger posts_set_updated_at before update on public.posts
  for each row execute function public.set_updated_at();

-- ───────────────────────────────────────────────────────────────────────────
-- 8. 新規ユーザー登録時に profiles を自動作成
--    posts / comments などが profiles を参照するため、プロフィール行が
--    先に無いと投稿できない。サインアップと同時に空の行を用意しておく。
--    （アプリ側でも投稿前に upsert するので二重の保険）
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, nickname)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- 既存ユーザーの取りこぼしを埋める（初回実行時のみ意味がある）
insert into public.profiles (id)
select u.id from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null;

-- ═══════════════════════════════════════════════════════════════════════════
-- 9. Row Level Security
--
--    方針:
--      閲覧 … ログイン済みユーザー(authenticated)なら見られる。
--             未ログイン(anon)には一切見せない。
--             ＝ 体験版のまま他人の投稿を覗くことはできない。
--      作成/更新/削除 … すべて「本人だけ」。
--                       user_id / follower_id は必ず auth.uid() と一致が必要。
--    RLSは全テーブルで有効化します（無効のまま完成にはしません）。
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.profiles       enable row level security;
alter table public.posts          enable row level security;
alter table public.post_reactions enable row level security;
alter table public.comments       enable row level security;
alter table public.follows        enable row level security;

-- ── profiles ──────────────────────────────────────────────────────────────
drop policy if exists "profiles: read for authenticated" on public.profiles;
create policy "profiles: read for authenticated" on public.profiles
  for select to authenticated using (true);

drop policy if exists "profiles: insert own" on public.profiles;
create policy "profiles: insert own" on public.profiles
  for insert to authenticated with check (id = auth.uid());

drop policy if exists "profiles: update own" on public.profiles;
create policy "profiles: update own" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
-- 削除ポリシーは作らない（アカウント削除は auth.users 側の cascade で行う）

-- ── posts ─────────────────────────────────────────────────────────────────
-- 読める投稿は「削除されていない投稿」だけ。本人は自分の削除済みも見える。
drop policy if exists "posts: read alive" on public.posts;
create policy "posts: read alive" on public.posts
  for select to authenticated using (is_deleted = false or user_id = auth.uid());

drop policy if exists "posts: insert own" on public.posts;
create policy "posts: insert own" on public.posts
  for insert to authenticated with check (user_id = auth.uid());

-- 編集・ソフトデリートはどちらもUPDATE。本人以外は行が見えないので触れない。
drop policy if exists "posts: update own" on public.posts;
create policy "posts: update own" on public.posts
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 物理削除も本人のみ（アプリは使わない。運用時の保険）
drop policy if exists "posts: delete own" on public.posts;
create policy "posts: delete own" on public.posts
  for delete to authenticated using (user_id = auth.uid());

-- ── post_reactions ────────────────────────────────────────────────────────
drop policy if exists "reactions: read for authenticated" on public.post_reactions;
create policy "reactions: read for authenticated" on public.post_reactions
  for select to authenticated using (true);

drop policy if exists "reactions: insert own" on public.post_reactions;
create policy "reactions: insert own" on public.post_reactions
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "reactions: delete own" on public.post_reactions;
create policy "reactions: delete own" on public.post_reactions
  for delete to authenticated using (user_id = auth.uid());
-- UPDATEポリシーは作らない（付け外しだけ。書き換える意味がない）

-- ── comments ──────────────────────────────────────────────────────────────
drop policy if exists "comments: read alive" on public.comments;
create policy "comments: read alive" on public.comments
  for select to authenticated using (is_deleted = false or user_id = auth.uid());

drop policy if exists "comments: insert own" on public.comments;
create policy "comments: insert own" on public.comments
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "comments: update own" on public.comments;
create policy "comments: update own" on public.comments
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "comments: delete own" on public.comments;
create policy "comments: delete own" on public.comments
  for delete to authenticated using (user_id = auth.uid());

-- ── follows ───────────────────────────────────────────────────────────────
drop policy if exists "follows: read for authenticated" on public.follows;
create policy "follows: read for authenticated" on public.follows
  for select to authenticated using (true);

drop policy if exists "follows: insert own" on public.follows;
create policy "follows: insert own" on public.follows
  for insert to authenticated with check (follower_id = auth.uid() and follower_id <> following_id);

drop policy if exists "follows: delete own" on public.follows;
create policy "follows: delete own" on public.follows
  for delete to authenticated using (follower_id = auth.uid());
-- UPDATEポリシーは作らない（フォローは付け外しだけ）

-- ═══════════════════════════════════════════════════════════════════════════
-- 10. 権限（RLSと二段構え）
--     anon には一切渡さない。authenticated にだけ必要な操作を許可する。
-- ═══════════════════════════════════════════════════════════════════════════
revoke all on public.profiles, public.posts, public.post_reactions,
              public.comments, public.follows from anon;

grant select, insert, update on public.profiles       to authenticated;
grant select, insert, update, delete on public.posts          to authenticated;
grant select, insert, delete         on public.post_reactions to authenticated;
grant select, insert, update, delete on public.comments       to authenticated;
grant select, insert, delete         on public.follows        to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 完了。SNSタブを開くと実投稿が表示されます。
-- ═══════════════════════════════════════════════════════════════════════════
