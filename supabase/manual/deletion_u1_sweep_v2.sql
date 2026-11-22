-- REVIEWED DRAFT ONLY. Not applied to any hosted Supabase project. Requires deletion_u1_prepare.sql (6034394) first.
-- Sweep v2: the operator sweep takes the job's lease (so it never runs together with the normal continuation or another sweep),
-- re-checks that the Auth user is really gone, and records only counts and a fixed error class (never raw error text).
-- Adds functions and one column only. The v1 sweep functions, R/L guards, policies and privileges are not changed.
-- Applying this file does not change what the currently deployed delete-account does (it does not call these functions).
begin;
do $pre$
begin
  if to_regprocedure('public.yt_deletion_sweep_record(uuid,integer,integer,text)') is null
     or to_regclass('yt_private.account_deletion_jobs') is null or to_regclass('yt_private.deletion_refusals') is null then
    raise exception 'apply deletion_u1_prepare.sql (6034394) first';
  end if;
end
$pre$;

alter table yt_private.account_deletion_jobs add column if not exists sweep_last_error_class text;

-- Allowed error classes (the only error information a sweep may store).
create or replace function yt_private.sweep_error_class_ok(p text) returns boolean
  language sql immutable set search_path = '' as $$
  select p is null or p in ('list_failed','limit_exceeded','unexpected_layout','time_budget','lease_lost','remove_failed','verify_failed','unexpected')
$$;

-- Begin: lock the job row, check the target again, and take the lease (raising the generation fences any earlier worker).
-- Refusals are returned as {"refused": "<reason>"} and change nothing.
create or replace function public.yt_deletion_sweep_begin(p_job uuid, p_owner text, p_lease_seconds integer) returns jsonb
  language plpgsql security definer set search_path = '' as $$
declare r yt_private.account_deletion_jobs; v_gen bigint;
begin
  if coalesce(btrim(p_owner), '') = '' or p_lease_seconds is null or p_lease_seconds < 60 then raise exception 'owner and a lease of at least 60 s are required'; end if;
  select * into r from yt_private.account_deletion_jobs j where j.id = p_job for update;
  if not found then return jsonb_build_object('refused', 'not_found'); end if;
  if r.auth_deleted_at is null or r.state not in ('AWAITING_ASSURANCE','NEEDS_OPERATOR') then return jsonb_build_object('refused', 'not_past_auth'); end if;
  if exists (select 1 from auth.users u where u.id = r.user_id) then return jsonb_build_object('refused', 'auth_exists'); end if;
  if not exists (select 1 from yt_private.deletion_refusals x where x.user_id = r.user_id) then return jsonb_build_object('refused', 'no_refusal'); end if;
  if r.lease_owner is not null and r.lease_expires_at is not null and r.lease_expires_at > now() then return jsonb_build_object('refused', 'busy'); end if;
  update yt_private.account_deletion_jobs
     set generation = generation + 1, lease_owner = p_owner, lease_expires_at = now() + make_interval(secs => p_lease_seconds)
   where id = p_job returning generation into v_gen;
  return jsonb_build_object('user_id', r.user_id, 'generation', v_gen);
end
$$;

-- Alive: the sweep still holds the lease (same generation and owner) with at least p_min_lease_seconds left. Called before every
-- outside request (each listing page and each removal batch).
create or replace function public.yt_deletion_sweep_alive(p_job uuid, p_generation bigint, p_owner text, p_min_lease_seconds integer) returns boolean
  language sql stable security definer set search_path = '' as $$
  select exists (select 1 from yt_private.account_deletion_jobs j
                  where j.id = p_job and j.generation = p_generation and j.lease_owner = p_owner
                    and j.lease_expires_at > now() + make_interval(secs => greatest(p_min_lease_seconds, 0)))
$$;

-- Finish: record the result and release the lease, only for the same generation and owner (a fenced sweep cannot record).
-- p_error_class null = completed: p_remaining must be known. p_error_class set = stopped: counts may be partial; p_remaining may be null.
-- Does not change the job state (a sweep never completes a deletion). p_release_lease false keeps the lease until it expires: the caller
-- sent a removal request whose outcome is unknown, so nobody else may start on this job while that request may still run.
create or replace function public.yt_deletion_sweep_finish(p_job uuid, p_generation bigint, p_owner text,
  p_planned integer, p_removed integer, p_remaining integer, p_error_class text, p_release_lease boolean) returns boolean
  language plpgsql security definer set search_path = '' as $$
begin
  if p_release_lease is null then raise exception 'p_release_lease is required'; end if;
  if p_removed is null or p_removed < 0 or p_planned < 0 or p_remaining < 0 then raise exception 'counts must be non-negative'; end if;
  if not yt_private.sweep_error_class_ok(p_error_class) then raise exception 'unknown error class'; end if;
  if p_error_class is null and (p_remaining is null or p_planned is null) then raise exception 'a completed sweep needs known planned and remaining counts'; end if;
  update yt_private.account_deletion_jobs
     set last_swept_at        = case when p_error_class is null then now() else last_swept_at end,
         sweeps               = sweeps + case when p_error_class is null then 1 else 0 end,
         last_sweep_failed_at = case when p_error_class is null then last_sweep_failed_at else now() end,
         sweep_failures       = sweep_failures + case when p_error_class is null then 0 else 1 end,
         late_objects_removed = late_objects_removed + p_removed,
         sweep_last_error_class = p_error_class,
         log = log || jsonb_build_array(jsonb_build_object('at', now(), 'sweep', true, 'v', 2, 'ok', p_error_class is null,
                 'planned', p_planned, 'removed', p_removed, 'remaining', p_remaining, 'error_class', p_error_class)),
         lease_owner = case when p_release_lease then null else lease_owner end,
         lease_expires_at = case when p_release_lease then null else lease_expires_at end
   where id = p_job and generation = p_generation and lease_owner = p_owner;
  return found;
end
$$;

do $svc$
declare f text;
begin
  foreach f in array array['public.yt_deletion_sweep_begin(uuid,text,integer)','public.yt_deletion_sweep_alive(uuid,bigint,text,integer)',
                           'public.yt_deletion_sweep_finish(uuid,bigint,text,integer,integer,integer,text,boolean)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end
$svc$;
revoke all on function yt_private.sweep_error_class_ok(text) from public, anon, authenticated;
commit;
