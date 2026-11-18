-- REVIEWED ROLLBACK (SAFE STOP) ONLY. Not applied to any hosted Supabase project.
-- Stops the report retention operations (review/close/hold/reopen/legacy functions, candidate list and re-check) by removing
-- those functions. It deliberately KEEPS what protects the management columns:
--   * the column-only INSERT grant (users still send reports with the same five columns; they cannot set management columns),
--   * the insert trigger (management columns always start from fixed values),
--   * the update trigger (row_version keeps counting every change, so a later re-apply continues the same history),
--   * the management columns and their values, and the settings row.
-- It does NOT restore the old table-wide INSERT grant: the table now has management columns, so that grant would let users set them.
-- No report is deleted. Re-applying report_retention_prepare.sql afterwards recreates the functions without re-migrating rows.
begin;
drop function if exists public.yt_report_close(uuid,text,text,text);
drop function if exists public.yt_report_extend_review(uuid,timestamptz,text,text);
drop function if exists public.yt_report_hold(uuid,boolean,timestamptz,text,text);
drop function if exists public.yt_report_reopen(uuid,text,text);
drop function if exists public.yt_report_resolve_legacy(uuid,timestamptz,text,text);
drop function if exists public.yt_report_deletion_candidates(timestamptz);
drop function if exists public.yt_report_deletion_recheck(jsonb,timestamptz);
drop function if exists public.yt_report_review_list(timestamptz);
do $keep$
begin
  -- Refuse to finish if the protections are not in place (e.g. someone removed them by hand): stopping must not open the table.
  if not exists (select 1 from pg_trigger where tgname = 'yt_reports_before_insert' and tgrelid = 'public.reports'::regclass)
     or not exists (select 1 from pg_trigger where tgname = 'yt_reports_before_update' and tgrelid = 'public.reports'::regclass) then
    raise exception 'report protections (triggers) are missing; re-apply report_retention_prepare.sql instead of stopping';
  end if;
  if exists (select 1 from information_schema.role_table_grants
              where table_schema = 'public' and table_name = 'reports' and grantee in ('anon','authenticated')) then
    raise exception 'a table-wide grant on reports exists; remove it before stopping';
  end if;
end
$keep$;
commit;
