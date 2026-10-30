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
--   staging には 2026-10-31 に第1版（c04631a）を適用済み（"reports: insert own"・public_profiles 参照）。
--   この版をもう一度実行すると、その状態からも同じ定義になる。
--   2026-10-31 の Work の実検証：staging の public_profiles は security_invoker = true で、profiles の SELECT は
--   「本人 または is_public = true」。第1版の public_profiles 参照では、非公開アカウントを通報できなかった。
--
-- 【変えるもの】target_type の CHECK と、INSERT ポリシーの2つだけ。
--   ・'user' を通報対象に追加
--   ・INSERT は1件だけにする（permissive ポリシーは OR で合算されるため、旧ポリシーを必ず消す）
--     reporter_user_id = auth.uid() かつ status = 'open'（既存の条件を維持）
--     'user' のときはさらに「自分以外」かつ「通報する人が、いま見えている相手」
--       見えている＝通報する人の RLS のもとで、相手のプロフィール・コメント・投稿のいずれかを読める
--       （公開アカウント、または公開投稿にコメントした非公開アカウントなど、SNS で出会った相手）
--     SECURITY DEFINER の関数や VIEW は使わず、プロフィールを読める範囲も広げない。
--     見えない相手（非公開で、見える投稿もコメントもない）と存在しない ID は、同じ拒否になる。
-- 【変えないもの】既存の通報データ、status / note / 重複防止の制約、権限、blocks、他のテーブル。
--
-- 想定外の制約やポリシーが見つかったら、何も変えずに中止する（全体が1つのトランザクション）。
-- 適用前に store_prep_user_reports_verify_readonly.sql の結果を保存しておくこと。
-- 戻し方: store_prep_user_reports_rollback.sql
-- ═══════════════════════════════════════════════════════════════════════════
begin;

do $$
begin
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
          and reports.target_id <> auth.uid()
          and (exists (select 1 from public.profiles pr where pr.id = reports.target_id)
               or exists (select 1 from public.comments c where c.user_id = reports.target_id)
               or exists (select 1 from public.posts po where po.user_id = reports.target_id)))
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
