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

-- The target user never changes, and a job row is never removed by this draft: the row is what refuses the user's writes,
-- and no time limit or operator mark proves that an upload which passed its check earlier cannot still complete.
-- Releasing the refusal needs a separately reviewed and approved method; until then the row (user id + step results) stays.
create or replace function yt_private.jobs_guard() returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    if new.user_id <> old.user_id then raise exception 'account deletion job: user_id is immutable'; end if;
    new.updated_at := now();
    return new;
  end if;
  raise exception 'account deletion job: rows cannot be removed (no proven release condition)';
end
$$;
drop trigger if exists jobs_guard on yt_private.account_deletion_jobs;
create trigger jobs_guard before update or delete on yt_private.account_deletion_jobs
  for each row execute function yt_private.jobs_guard();

-- Used by the restrictive policies below. No arguments: a caller learns only whether their own writes are allowed.
create or replace function yt_private.write_allowed() returns boolean
  language sql stable security definer set search_path = '' as $$
  select not exists (select 1 from yt_private.account_deletion_jobs j where j.user_id = auth.uid())
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
commit;
