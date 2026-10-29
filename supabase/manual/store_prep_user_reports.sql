-- ═══════════════════════════════════════════════════════════════════════════
-- ストア準備: ユーザー自身の通報（reports.target_type = 'user'）差分案
--
-- 【本番へ適用しないこと】これは差分案です。本番への適用には、対象と影響を示した別の承認が必要です。
--   staging への適用・確認は Work が管理します。
--   supabase/migrations/ には置いていません（migration群の一括適用の対象にしないため）。
--
-- 【前提】適用前に store_prep_user_reports_verify_readonly.sql の結果を保存し、次を確認する。
--   ・reports の INSERT ポリシーが "reports: insert own" の1件だけで、
--     with_check が (reporter_user_id = auth.uid()) であること（v50 と同じ）
--   ・public.public_profiles VIEW が存在すること（v51.4.1）
--   異なる場合は適用せず、現在の定義を読んだうえで差分を作り直す。
--
-- 【変えるもの】reports の target_type CHECK と INSERT ポリシーの2つだけ。
--   ・'user' を通報対象に追加
--   ・'user' の場合は「自分以外」かつ「存在するユーザー」だけを許可
--     （存在確認は public_profiles を使う。非公開アカウントも通報できる）
--   ・post / comment の扱い、SELECT/UPDATE/DELETE を作らない方針、権限は変えない
-- 【変えないもの】既存の通報データ、blocks、その他のテーブル。
-- 1つのトランザクションで実行するので、途中で失敗したら何も変わらない。
-- 戻し方: store_prep_user_reports_rollback.sql
-- ═══════════════════════════════════════════════════════════════════════════
begin;

alter table public.reports drop constraint if exists reports_target_type_valid;
alter table public.reports add  constraint reports_target_type_valid
  check (target_type in ('post','comment','user'));

drop policy if exists "reports: insert own" on public.reports;
create policy "reports: insert own" on public.reports
  for insert to authenticated
  with check (
    reporter_user_id = auth.uid()
    and (
      target_type <> 'user'
      or (target_id <> auth.uid()
          and exists (select 1 from public.public_profiles pp where pp.id = target_id))
    )
  );

commit;
