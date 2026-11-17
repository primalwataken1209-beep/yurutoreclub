-- REVIEWED ROLLBACK ONLY. Not applied to any hosted Supabase project.
-- Removes the report retention functions and triggers and restores the earlier table-wide INSERT grant
-- (v50: grant insert on public.reports to authenticated). The management columns and their values are KEPT:
-- dropping them would erase completion dates, holds and decisions, which no rollback could bring back.
-- No report is deleted by this file.
begin;
drop function if exists public.yt_report_close(uuid,text,text,text);
drop function if exists public.yt_report_extend_review(uuid,timestamptz,text,text);
drop function if exists public.yt_report_hold(uuid,boolean,timestamptz,text,text);
drop function if exists public.yt_report_reopen(uuid,text,text);
drop function if exists public.yt_report_resolve_legacy(uuid,timestamptz,text,text);
drop function if exists public.yt_report_deletion_candidates(timestamptz);
drop function if exists public.yt_report_deletion_recheck(jsonb,timestamptz);
drop function if exists public.yt_report_review_list(timestamptz);
drop trigger if exists yt_reports_before_insert on public.reports;
drop trigger if exists yt_reports_before_update on public.reports;
drop function if exists yt_private.reports_before_insert();
drop function if exists yt_private.reports_before_update();
drop function if exists yt_private.report_deletable(public.reports, timestamptz);
revoke insert (reporter_user_id, target_type, target_id, reason, note) on public.reports from authenticated;
grant insert on public.reports to authenticated;
commit;
