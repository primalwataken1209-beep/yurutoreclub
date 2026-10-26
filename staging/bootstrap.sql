-- Apply ONLY to project knftduojdalnawvkbelt (yurutore-club-staging).
-- Adds missing objects; never copies production records or changes existing SNS tables.
create table public.blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(blocker_id,blocked_id), check(blocker_id<>blocked_id)
);
create index blocks_blocked_idx on public.blocks(blocked_id);
alter table public.blocks enable row level security;
create policy "staging blocks read own" on public.blocks for select to authenticated using(blocker_id=(select auth.uid()));
create policy "staging blocks insert own" on public.blocks for insert to authenticated with check(blocker_id=(select auth.uid()) and blocker_id<>blocked_id);
create policy "staging blocks delete own" on public.blocks for delete to authenticated using(blocker_id=(select auth.uid()));
revoke all on public.blocks from public,anon,authenticated;
grant select,insert,delete on public.blocks to authenticated;

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  target_type text not null check(target_type in ('post','comment')),
  target_id uuid not null,
  reason text not null check(reason in ('harassment','inappropriate','spam','personal_info','dangerous','other')),
  note text check(note is null or char_length(note)<=500),
  status text not null default 'open' check(status in ('open','reviewed','actioned','dismissed')),
  created_at timestamptz not null default now(),
  unique(reporter_user_id,target_type,target_id)
);
create index reports_status_created_idx on public.reports(status,created_at desc);
alter table public.reports enable row level security;
create policy "staging reports insert own" on public.reports for insert to authenticated with check(reporter_user_id=(select auth.uid()) and status='open');
revoke all on public.reports from public,anon,authenticated;
grant insert on public.reports to authenticated;

create table public.app_events (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  event text not null check(event in ('app_open','panda_room_open','panda_tap','exercise_recorded','mission_completed')),
  created_at timestamptz not null default now()
);
create index app_events_user_id_idx on public.app_events(user_id);
alter table public.app_events enable row level security;
create policy "staging events insert own" on public.app_events for insert to authenticated with check(user_id=(select auth.uid()));
revoke all on public.app_events from public,anon,authenticated;
grant insert on public.app_events to authenticated;
grant usage on sequence public.app_events_id_seq to authenticated;

create table public.user_progress (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb check(jsonb_typeof(data)='object'),
  updated_at timestamptz not null default now()
);
alter table public.user_progress enable row level security;
create policy "staging progress read own" on public.user_progress for select to authenticated using(user_id=(select auth.uid()));
create policy "staging progress insert own" on public.user_progress for insert to authenticated with check(user_id=(select auth.uid()));
create policy "staging progress update own" on public.user_progress for update to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
create policy "staging progress delete own" on public.user_progress for delete to authenticated using(user_id=(select auth.uid()));
revoke all on public.user_progress from public,anon,authenticated;
grant select,insert,update,delete on public.user_progress to authenticated;

-- The app uses getPublicUrl for avatars; only synthetic test images belong here.
-- Writes, replacements and removal are restricted to {auth.uid()}/avatar.jpg.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('avatars','avatars',true,3145728,array['image/jpeg']);
create policy "staging avatars read" on storage.objects for select to authenticated using(bucket_id='avatars');
create policy "staging avatars insert own" on storage.objects for insert to authenticated with check(bucket_id='avatars' and name=(select auth.uid())::text||'/avatar.jpg');
create policy "staging avatars update own" on storage.objects for update to authenticated using(bucket_id='avatars' and name=(select auth.uid())::text||'/avatar.jpg') with check(bucket_id='avatars' and name=(select auth.uid())::text||'/avatar.jpg');
create policy "staging avatars delete own" on storage.objects for delete to authenticated using(bucket_id='avatars' and name=(select auth.uid())::text||'/avatar.jpg');
