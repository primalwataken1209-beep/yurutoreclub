-- ═══════════════════════════════════════════════════════════════════════════
-- ストア準備: ユーザー自身の通報（reports.target_type = 'user'）差分案
--
-- 【本番へ適用しないこと】これは差分案です。本番への適用には、対象と影響を示した別の承認が必要です。
--   staging への適用・確認は Work が管理します。
--   supabase/migrations/ には置いていません（migration群の一括適用の対象にしないため）。
--
-- 【前提にした現在の定義】2026-10-29 に Work が staging・本番の両方を読み取りで確認したもの
--   CHECK  reports_target_type_check : target_type in ('post','comment')
--   INSERT "staging reports insert own" : reporter_user_id = auth.uid() and status = 'open'
--   一般向けの SELECT / UPDATE / DELETE ポリシーなし
--   リポジトリの v50 migration から作った環境では、名前が reports_target_type_valid と
--   "reports: insert own"（status 条件なし）になる。どちらの形でも同じ結果になるように書いている。
--
-- 【変えるもの】target_type の CHECK と、INSERT ポリシーの2つだけ。
--   ・'user' を通報対象に追加
--   ・INSERT は1件だけにする（permissive ポリシーは OR で合算されるため、旧ポリシーを必ず消す）
--     reporter_user_id = auth.uid() かつ status = 'open'（既存の条件を維持）
--     'user' のときはさらに「自分以外」かつ「public_profiles に存在するユーザー」
--     （public_profiles を使うので、非公開アカウントも通報できる）
-- 【変えないもの】既存の通報データ、status / note / 重複防止の制約、権限、blocks、他のテーブル。
--
-- 想定外の制約やポリシーが見つかったら、何も変えずに中止する（全体が1つのトランザクション）。
-- 適用前に store_prep_user_reports_verify_readonly.sql の結果を保存しておくこと。
-- 戻し方: store_prep_user_reports_rollback.sql
-- ═══════════════════════════════════════════════════════════════════════════
begin;

do $$
begin
  if not exists (select 1 from information_schema.views
                 where table_schema = 'public' and table_name = 'public_profiles') then
    raise exception 'public.public_profiles is missing; stop and review';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.reports'::regclass) then
    raise exception 'RLS is not enabled on public.reports; stop and review';
  end if;
  if exists (select 1 from pg_policies
             where schemaname = 'public' and tablename = 'reports'
               and policyname not in ('staging reports insert own', 'reports: insert own')) then
    raise exception 'unexpected policy on public.reports; stop and review';
  end if;
end $$;

-- 名前の分かっている旧定義だけを消す
alter table public.reports drop constraint if exists reports_target_type_check;
alter table public.reports drop constraint if exists reports_target_type_valid;
drop policy if exists "staging reports insert own" on public.reports;
drop policy if exists "reports: insert own" on public.reports;

do $$
begin
  if exists (select 1 from pg_constraint
             where conrelid = 'public.reports'::regclass and contype = 'c'
               and pg_get_constraintdef(oid) like '%target_type%') then
    raise exception 'another CHECK on target_type remains; stop and review';
  end if;
end $$;

alter table public.reports add constraint reports_target_type_check
  check (target_type in ('post','comment','user'));

create policy "reports: insert own" on public.reports
  for insert to authenticated
  with check (
    reporter_user_id = auth.uid()
    and status = 'open'
    and (
      target_type in ('post','comment')
      or (target_type = 'user'
          and target_id <> auth.uid()
          and exists (select 1 from public.public_profiles pp where pp.id = target_id))
    )
  );

do $$
begin
  if (select count(*) from pg_policies
      where schemaname = 'public' and tablename = 'reports') <> 1 then
    raise exception 'expected exactly one policy on public.reports after the change';
  end if;
end $$;

commit;
