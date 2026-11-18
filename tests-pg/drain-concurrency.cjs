// NOT RUN. Real-PostgreSQL concurrency check for the U1 drain (two or more connections). Needs a throwaway PostgreSQL 15+ superuser URL
// in PG_URL (e.g. the service container of .github/workflows/u1-drain-concurrency.yml) and the `pg` package (installed only there).
// It creates three scratch databases (yt_old, yt_new, yt_trig), never touches Supabase, and prints one JSON line per case.
// Exit code 1 if any expectation fails. The "old rule gap" case is an observation: it reports whether the gap was seen.
const fs = require('node:fs');
const { Client } = require('pg');
const URL0 = process.env.PG_URL; if (!URL0) { console.error('PG_URL required'); process.exit(2); }
const A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const read = f => fs.readFileSync(f, 'utf8');
const STUBS = `
  do $$ begin
    if not exists (select 1 from pg_roles where rolname='anon') then create role anon; end if;
    if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
    if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role; end if;
  end $$;
  create schema auth; create schema storage;
  create table auth.users(id uuid primary key, raw_user_meta_data jsonb default '{}');
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
  grant usage on schema auth, storage to anon, authenticated, service_role;
  create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
  create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,owner_id text, unique(bucket_id,name));
  alter table storage.objects enable row level security;
  create function storage.foldername(text) returns text[] language sql immutable as $$ select (string_to_array($1,'/'))[1:array_length(string_to_array($1,'/'),1)-1] $$;
  grant select,insert,update,delete on storage.objects to anon, authenticated;`;
const AFTER = `
  create table if not exists public.user_progress(user_id uuid primary key references auth.users(id) on delete cascade, data jsonb);
  create policy "avatars own" on storage.objects for all to authenticated
    using (bucket_id='avatars' and name = auth.uid()::text || '/avatar.jpg') with check (bucket_id='avatars' and name = auth.uid()::text || '/avatar.jpg');
  insert into auth.users(id) values ('${A}'),('${B}');`;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = []; let failed = false;
const report = (name, ok, detail) => { results.push({ name, ok, ...detail }); if (ok === false) failed = true; console.log(JSON.stringify({ name, ok, ...detail })); };

async function makeDb(name, extra) {
  const admin = new Client({ connectionString: URL0 }); await admin.connect();
  await admin.query(`drop database if exists ${name}`); await admin.query(`create database ${name}`); await admin.end();
  const url = new globalThis.URL(URL0); url.pathname = '/' + name;
  const c = new Client({ connectionString: url.toString() }); await c.connect();
  await c.query(STUBS); await c.query(read('supabase_v28_events.sql'));
  for (const f of fs.readdirSync('supabase/migrations').filter(n => n.endsWith('.sql')).sort()) await c.query(read('supabase/migrations/' + f));
  await c.query(AFTER); await c.query(read('supabase/manual/deletion_u1_prepare.sql'));
  for (const f of extra) await c.query(read(f));
  await c.end();
  return url.toString();
}
const conn = async url => { const c = new Client({ connectionString: url }); await c.connect(); return c; };
const svc = async (c, sql) => { await c.query('reset role'); await c.query('set role service_role'); const r = await c.query(sql); await c.query('reset role'); return r; };

// Case 1/2: a user-path completion whose statement snapshot precedes R's commit and whose first write (xid) comes after it.
async function lateWriter(url, label, expectOldGap) {
  const w = await conn(url), s = await conn(url);
  await w.query('begin'); await w.query(`select set_config('request.jwt.claim.sub','${A}',true)`); await w.query('set local role authenticated');
  const pending = w.query(`insert into storage.objects(bucket_id,name) select 'avatars','${A}/avatar.jpg' from pg_sleep(2)`).then(() => 'inserted', e => 'refused: ' + e.message);
  await sleep(400);
  const job = (await svc(s, `select public.yt_deletion_accept('${A}',3600) id`)).rows[0].id;   // R committed (autocommit)
  await svc(s, `select public.yt_deletion_drain_mark('${job}')`);
  const drainedWhileOpen = (await svc(s, `select public.yt_deletion_drained('${job}') v`)).rows[0].v;
  const writer = await pending; await w.query('commit');
  const drainedAfter = (await svc(s, `select public.yt_deletion_drained('${job}') v`)).rows[0].v;
  const rowExists = (await s.query(`select count(*)::int n from storage.objects where name='${A}/avatar.jpg'`)).rows[0].n === 1;
  await w.end(); await s.end();
  if (expectOldGap) report(label, null, { observation: drainedWhileOpen ? 'gap seen: drained while the late writer was open' : 'no gap seen in this run', writer, drainedWhileOpen, drainedAfter, rowExists });
  else report(label, drainedWhileOpen === false && drainedAfter === true, { writer, drainedWhileOpen, drainedAfter, rowExists });
}
// Case 3: the experimental trigger refuses a service-user (signed-style) write whose statement started before R committed.
async function signedStyle(url) {
  const w = await conn(url), s = await conn(url);
  await w.query('begin');
  const pending = w.query(`insert into storage.objects(bucket_id,name,owner_id) select 'avatars','${A}/signed.jpg','${A}' from pg_sleep(2)`).then(() => 'inserted', e => 'refused: ' + e.message);
  await sleep(400);
  await svc(s, `select public.yt_deletion_accept('${A}',3600)`);
  const writer = await pending; await w.query('rollback');
  await w.end(); await s.end();
  report('trigger refuses a service-user write that completes after R', /writes refused/.test(writer), { writer });
}
// Case 4: an unrelated idle-in-transaction connection holds the drain until it ends (cost, not a failure).
async function idleHolder(url) {
  const x = await conn(url), s = await conn(url);
  await x.query('begin'); await x.query('select 1');
  const job = (await svc(s, `select public.yt_deletion_accept('${B}',3600) id`)).rows[0].id;
  await svc(s, `select public.yt_deletion_drain_mark('${job}')`);
  const held = (await svc(s, `select public.yt_deletion_drained('${job}') v`)).rows[0].v;
  await x.query('commit');
  const released = (await svc(s, `select public.yt_deletion_drained('${job}') v`)).rows[0].v;
  await x.end(); await s.end();
  report('idle transaction open at capture holds the drain until it ends', held === false && released === true, { held, released });
}
// Case 5: a transaction that starts after the capture does not hold the drain, and its user-path write sees R.
async function afterCapture(url) {
  const s = await conn(url), w = await conn(url);
  const job = (await svc(s, `select public.yt_deletion_accept('${B}',3600) id`)).rows[0].id;
  await svc(s, `select public.yt_deletion_drain_mark('${job}')`);
  await w.query('begin'); await w.query(`select set_config('request.jwt.claim.sub','${B}',true)`); await w.query('set local role authenticated');
  const drained = (await svc(s, `select public.yt_deletion_drained('${job}') v`)).rows[0].v;
  const writer = await w.query(`insert into storage.objects(bucket_id,name) values ('post-images','${B}/late.jpg')`).then(() => 'inserted', e => 'refused: ' + e.message);
  await w.query('rollback'); await w.end(); await s.end();
  report('a transaction started after the capture does not hold the drain and is refused', drained === true && writer.startsWith('refused'), { drained, writer });
}

// Case 6: a statistics snapshot read earlier in the same transaction is not reused by the capture (pg_stat_clear_snapshot).
async function snapshotReuse(url) {
  const s = await conn(url), x = await conn(url);
  const job = (await svc(s, `select public.yt_deletion_accept('${A}',3600) id`)).rows[0].id;   // R committed first
  await s.query('begin'); await s.query('set local role service_role');
  await s.query('select count(*) from pg_stat_activity');   // takes the per-transaction activity snapshot
  await x.query('begin'); await x.query('select 1');          // opens after that snapshot
  await s.query(`select public.yt_deletion_drain_mark('${job}')`);
  await s.query('commit');
  const xpid = (await x.query('select pg_backend_pid() p')).rows[0].p;
  const captured = (await s.query(`select count(*)::int n from yt_private.deletion_drain_waits where job_id='${job}' and pid=${xpid}`)).rows[0].n === 1;
  await x.query('commit'); await x.end(); await s.end();
  report('capture is not hidden by an earlier statistics snapshot in the same transaction', captured, { captured });
}

(async () => {
  const oldUrl = await makeDb('yt_old', []);
  const newUrl = await makeDb('yt_new', ['supabase/manual/deletion_u1_drain_capture.sql']);
  const trigUrl = await makeDb('yt_trig', ['supabase/manual/deletion_u1_drain_capture.sql', 'supabase/manual/EXPERIMENTAL_deletion_u1_storage_trigger.sql']);
  await lateWriter(oldUrl, 'old transaction-id rule with a late writer (observation)', true);
  await lateWriter(newUrl, 'capture rule waits for a late writer open at capture', false);
  await signedStyle(trigUrl);
  await idleHolder(newUrl);
  await afterCapture(newUrl);
  const snapUrl = await makeDb('yt_snap', ['supabase/manual/deletion_u1_drain_capture.sql']);
  await snapshotReuse(snapUrl);
  fs.writeFileSync('drain-concurrency-result.json', JSON.stringify(results, null, 1) + '\n');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
