-- ═══════════════════════════════════════════════════════════════════════════
-- ストア準備: ユーザー通報の差分を v50 の定義へ戻す
--
-- 【本番で実行する場合は別途承認が必要】
-- ユーザー通報（target_type = 'user'）が1件でもあると、CHECK を戻せないため中止します。
-- 通報の記録を自動で消すことはしません。扱いを運営が決めてから、改めて実行してください。
-- アプリを先にユーザー通報なしの版へ戻すこと（戻さないと、通報ボタンが失敗表示になる）。
-- ═══════════════════════════════════════════════════════════════════════════
begin;

do $$
begin
  if exists (select 1 from public.reports where target_type = 'user') then
    raise exception 'user reports exist; decide how to keep them before rolling back';
  end if;
end $$;

alter table public.reports drop constraint if exists reports_target_type_valid;
alter table public.reports add  constraint reports_target_type_valid
  check (target_type in ('post','comment'));

drop policy if exists "reports: insert own" on public.reports;
create policy "reports: insert own" on public.reports
  for insert to authenticated
  with check (reporter_user_id = auth.uid());

commit;
