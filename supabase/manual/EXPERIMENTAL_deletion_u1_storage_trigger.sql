-- EXPERIMENTAL. NOT A STAGING OR PRODUCTION CANDIDATE. Not applied anywhere.
-- Supabase's storage schema design guide (https://supabase.com/docs/guides/storage/schema/design, read 2026-11-18) strongly discourages
-- custom changes to the storage schema because they can conflict with future updates or stop working; it names custom indexes as the
-- exception. Whether a user trigger on storage.objects is supported is unconfirmed (support question Q2). Kept only for isolated tests.
--
-- Purpose: signed uploads complete as the service user (Storage v1.96.4 uploadSignedObject.ts: asSuperUser().uploadFromRequest), so
-- policies do not run for them. A row trigger runs for every role. It refuses INSERT/UPDATE of rows in avatars/post-images that belong
-- to a user with a refusal (R). Keys: the first folder of the name and owner_id/owner, for the new row and, on UPDATE, the old row
-- (moves into or out of a refused user's folder, owner changes). DELETE is not touched.
-- No locks are taken (so there is no lock order to get wrong): the ordering comes from deletion_u1_drain_capture.sql. A write whose
-- statement starts after R committed sees R here (VOLATILE function: each query takes a new snapshot in READ COMMITTED); a write still
-- open when R committed is waited for by the drain capture. Other isolation levels are refused for these two buckets (fail closed).
-- Not covered: what happens to the uploaded bytes when the row write is refused (v1.96.4 queues ObjectAdminDelete; completion unproven: Q3).
begin;
do $pre$
begin
  if to_regclass('yt_private.deletion_refusals') is null then raise exception 'apply deletion_u1_prepare.sql first'; end if;
end
$pre$;

create or replace function yt_private.object_user_keys(p_name text, p_row jsonb) returns uuid[]
  language sql immutable set search_path = '' as $$
  select coalesce(array_agg(distinct k::uuid), '{}'::uuid[]) from unnest(array[
      split_part(coalesce(p_name, ''), '/', 1), p_row->>'owner_id', p_row->>'owner']) k
   where k ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
$$;

create or replace function yt_private.storage_write_guard() returns trigger
  language plpgsql volatile security definer set search_path = '' as $$
declare k uuid[] := '{}';
begin
  if new.bucket_id in ('avatars', 'post-images') then k := k || yt_private.object_user_keys(new.name, to_jsonb(new)); end if;
  if tg_op = 'UPDATE' and old.bucket_id in ('avatars', 'post-images') then
    k := k || yt_private.object_user_keys(old.name, to_jsonb(old));
  end if;
  if (new.bucket_id in ('avatars', 'post-images') or (tg_op = 'UPDATE' and old.bucket_id in ('avatars', 'post-images')))
     and current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'yt deletion guard: writes to avatars/post-images need READ COMMITTED' using errcode = '42501';
  end if;
  if cardinality(k) > 0 and exists (select 1 from yt_private.deletion_refusals r where r.user_id = any(k)) then
    raise exception 'yt deletion guard: writes refused for a user being deleted' using errcode = '42501';
  end if;
  return new;
end
$$;
revoke all on function yt_private.storage_write_guard() from public, anon, authenticated;
revoke all on function yt_private.object_user_keys(text, jsonb) from public, anon, authenticated;

drop trigger if exists yt_deletion_write_guard on storage.objects;
create trigger yt_deletion_write_guard before insert or update on storage.objects
  for each row execute function yt_private.storage_write_guard();
commit;
