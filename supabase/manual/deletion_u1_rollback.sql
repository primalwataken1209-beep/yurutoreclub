-- REVIEWED ROLLBACK ONLY. Not applied to any hosted Supabase project.
-- Removes only the restrictive "yt deletion: no ... while deleting" policies. This brings back the weakness: a user whose deletion
-- is in progress can write images/rows again with a still-valid access token. Keep new deletions and distribution stopped while rolled back.
-- Kept on purpose: the refusal records (R), the job records (L), their tables and functions (they are the list of deletions still to
-- finish and their evidence), and the sign-URL guard (it does not touch normal saving; removing it reopens signed uploads, see below).
-- Nothing is restored: deleted accounts, rows and files cannot be brought back by any step.
begin;
do $guard$
begin
  if ((to_regclass('yt_private.deletion_refusals') is not null and exists (select 1 from yt_private.deletion_refusals))
      or (to_regclass('yt_private.account_deletion_jobs') is not null and exists (select 1 from yt_private.account_deletion_jobs)))
     and coalesce(current_setting('yt.rollback_reopens_pending_users', true), '') <> 'acknowledged' then
    raise exception 'deletion refusals or jobs exist; rolling back lets those users write again with still-valid tokens. Set yt.rollback_reopens_pending_users = acknowledged in this session only after approval';
  end if;
end
$guard$;
do $drop$
declare t record;
begin
  for t in select * from (values
      ('storage','objects','insert'),('storage','objects','update'),
      ('public','profiles','insert'),('public','profiles','update'),
      ('public','posts','insert'),('public','posts','update'),
      ('public','comments','insert'),('public','comments','update'),
      ('public','post_reactions','insert'),('public','follows','insert'),('public','blocks','insert'),('public','reports','insert'),
      ('public','user_progress','insert'),('public','user_progress','update'),('public','app_events','insert')) v(sch, tbl, cmd)
  loop
    continue when to_regclass(format('%I.%I', t.sch, t.tbl)) is null;
    execute format('drop policy if exists %I on %I.%I', format('yt deletion: no %s while deleting', t.cmd), t.sch, t.tbl);
  end loop;
  -- The sign-URL guard is removed only on its own explicit acknowledgement (e.g. if it is found to block something it should not).
  if coalesce(current_setting('yt.remove_sign_url_guard', true), '') = 'acknowledged' then
    drop policy if exists "yt no signed upload urls insert" on storage.objects;
    drop policy if exists "yt no signed upload urls update" on storage.objects;
  end if;
end
$drop$;
commit;
