-- REVIEWED PREPARATION ONLY. Not applied to any hosted Supabase project. Staging (knftduojdalnawvkbelt) only, after separate approval.
-- U1: while an account deletion job exists for a user, that user's own JWT can no longer create or change rows/files
-- (images, profile, posts, comments, reactions, follows, blocks, reports, synced progress, usage events). Deleting own rows/files stays allowed.
-- This does NOT prove that an upload whose permission check passed before the job existed cannot complete later
-- (Storage's check/commit order is not documented). Jobs are therefore never marked complete here.
-- No user data or files are read, changed or deleted by this file. Existing policies are not modified.
begin;
do $preflight$
begin
  if not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='storage' and c.relname='objects' and c.relrowsecurity) then
    raise exception 'storage.objects RLS must already be enabled';
  end if;
  if not exists(select 1 from pg_roles where rolname='service_role') then
    raise exception 'service_role must exist';
  end if;
end
$preflight$;

-- Private schema: not part of the Data API's exposed schemas (verify the project's exposed-schema setting before applying).
create schema if not exists yt_private;
revoke all on schema yt_private from public;

-- One job per user. No foreign key to auth.users: the job must outlive the Auth user (it is the reason writes stay refused).
-- Holds only the user id, state and step results. No email, name, image, token or IP.
create table if not exists yt_private.account_deletion_jobs(
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null unique,
  state             text not null default 'WRITES_BLOCKED' check (state in
                      ('WRITES_BLOCKED','STORAGE_DELETING','STORAGE_VERIFIED','DB_DELETING','AUTH_DELETING',
                       'AWAITING_ASSURANCE','NEEDS_RETRY','NEEDS_OPERATOR')),
  generation        bigint not null default 0,
  lease_owner       text,
  lease_expires_at  timestamptz,
  token_ttl_seconds integer not null check (token_ttl_seconds > 0),
  requested_at      timestamptz not null default now(),
  auth_deleted_at   timestamptz,
  hold_until        timestamptz,
  attempts          integer not null default 0,
  last_step         text,
  last_error        text,
  log               jsonb not null default '[]'::jsonb,
  updated_at        timestamptz not null default now()
);
revoke all on yt_private.account_deletion_jobs from public, anon, authenticated;

-- Snapshot boundary for the "drain" check (see yt_deletion_drain_mark), kept in the detailed job record.
alter table yt_private.account_deletion_jobs add column if not exists drain_xmax bigint;

-- R: the minimal refusal record. Only this table decides whether a user's writes are refused. It holds the user id, when the
-- refusal began, and the evidence timestamps needed before any future release could even be considered. No release exists here:
-- no time limit or operator mark proves that every upload which passed its check earlier has ended.
create table if not exists yt_private.deletion_refusals(
  user_id         uuid primary key,
  refused_since   timestamptz not null default now(),
  drained_at      timestamptz,   -- every transaction in progress at acceptance had ended (yt_deletion_drained)
  auth_deleted_at timestamptz,   -- the Auth user was deleted
  final_empty_at  timestamptz    -- the user's Storage prefixes were listed empty after the Auth deletion (an observation, not a proof)
);
revoke all on yt_private.deletion_refusals from public, anon, authenticated;
-- Evidence only moves forward (set once, never cleared or changed); user id and start never change; a refusal is never removed.
create or replace function yt_private.refusals_guard() returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then raise exception 'deletion refusal: rows cannot be removed (no proven release condition)'; end if;
  if new.user_id <> old.user_id or new.refused_since <> old.refused_since then
    raise exception 'deletion refusal: user_id and refused_since are immutable';
  end if;
  if (old.drained_at is not null and new.drained_at is distinct from old.drained_at)
     or (old.auth_deleted_at is not null and new.auth_deleted_at is distinct from old.auth_deleted_at)
     or (old.final_empty_at is not null and new.final_empty_at is distinct from old.final_empty_at) then
    raise exception 'deletion refusal: evidence can be set once and never changed';
  end if;
  return new;
end
$$;
drop trigger if exists refusals_guard on yt_private.deletion_refusals;
create trigger refusals_guard before update or delete on yt_private.deletion_refusals
  for each row execute function yt_private.refusals_guard();

-- L (this detailed job record) is never removed by this draft. AWAITING_ASSURANCE is not a terminal state, and L is what the operator
-- entry (job_id), the sweep below, the drain boundary, the generation/lease and the step history depend on. A removal rule needs a
-- genuinely terminal condition that does not exist yet.
create or replace function yt_private.jobs_guard() returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    if new.user_id <> old.user_id then raise exception 'account deletion job: user_id is immutable'; end if;
    new.updated_at := now();
    return new;
  end if;
  raise exception 'account deletion job: rows cannot be removed (no terminal state is defined)';
end
$$;
drop trigger if exists jobs_guard on yt_private.account_deletion_jobs;
create trigger jobs_guard before update or delete on yt_private.account_deletion_jobs
  for each row execute function yt_private.jobs_guard();

-- Used by the restrictive policies below. No arguments: a caller learns only whether their own writes are allowed.
create or replace function yt_private.write_allowed() returns boolean
  language sql stable security definer set search_path = '' as $$
  select not exists (select 1 from yt_private.deletion_refusals r where r.user_id = auth.uid())
$$;
revoke all on function yt_private.write_allowed() from public;
grant usage on schema yt_private to anon, authenticated;
grant execute on function yt_private.write_allowed() to anon, authenticated;

-- Service-only entry points for the delete-account function (public schema so the function can call them; never for users).
create or replace function public.yt_deletion_accept(p_user uuid, p_token_ttl_seconds integer) returns uuid
  language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if p_user is null then raise exception 'user required'; end if;
  -- The refusal (R) and the job (L) are created in the same transaction.
  insert into yt_private.deletion_refusals(user_id) values (p_user) on conflict (user_id) do nothing;
  insert into yt_private.account_deletion_jobs(user_id, token_ttl_seconds) values (p_user, p_token_ttl_seconds)
    on conflict (user_id) do nothing;
  select id into v_id from yt_private.account_deletion_jobs where user_id = p_user;
  return v_id;
end
$$;

-- Take the lease when it is free or expired; every take raises the generation, which fences out the previous worker.
create or replace function public.yt_deletion_claim(p_job uuid, p_owner text, p_lease_seconds integer) returns jsonb
  language plpgsql security definer set search_path = '' as $$
declare r yt_private.account_deletion_jobs;
begin
  update yt_private.account_deletion_jobs
     set generation = generation + 1, lease_owner = p_owner,
         lease_expires_at = now() + make_interval(secs => p_lease_seconds), attempts = attempts + 1
   where id = p_job and state <> 'AWAITING_ASSURANCE'
     and (lease_expires_at is null or lease_expires_at < now() or lease_owner = p_owner)
  returning * into r;
  if not found then return null; end if;
  return jsonb_build_object('generation', r.generation, 'state', r.state, 'user_id', r.user_id);
end
$$;

-- Compare-and-set: succeeds only for the current generation and owner, with at least p_min_lease_seconds of lease left,
-- and only from one of the expected states. A worker calls this right before each outside action.
create or replace function public.yt_deletion_advance(p_job uuid, p_generation bigint, p_owner text, p_from text[], p_to text,
  p_note jsonb, p_min_lease_seconds integer, p_auth_deleted boolean default false) returns boolean
  language plpgsql security definer set search_path = '' as $$
begin
  update yt_private.account_deletion_jobs
     set state = p_to, last_step = p_to,
         last_error = coalesce(p_note ->> 'error', case when p_to in ('NEEDS_RETRY','NEEDS_OPERATOR') then last_error end),
         log = log || jsonb_build_array(coalesce(p_note, '{}'::jsonb) || jsonb_build_object('at', now(), 'to', p_to)),
         auth_deleted_at = case when p_auth_deleted then now() else auth_deleted_at end,
         -- Earliest time worth reviewing the job (all access tokens issued up to the Auth deletion have expired, plus 5 minutes).
         -- Informational only: it does not release the refusal and does not allow removing the job.
         hold_until = case when p_auth_deleted then now() + make_interval(secs => token_ttl_seconds + 300) else hold_until end,
         lease_owner = case when p_to in ('AWAITING_ASSURANCE','NEEDS_RETRY','NEEDS_OPERATOR') then null else lease_owner end,
         lease_expires_at = case when p_to in ('AWAITING_ASSURANCE','NEEDS_RETRY','NEEDS_OPERATOR') then null else lease_expires_at end
   where id = p_job and generation = p_generation and lease_owner = p_owner
     and lease_expires_at > now() + make_interval(secs => p_min_lease_seconds)
     and state = any(p_from);
  return found;
end
$$;

-- Drain: Storage (public source 14b42c3, uploader.ts 246-304; added in f31599e) re-checks the caller's policies and writes the object
-- row in ONE transaction at completion. Record the upper bound of the transaction ids that could exist when the refusal became visible;
-- once the oldest running transaction is past it, every completion that checked policies before the refusal has ended (committed and
-- visible to a listing, or rolled back). Called after acceptance has committed; only the first call records the bound.
-- Valid only if the running Storage version re-checks at completion (not visible on staging; unconfirmed) and only for paths that
-- re-check as the user (not for signed uploads, which run as the service user: closed separately by the sign-URL guard below).
create or replace function public.yt_deletion_drain_mark(p_job uuid) returns bigint
  language plpgsql security definer set search_path = '' as $$
declare v bigint;
begin
  update yt_private.account_deletion_jobs
     set drain_xmax = (pg_snapshot_xmax(pg_current_snapshot()))::text::bigint
   where id = p_job and drain_xmax is null;
  select drain_xmax into v from yt_private.account_deletion_jobs where id = p_job;
  if v is null then raise exception 'job not found'; end if;
  return v;
end
$$;
create or replace function public.yt_deletion_drained(p_job uuid) returns boolean
  language sql stable security definer set search_path = '' as $$
  select j.drain_xmax is not null and (pg_snapshot_xmin(pg_current_snapshot()))::text::bigint >= j.drain_xmax
    from yt_private.account_deletion_jobs j where j.id = p_job
$$;
-- Evidence for R, set once per kind (drained / auth_deleted / final_empty) for the job's user.
create or replace function public.yt_deletion_evidence(p_job uuid, p_kind text) returns boolean
  language plpgsql security definer set search_path = '' as $$
declare v_user uuid;
begin
  select user_id into v_user from yt_private.account_deletion_jobs where id = p_job;
  if v_user is null then raise exception 'job not found'; end if;
  if p_kind = 'drained' then
    update yt_private.deletion_refusals set drained_at = now() where user_id = v_user and drained_at is null;
  elsif p_kind = 'auth_deleted' then
    update yt_private.deletion_refusals set auth_deleted_at = now() where user_id = v_user and auth_deleted_at is null;
  elsif p_kind = 'final_empty' then
    update yt_private.deletion_refusals set final_empty_at = now() where user_id = v_user and final_empty_at is null;
  else
    raise exception 'unknown evidence kind';
  end if;
  return true;
end
$$;
-- Sweep (reconciliation after the Auth deletion). An upload that was already authorized and still streaming outside any database
-- transaction (e.g. a signed upload started before the sign-URL guard and key revocation) is not covered by the drain boundary, and
-- neither key rotation nor revocation is documented to stop it. Instead of a time limit, the operator keeps sweeping the user's
-- prefixes for every refused user whose job is past the Auth deletion; each sweep removes what it finds and is recorded. A single empty
-- sweep is an observation, not a completion: there is still no terminal state and the refusal stays.
alter table yt_private.account_deletion_jobs add column if not exists last_swept_at timestamptz;
alter table yt_private.account_deletion_jobs add column if not exists sweeps integer not null default 0;
alter table yt_private.account_deletion_jobs add column if not exists late_objects_removed integer not null default 0;
-- Which user a sweep may touch: only jobs whose Auth user is already deleted (AWAITING_ASSURANCE, or NEEDS_OPERATOR after the Auth
-- deletion). Returns null for anything else, so the sweep cannot be pointed at an account that is still in use.
create or replace function public.yt_deletion_sweep_target(p_job uuid) returns uuid
  language sql stable security definer set search_path = '' as $$
  select j.user_id from yt_private.account_deletion_jobs j
   where j.id = p_job and j.auth_deleted_at is not null and j.state in ('AWAITING_ASSURANCE','NEEDS_OPERATOR')
$$;
create or replace function public.yt_deletion_sweep_record(p_job uuid, p_removed integer, p_remaining integer) returns boolean
  language plpgsql security definer set search_path = '' as $$
begin
  if p_removed < 0 or p_remaining < 0 then raise exception 'counts must be non-negative'; end if;
  update yt_private.account_deletion_jobs
     set last_swept_at = now(), sweeps = sweeps + 1, late_objects_removed = late_objects_removed + p_removed,
         log = log || jsonb_build_array(jsonb_build_object('at', now(), 'sweep', true, 'removed', p_removed, 'remaining', p_remaining))
   where id = p_job and auth_deleted_at is not null and state in ('AWAITING_ASSURANCE','NEEDS_OPERATOR');
  return found;
end
$$;
-- The operator's daily list of jobs to sweep (oldest sweep first). Nothing here ends the sweeping.
create or replace function public.yt_deletion_sweep_list() returns table(job_id uuid, state text, auth_deleted_at timestamptz,
  last_swept_at timestamptz, sweeps integer, late_objects_removed integer)
  language sql stable security definer set search_path = '' as $$
  select j.id, j.state, j.auth_deleted_at, j.last_swept_at, j.sweeps, j.late_objects_removed
    from yt_private.account_deletion_jobs j
   where j.auth_deleted_at is not null and j.state in ('AWAITING_ASSURANCE','NEEDS_OPERATOR')
   order by j.last_swept_at nulls first, j.auth_deleted_at
$$;

do $svc$
declare f text;
begin
  foreach f in array array['public.yt_deletion_drain_mark(uuid)','public.yt_deletion_drained(uuid)','public.yt_deletion_evidence(uuid,text)',
                           'public.yt_deletion_sweep_target(uuid)','public.yt_deletion_sweep_record(uuid,integer,integer)','public.yt_deletion_sweep_list()'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end
$svc$;

revoke all on function public.yt_deletion_accept(uuid, integer) from public, anon, authenticated;
revoke all on function public.yt_deletion_claim(uuid, text, integer) from public, anon, authenticated;
revoke all on function public.yt_deletion_advance(uuid, bigint, text, text[], text, jsonb, integer, boolean) from public, anon, authenticated;
grant execute on function public.yt_deletion_accept(uuid, integer) to service_role;
grant execute on function public.yt_deletion_claim(uuid, text, integer) to service_role;
grant execute on function public.yt_deletion_advance(uuid, bigint, text, text[], text, jsonb, integer, boolean) to service_role;

-- Restrictive guards (AND-ed with every existing policy). Creation/change is refused while a job exists; deletion is not touched.
do $guards$
declare
  t record;
  pol text;
begin
  for t in select * from (values
      ('storage','objects','insert'),('storage','objects','update'),
      ('public','profiles','insert'),('public','profiles','update'),
      ('public','posts','insert'),('public','posts','update'),
      ('public','comments','insert'),('public','comments','update'),
      ('public','post_reactions','insert'),
      ('public','follows','insert'),
      ('public','blocks','insert'),
      ('public','reports','insert'),
      ('public','user_progress','insert'),('public','user_progress','update'),
      ('public','app_events','insert')) v(sch, tbl, cmd)
  loop
    -- Tables that do not exist in a given project (e.g. user_progress/app_events in production) are skipped, not created.
    continue when to_regclass(format('%I.%I', t.sch, t.tbl)) is null;
    pol := format('yt deletion: no %s while deleting', t.cmd);
    execute format('drop policy if exists %I on %I.%I', pol, t.sch, t.tbl);
    if t.sch = 'storage' then
      if t.cmd = 'insert' then
        execute format('create policy %I on storage.objects as restrictive for insert to anon, authenticated with check (bucket_id not in (''avatars'',''post-images'') or yt_private.write_allowed())', pol);
      else
        execute format('create policy %I on storage.objects as restrictive for update to anon, authenticated using (bucket_id not in (''avatars'',''post-images'') or yt_private.write_allowed()) with check (bucket_id not in (''avatars'',''post-images'') or yt_private.write_allowed())', pol);
      end if;
    elsif t.cmd = 'insert' then
      execute format('create policy %I on %I.%I as restrictive for insert to anon, authenticated with check (yt_private.write_allowed())', pol, t.sch, t.tbl);
    else
      execute format('create policy %I on %I.%I as restrictive for update to anon, authenticated using (yt_private.write_allowed()) with check (yt_private.write_allowed())', pol, t.sch, t.tbl);
    end if;
  end loop;
end
$guards$;

-- Sign-URL guard (all users, not only those being deleted): refuse creating signed UPLOAD URLs for avatars/post-images.
-- Public source 14b42c3: a signed upload (and signed TUS) is checked against the user's policies only when the URL is created
-- (object.ts 1986-1994, operation 'storage.object.sign_upload_url', route POST /object/upload/sign/...); the upload itself runs as the
-- service user (object/index.ts 47-55, db.ts 94-112), so a refusal added later cannot stop it. Storage sets storage.operation and
-- request.path for every request (postgres/scope.ts 15-24, 78; present since at least e07d10b). The app never creates signed upload
-- URLs (it uploads directly and only signs DOWNLOAD URLs), so normal saving is unaffected. If the running Storage version did not set
-- these values, this guard would not trigger (fail open); that must be confirmed on staging with an ordinary account before relying on it.
-- URLs created before this guard existed are not affected by it. Per the official URL signing keys guide (read 2026-11-18), rotation
-- alone keeps BOTH keys valid; the previous key must then be revoked (separate approval; separate from the Auth JWT key). A revoked key
-- can be moved back to standby, but that revives old URLs and is not a normal safety rollback. Neither rotation nor revocation is
-- documented to stop an upload that was already authorized and is still streaming: the sweep in the deletion function covers that.
drop policy if exists "yt no signed upload urls insert" on storage.objects;
drop policy if exists "yt no signed upload urls update" on storage.objects;
create policy "yt no signed upload urls insert" on storage.objects as restrictive for insert to anon, authenticated
  with check (bucket_id not in ('avatars','post-images')
    or (coalesce(current_setting('storage.operation', true), '') <> 'storage.object.sign_upload_url'
        and coalesce(current_setting('request.path', true), '') not like '%/object/upload/sign/%'));
create policy "yt no signed upload urls update" on storage.objects as restrictive for update to anon, authenticated
  using (bucket_id not in ('avatars','post-images')
    or (coalesce(current_setting('storage.operation', true), '') <> 'storage.object.sign_upload_url'
        and coalesce(current_setting('request.path', true), '') not like '%/object/upload/sign/%'))
  with check (bucket_id not in ('avatars','post-images')
    or (coalesce(current_setting('storage.operation', true), '') <> 'storage.object.sign_upload_url'
        and coalesce(current_setting('request.path', true), '') not like '%/object/upload/sign/%'));
commit;
