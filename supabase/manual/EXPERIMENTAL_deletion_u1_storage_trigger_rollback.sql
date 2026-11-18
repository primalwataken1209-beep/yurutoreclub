-- EXPERIMENTAL ROLLBACK. Not applied anywhere. Removes only the experimental trigger and its two functions. R and L are kept.
begin;
drop trigger if exists yt_deletion_write_guard on storage.objects;
drop function if exists yt_private.storage_write_guard();
drop function if exists yt_private.object_user_keys(text, jsonb);
commit;
