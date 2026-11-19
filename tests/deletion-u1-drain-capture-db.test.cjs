// U1 drain capture (supported pieces only) and the EXPERIMENTAL storage trigger, in an isolated in-memory PostgreSQL (PGlite).
// PGlite has one connection: other backends are modelled by replacing yt_private.backend_activity with fixed rows. Real concurrency
// is NOT shown here (see tests-pg/drain-concurrency.cjs, not run). No connection to any Supabase project.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { PGlite } = require('@electric-sql/pglite');
const A='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', B='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', C='cccccccc-cccc-cccc-cccc-cccccccccccc';
const PREPARE=fs.readFileSync('supabase/manual/deletion_u1_prepare.sql','utf8');
const CAPTURE=fs.readFileSync('supabase/manual/deletion_u1_drain_capture.sql','utf8');
const CAPTURE_RB=fs.readFileSync('supabase/manual/deletion_u1_drain_capture_rollback.sql','utf8');
const TRIGGER=fs.readFileSync('supabase/manual/EXPERIMENTAL_deletion_u1_storage_trigger.sql','utf8');
const TRIGGER_RB=fs.readFileSync('supabase/manual/EXPERIMENTAL_deletion_u1_storage_trigger_rollback.sql','utf8');
const refused=/permission denied|row-level security|violates/i;

async function database(t){
  const db=new PGlite();
  t.after(()=>db.close());
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth; create schema storage;
    create table auth.users(id uuid primary key, raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth, storage to anon, authenticated, service_role;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,owner_id text, unique(bucket_id,name));
    alter table storage.objects enable row level security;
    create function storage.foldername(text) returns text[] language sql immutable as
      $$ select (string_to_array($1,'/'))[1:array_length(string_to_array($1,'/'),1)-1] $$;
    grant select,insert,update,delete on storage.objects to anon, authenticated;
  `);
  await db.exec(fs.readFileSync('supabase_v28_events.sql','utf8'));
  for(const file of fs.readdirSync('supabase/migrations').filter(n=>n.endsWith('.sql')).sort())
    await db.exec(fs.readFileSync('supabase/migrations/'+file,'utf8'));
  await db.exec(`create table public.user_progress(user_id uuid primary key references auth.users(id) on delete cascade, data jsonb);
    insert into auth.users(id) values ('${A}'),('${B}'),('${C}');`);
  await db.exec(PREPARE);
  const as=async(id,sql)=>{
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id||'']);
    await db.exec('set role '+(id==='service'?'service_role':id?'authenticated':'anon'));
    return db.query(sql);
  };
  const su=async sql=>{await db.exec('reset role');return db.query(sql);};
  const suExec=async sql=>{await db.exec('reset role');return db.exec(sql);};
  return {db,as,su,suExec};
}
// Replace the activity view with fixed rows (pid, backend_start, xact_start, backend_type).
async function fakeActivity(suExec){
  await suExec(`create table yt_private.fake_activity(pid integer, backend_start timestamptz, xact_start timestamptz, backend_type text, state text default 'active');
    create or replace view yt_private.backend_activity as select pid, backend_start, xact_start, backend_type, state from yt_private.fake_activity;`);
}
const T0="'2026-11-18 10:00:00+00'", T1="'2026-11-18 10:00:05+00'", T2="'2026-11-18 10:00:09+00'";

test('drain capture: waits only for client transactions open right after R committed; a new transaction on the same backend does not count',async t=>{
  const {as,su,suExec}=await database(t);
  await suExec(CAPTURE);
  await fakeActivity(suExec);
  await suExec(`insert into yt_private.fake_activity values
    (4242, ${T0}, ${T1}, 'client backend'),          -- a Storage completion still open
    (pg_backend_pid(), ${T0}, ${T1}, 'client backend'),  -- this call itself: not waited for
    (5151, ${T0}, ${T1}, 'autovacuum worker'),       -- not a client
    (6161, ${T0}, null, 'client backend')`);          // idle, no transaction
  const job=(await as('service',`select public.yt_deletion_accept('${A}',3600) id`)).rows[0].id;
  await as('service',`select public.yt_deletion_drain_mark('${job}')`);
  assert.deepEqual((await su(`select pid from yt_private.deletion_drain_waits where job_id='${job}' order by pid`)).rows.map(r=>r.pid),[4242]);
  assert.equal((await as('service',`select public.yt_deletion_drained('${job}') v`)).rows[0].v,false,'open completion: not drained');
  // A transaction that starts after the capture does not hold the drain back, and a second mark does not capture again.
  await su(`insert into yt_private.fake_activity values (7171, ${T0}, ${T2}, 'client backend')`);
  await as('service',`select public.yt_deletion_drain_mark('${job}')`);
  assert.equal((await su(`select count(*)::int n from yt_private.deletion_drain_waits where job_id='${job}'`)).rows[0].n,1);
  // Same backend, new transaction start: the captured transaction has ended.
  await su(`update yt_private.fake_activity set xact_start=${T2} where pid=4242`);
  assert.equal((await as('service',`select public.yt_deletion_drained('${job}') v`)).rows[0].v,true);
  // Same pid but a different backend (pid reused after a reconnect) also counts as ended.
  await su(`update yt_private.fake_activity set xact_start=${T1}, backend_start=${T2} where pid=4242`);
  assert.equal((await as('service',`select public.yt_deletion_drained('${job}') v`)).rows[0].v,true);
  await su(`update yt_private.fake_activity set backend_start=${T0} where pid=4242`);
  assert.equal((await as('service',`select public.yt_deletion_drained('${job}') v`)).rows[0].v,false,'the same transaction again: not drained');
  await su(`delete from yt_private.fake_activity where pid=4242`);
  assert.equal((await as('service',`select public.yt_deletion_drained('${job}') v`)).rows[0].v,true);
});

test('drain capture: not drained before a mark, before the capture time, or while the earlier transaction-id rule fails',async t=>{
  const {as,su,suExec}=await database(t);
  await suExec(CAPTURE);
  await fakeActivity(suExec);
  const job=(await as('service',`select public.yt_deletion_accept('${A}',3600) id`)).rows[0].id;
  assert.equal((await as('service',`select public.yt_deletion_drained('${job}') v`)).rows[0].v,false,'no mark yet');
  // A job created by the earlier draft (drain_xmax only, no capture) is not drained until it is captured.
  await su(`update yt_private.account_deletion_jobs set drain_xmax=1 where id='${job}'`);
  assert.equal((await as('service',`select public.yt_deletion_drained('${job}') v`)).rows[0].v,false,'xid bound alone is not enough');
  await as('service',`select public.yt_deletion_drain_mark('${job}')`);
  assert.equal((await as('service',`select public.yt_deletion_drained('${job}') v`)).rows[0].v,true);
  await su(`update yt_private.account_deletion_jobs set drain_xmax=9000000000 where id='${job}'`);
  assert.equal((await as('service',`select public.yt_deletion_drained('${job}') v`)).rows[0].v,false,'both rules are required');
});

test('drain capture: refuses to capture before R is visible; users cannot call it or read the captured rows; applying twice is the same; rollback puts back the old rule',async t=>{
  const {as,su,suExec}=await database(t);
  await suExec(CAPTURE);await suExec(CAPTURE);
  await su(`insert into yt_private.account_deletion_jobs(user_id, token_ttl_seconds) values ('${C}',3600)`);
  const jc=(await su(`select id from yt_private.account_deletion_jobs where user_id='${C}'`)).rows[0].id;
  await assert.rejects(()=>as('service',`select public.yt_deletion_drain_mark('${jc}')`),/refusal not visible/);
  for(const sql of [`select public.yt_deletion_drain_mark('${jc}')`,`select public.yt_deletion_drained('${jc}')`,
                    'select * from yt_private.deletion_drain_waits','select * from yt_private.backend_activity'])
    for(const who of [A,null]) await assert.rejects(()=>as(who,sql),/permission denied/,sql);
  await fakeActivity(suExec);
  await suExec(`insert into yt_private.fake_activity values (4242, ${T0}, ${T1}, 'client backend')`);
  const job=(await as('service',`select public.yt_deletion_accept('${A}',3600) id`)).rows[0].id;
  await as('service',`select public.yt_deletion_drain_mark('${job}')`);
  assert.equal((await as('service',`select public.yt_deletion_drained('${job}') v`)).rows[0].v,false);
  await suExec(CAPTURE_RB);
  assert.equal((await as('service',`select public.yt_deletion_drained('${job}') v`)).rows[0].v,true,'old rule ignores the open transaction (weaker)');
  assert.equal((await su(`select count(*)::int n from yt_private.deletion_drain_waits`)).rows[0].n,1,'captured rows are kept');
});

test('drain capture fails closed: a hidden client row, track_activities off, or an owner without pg_read_all_stats stops mark and drained',async t=>{
  const {as,su,suExec}=await database(t);
  await suExec(CAPTURE);
  await fakeActivity(suExec);
  const job=(await as('service',`select public.yt_deletion_accept('${A}',3600) id`)).rows[0].id;
  // A row whose columns are hidden (NULL state) must not be read as "no transaction".
  await su(`insert into yt_private.fake_activity values (4242, ${T0}, null, 'client backend', null)`);
  await assert.rejects(()=>as('service',`select public.yt_deletion_drain_mark('${job}')`),/not fully visible/);
  assert.equal((await su(`select drain_captured_at from yt_private.account_deletion_jobs where id='${job}'`)).rows[0].drain_captured_at,null,'nothing captured');
  // A session that turned track_activities off for itself shows state 'disabled' (the caller's own setting is on).
  await su(`update yt_private.fake_activity set state='disabled', xact_start=null`);
  await assert.rejects(()=>as('service',`select public.yt_deletion_drain_mark('${job}')`),/not fully visible/,'per-session disabled');
  await su(`update yt_private.fake_activity set state='idle'`);
  await as('service',`select public.yt_deletion_drain_mark('${job}')`);
  await su(`update yt_private.fake_activity set state=null, backend_start=null`);
  await assert.rejects(()=>as('service',`select public.yt_deletion_drained('${job}')`),/not fully visible/,'drained also fails closed');
  await su(`update yt_private.fake_activity set state='idle', backend_start=${T0}`);
  assert.equal((await as('service',`select public.yt_deletion_drained('${job}') v`)).rows[0].v,true);
  // track_activities off (session setting by the superuser, then the service call in the same session).
  await su(`set track_activities = off`);
  await assert.rejects(()=>as('service',`select public.yt_deletion_drained('${job}')`),/track_activities must be on/);
  await su(`set track_activities = on`);
  // An owner that cannot read all statistics.
  await suExec(`create role yt_owner nologin; grant usage on schema yt_private to yt_owner;
    grant select, insert, update on all tables in schema yt_private to yt_owner;
    alter function public.yt_deletion_drained(uuid) owner to yt_owner;
    alter function yt_private.assert_activity_visible() owner to yt_owner;`);
  await assert.rejects(()=>as('service',`select public.yt_deletion_drained('${job}')`),/cannot read all statistics/);
  await su(`grant pg_read_all_stats to yt_owner`);
  assert.equal((await as('service',`select public.yt_deletion_drained('${job}') v`)).rows[0].v,true);
});

test('EXPERIMENTAL trigger: as the service user (no policies), writes for a refused user are refused by folder or owner, on insert and on moves; deletes and others are not',async t=>{
  const {as,su,suExec}=await database(t);
  await su(`insert into storage.objects(bucket_id,name,owner_id) values ('avatars','${A}/old.jpg','${A}'),('post-images','${B}/b.jpg','${B}'),('other','x/y.jpg',null)`);
  await suExec(TRIGGER);await suExec(TRIGGER);
  await as('service',`select public.yt_deletion_accept('${A}',3600)`);
  const guard=/writes refused for a user being deleted/;
  await assert.rejects(()=>su(`insert into storage.objects(bucket_id,name,owner_id) values ('avatars','${A}/new.jpg','${A}')`),guard,'signed-style insert by folder');
  await assert.rejects(()=>su(`insert into storage.objects(bucket_id,name,owner_id) values ('post-images','${B}/x.jpg','${A}')`),guard,'by owner');
  await assert.rejects(()=>su(`update storage.objects set name='${B}/moved.jpg', owner_id='${B}' where name='${A}/old.jpg'`),guard,'move out of the refused folder');
  await assert.rejects(()=>su(`update storage.objects set name='${A}/in.jpg' where name='${B}/b.jpg'`),guard,'move into the refused folder');
  await assert.rejects(()=>su(`update storage.objects set bucket_id='other' where name='${A}/old.jpg'`),guard,'move to another bucket');
  await su(`insert into storage.objects(bucket_id,name,owner_id) values ('post-images','${B}/ok.jpg','${B}')`);
  await su(`insert into storage.objects(bucket_id,name,owner_id) values ('other','${A}/elsewhere.jpg','${A}')`);   // other buckets untouched
  await su(`insert into storage.objects(bucket_id,name,owner_id) values ('avatars','public/logo.png',null)`);      // no user key
  await su(`delete from storage.objects where name='${A}/old.jpg'`);
  assert.equal((await su(`select count(*)::int n from storage.objects where bucket_id in ('avatars','post-images') and (name like '${A}/%' or owner_id='${A}')`)).rows[0].n,0);
  await assert.rejects(()=>as(A,`insert into storage.objects(bucket_id,name) values ('avatars','${A}/avatar.jpg')`),/row-level security|writes refused/,'user path still refused');
});

test('EXPERIMENTAL trigger: other isolation levels are refused for the two buckets (fail closed); rollback removes only the trigger',async t=>{
  const {db,as,su,suExec}=await database(t);
  await suExec(TRIGGER);
  await suExec('begin isolation level repeatable read');
  await assert.rejects(()=>db.query(`insert into storage.objects(bucket_id,name,owner_id) values ('avatars','${B}/rr.jpg','${B}')`),/READ COMMITTED/);
  await db.exec('rollback');
  await suExec('begin isolation level repeatable read');
  await db.query(`insert into storage.objects(bucket_id,name) values ('other','${B}/rr.jpg')`);
  await db.exec('commit');
  await as('service',`select public.yt_deletion_accept('${A}',3600)`);
  await suExec(TRIGGER_RB);
  await su(`insert into storage.objects(bucket_id,name,owner_id) values ('avatars','${A}/after-rollback.jpg','${A}')`);   // service path open again
  assert.equal((await su(`select count(*)::int n from yt_private.deletion_refusals where user_id='${A}'`)).rows[0].n,1,'R kept');
  assert.equal((await su(`select count(*)::int n from pg_trigger where tgname='yt_deletion_write_guard'`)).rows[0].n,0);
});
