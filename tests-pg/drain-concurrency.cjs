// NOT RUN. Real-PostgreSQL concurrency check for the U1 drain (several connections). Never touches Supabase.
// Safety (refuses to run otherwise, exit 2):
//   - YT_DISPOSABLE_PG=1 and YT_DISPOSABLE_MARKER=<name> are set (the workflow sets both; the marker is the container's POSTGRES_DB);
//   - PG_URL points to localhost / 127.0.0.1 / ::1;
//   - the server holds no non-template database other than "postgres" and the marker (i.e. a freshly started throwaway server);
//   - each case creates its own database with a unique random name and refuses if it exists. Nothing is ever dropped.
// Ordering never relies on sleeping: every writer is parked on an advisory lock held by a control connection, and the control connection
// confirms in pg_locks that the writer is waiting there before the next step. If that is not seen in time, the case is INCONCLUSIVE
// (exit 3 if nothing failed), never a pass. Results: one JSON line per case and drain-concurrency-result.json.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const V = require('./verdicts.cjs');   // pure verdict rules (unit-tested without a database)

function refuse(msg) { console.error('refused: ' + msg); process.exit(2); }
const URL0 = process.env.PG_URL;
if (!URL0) refuse('PG_URL required');
if (process.env.YT_DISPOSABLE_PG !== '1') refuse('YT_DISPOSABLE_PG=1 required (throwaway server only)');
const MARKER = process.env.YT_DISPOSABLE_MARKER || '';
if (!/^yt_throwaway_[a-z0-9_]{4,40}$/.test(MARKER)) refuse('YT_DISPOSABLE_MARKER must look like yt_throwaway_<id>');
const u0 = new URL(URL0);
if (!['localhost', '127.0.0.1', '[::1]', '::1'].includes(u0.hostname)) refuse('PG_URL host must be local');
const { Client } = require('pg');   // loaded only after the checks above

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

const results = []; let failed = false, inconclusive = false;
function report(name, verdict, detail) {   // verdict: 'pass' | 'fail' | 'inconclusive' | 'observation'
  if (verdict === 'fail') failed = true;
  if (verdict === 'inconclusive') inconclusive = true;
  const line = { name, verdict, ...detail }; results.push(line); console.log(JSON.stringify(line));
}
class Inconclusive extends Error {}

async function guardServer() {
  const c = new Client({ connectionString: URL0 }); await c.connect();
  const dbs = (await c.query('select datname from pg_database where not datistemplate')).rows.map(r => r.datname);
  await c.end();
  const extra = dbs.filter(d => d !== 'postgres' && d !== MARKER);
  if (!dbs.includes(MARKER)) refuse('marker database not found: not the throwaway server');
  if (extra.length) refuse('server holds other databases: ' + extra.length + ' (not a fresh throwaway server)');
}
async function makeDb(label, extra) {
  const name = 'yt_case_' + label + '_' + crypto.randomBytes(6).toString('hex');
  const admin = new Client({ connectionString: URL0 }); await admin.connect();
  const exists = (await admin.query('select 1 from pg_database where datname=$1', [name])).rowCount;
  if (exists) { await admin.end(); refuse('database already exists: ' + name); }
  await admin.query(`create database ${name}`); await admin.end();
  const u = new URL(URL0); u.pathname = '/' + name;
  const c = new Client({ connectionString: u.toString() }); await c.connect();
  await c.query(STUBS); await c.query(read('supabase_v28_events.sql'));
  for (const f of fs.readdirSync(path.join(root, 'supabase/migrations')).filter(n => n.endsWith('.sql')).sort()) await c.query(read('supabase/migrations/' + f));
  await c.query(AFTER); await c.query(read('supabase/manual/deletion_u1_prepare.sql'));
  for (const f of extra) await c.query(read(f));
  await c.end();
  return u.toString();
}
const conn = async url => { const c = new Client({ connectionString: url }); await c.connect(); return c; };
const pidOf = async c => (await c.query('select pg_backend_pid() p')).rows[0].p;
const svc = async (c, sql) => { await c.query('reset role'); await c.query('set role service_role'); try { return await c.query(sql); } finally { await c.query('reset role'); } };
const outcome = p => p.then(() => ({ ok: true }), e => ({ ok: false, code: e.code, message: e.message }));
// Barrier: wait (polling the catalog, no fixed sleep for ordering) until `pid` is waiting on a lock matching `where`.
async function waitBlocked(ctl, pid, where, what) {
  for (let i = 0; i < 200; i++) {
    const r = await ctl.query(`select 1 from pg_locks where pid=$1 and not granted and ${where}`, [pid]);
    if (r.rowCount) return;
    await new Promise(res => setTimeout(res, 50));
  }
  throw new Inconclusive('barrier not reached: ' + what);
}
const ADV = key => `locktype='advisory' and classid=0 and objid=${key} and objsubid=1`;
async function runCase(name, fn) {
  try { await fn(); } catch (e) { if (e instanceof Inconclusive) report(name, 'inconclusive', { reason: e.message }); else report(name, 'fail', { error: e.message }); }
}

// A user-path completion that takes its statement snapshot, then parks (advisory lock) before writing; R commits while it is parked.
async function lateWriter(url, name, observeOnly) {
  const ctl = await conn(url), w = await conn(url), s = await conn(url);
  try {
    await ctl.query('select pg_advisory_lock(7001)');
    await w.query('begin'); await w.query(`select set_config('request.jwt.claim.sub','${A}',true)`); await w.query('set local role authenticated');
    const wpid = await pidOf(w);
    const pending = outcome(w.query(`insert into storage.objects(bucket_id,name) select 'avatars','${A}/avatar.jpg' from (select pg_advisory_xact_lock(7001)) l`));
    await waitBlocked(ctl, wpid, ADV(7001), 'writer parked after its snapshot');
    const job = (await svc(s, `select public.yt_deletion_accept('${A}',3600) id`)).rows[0].id;   // R committed while the writer is parked
    await svc(s, `select public.yt_deletion_drain_mark('${job}')`);
    const drainedWhileOpen = (await svc(s, `select public.yt_deletion_drained('${job}') v`)).rows[0].v;
    await ctl.query('select pg_advisory_unlock(7001)');
    const writer = await pending; await w.query(writer.ok ? 'commit' : 'rollback');
    const drainedAfter = (await svc(s, `select public.yt_deletion_drained('${job}') v`)).rows[0].v;
    const rowExists = (await s.query(`select count(*)::int n from storage.objects where name='${A}/avatar.jpg'`)).rows[0].n === 1;
    const o = { writer, drainedWhileOpen, drainedAfter, rowExists };
    const verdict = V.lateWriter(o, observeOnly);
    report(name, verdict, observeOnly ? { gapSeen: verdict === 'observation' && drainedWhileOpen === true, ...o } : o);
  } finally { await ctl.end(); await w.end(); await s.end(); }
}
// EXPERIMENTAL trigger: a service-user (signed-style) write whose statement began before R committed is refused with SQLSTATE 42501.
async function signedStyle(url) {
  const ctl = await conn(url), w = await conn(url), s = await conn(url);
  try {
    // Control: the same write succeeds before any refusal.
    await w.query('begin');
    const control = await outcome(w.query(`insert into storage.objects(bucket_id,name,owner_id) values ('avatars','${A}/signed.jpg','${A}')`));
    await w.query('rollback');
    if (!control.ok) { report('trigger refuses a service-user write that completes after R', V.signedStyle({ control }), { control }); return; }
    await ctl.query('select pg_advisory_lock(7002)');
    await w.query('begin'); const wpid = await pidOf(w);
    const pending = outcome(w.query(`insert into storage.objects(bucket_id,name,owner_id) select 'avatars','${A}/signed.jpg','${A}' from (select pg_advisory_xact_lock(7002)) l`));
    await waitBlocked(ctl, wpid, ADV(7002), 'service-user writer parked');
    await svc(s, `select public.yt_deletion_accept('${A}',3600)`);
    await ctl.query('select pg_advisory_unlock(7002)');
    const writer = await pending; await w.query('rollback');
    report('trigger refuses a service-user write that completes after R', V.signedStyle({ control, writer }), { control, writer });
  } finally { await ctl.end(); await w.end(); await s.end(); }
}
// An unrelated idle-in-transaction connection holds the drain until it ends (a cost, expected).
async function idleHolder(url) {
  const x = await conn(url), s = await conn(url);
  try {
    await x.query('begin'); await x.query('select 1');
    const job = (await svc(s, `select public.yt_deletion_accept('${B}',3600) id`)).rows[0].id;
    await svc(s, `select public.yt_deletion_drain_mark('${job}')`);
    const held = (await svc(s, `select public.yt_deletion_drained('${job}') v`)).rows[0].v;
    await x.query('commit');
    const released = (await svc(s, `select public.yt_deletion_drained('${job}') v`)).rows[0].v;
    report('idle transaction open at capture holds the drain until it ends', held === false && released === true ? 'pass' : 'fail', { held, released });
  } finally { await x.end(); await s.end(); }
}
// A transaction started after the capture: does not hold the drain; its user-path write is refused by RLS (42501). Control first.
async function afterCapture(url) {
  const s = await conn(url), w = await conn(url);
  try {
    await w.query('begin'); await w.query(`select set_config('request.jwt.claim.sub','${B}',true)`); await w.query('set local role authenticated');
    const control = await outcome(w.query(`insert into storage.objects(bucket_id,name) values ('avatars','${B}/avatar.jpg')`));
    await w.query('rollback');
    if (!control.ok) { report('a transaction started after the capture does not hold the drain and is refused by RLS', V.afterCapture({ control }), { control }); return; }
    const job = (await svc(s, `select public.yt_deletion_accept('${B}',3600) id`)).rows[0].id;
    await svc(s, `select public.yt_deletion_drain_mark('${job}')`);
    await w.query('begin'); await w.query(`select set_config('request.jwt.claim.sub','${B}',true)`); await w.query('set local role authenticated');
    const drained = (await svc(s, `select public.yt_deletion_drained('${job}') v`)).rows[0].v;
    const writer = await outcome(w.query(`insert into storage.objects(bucket_id,name) values ('avatars','${B}/avatar.jpg')`));
    await w.query('rollback');
    report('a transaction started after the capture does not hold the drain and is refused by RLS', V.afterCapture({ control, drained, writer }), { control, drained, writer });
  } finally { await s.end(); await w.end(); }
}
// The capture is not hidden by an activity snapshot taken earlier in the same transaction (pg_stat_clear_snapshot).
async function snapshotReuse(url) {
  const s = await conn(url), x = await conn(url), ctl = await conn(url);
  try {
    const job = (await svc(s, `select public.yt_deletion_accept('${A}',3600) id`)).rows[0].id;
    await s.query('begin'); await s.query('set local role service_role');
    await s.query('select count(*) from pg_stat_activity');   // takes the per-transaction activity snapshot
    await x.query('begin'); await x.query('select 1'); const xpid = await pidOf(x);
    const seen = await ctl.query(`select 1 from pg_stat_activity where pid=$1 and xact_start is not null`, [xpid]);
    if (!seen.rowCount) throw new Inconclusive('x transaction not visible to the control connection');
    await s.query(`select public.yt_deletion_drain_mark('${job}')`);
    await s.query('commit');
    const captured = (await s.query(`select count(*)::int n from yt_private.deletion_drain_waits where job_id='${job}' and pid=$1`, [xpid])).rows[0].n === 1;
    await x.query('commit');
    report('capture is not hidden by an earlier statistics snapshot in the same transaction', captured ? 'pass' : 'fail', { captured });
  } finally { await s.end(); await x.end(); await ctl.end(); }
}
// Two marks at the same time: the second blocks on the job row; the capture time is set once; both callers' captures are kept.
async function concurrentMarks(url) {
  const s = await conn(url), m1 = await conn(url), m2 = await conn(url), ctl = await conn(url);
  try {
    const job = (await svc(s, `select public.yt_deletion_accept('${A}',3600) id`)).rows[0].id;
    await m1.query('begin'); await m1.query('set local role service_role');
    await m2.query('begin'); await m2.query('set local role service_role');
    const p1 = await pidOf(m1), p2 = await pidOf(m2);
    await m1.query(`select public.yt_deletion_drain_mark('${job}')`);
    // m1's capture time as exact text (no precision lost), read inside m1 before it commits.
    await m1.query('reset role');
    const capturedAtBefore = (await m1.query(`select drain_captured_at::text t from yt_private.account_deletion_jobs where id='${job}'`)).rows[0].t;
    const m1CapturedM2 = (await m1.query(`select count(*)::int n from yt_private.deletion_drain_waits where job_id='${job}' and pid=$1`, [p2])).rows[0].n === 1;
    const pending = outcome(m2.query(`select public.yt_deletion_drain_mark('${job}')`));
    await waitBlocked(ctl, p2, `locktype in ('transactionid','tuple')`, 'second mark waiting for the first');
    const drainedWhileBlocked = (await svc(s, `select public.yt_deletion_drained('${job}') v`)).rows[0].v;
    await m1.query('commit');
    const second = await pending;
    const drainedWhileM2Open = second.ok ? (await svc(s, `select public.yt_deletion_drained('${job}') v`)).rows[0].v : null;
    await m2.query(second.ok ? 'commit' : 'rollback');
    const capturedAtAfter = (await s.query(`select drain_captured_at::text t from yt_private.account_deletion_jobs where id='${job}'`)).rows[0].t;
    const drainedAfterBoth = (await svc(s, `select public.yt_deletion_drained('${job}') v`)).rows[0].v;
    const o = { second, capturedAtBefore, capturedAtAfter, m1CapturedM2, drainedWhileBlocked, drainedWhileM2Open, drainedAfterBoth, p1, p2 };
    report('two concurrent marks: second waits, no error, capture time unchanged, drain false until both end', V.concurrentMarks(o), o);
  } finally { await s.end(); await m1.end(); await m2.end(); await ctl.end(); }
}
// A session that turns track_activities off for itself (state 'disabled') makes mark fail closed even though the caller's setting is on.
async function perSessionDisabled(url) {
  const x = await conn(url), s = await conn(url);
  try {
    await x.query('set track_activities = off'); await x.query('begin'); await x.query('select 1');
    const job = (await svc(s, `select public.yt_deletion_accept('${B}',3600) id`)).rows[0].id;
    const callerOn = (await s.query(`select current_setting('track_activities') v`)).rows[0].v === 'on';
    const r = await outcome(svc(s, `select public.yt_deletion_drain_mark('${job}')`));
    await x.query('commit');
    const nothing = (await s.query(`select drain_captured_at is null n from yt_private.account_deletion_jobs where id='${job}'`)).rows[0].n;
    const o = { callerOn, mark: r, nothingCaptured: nothing };
    report('per-session track_activities off fails closed', V.perSessionDisabled(o), o);
  } finally { await x.end(); await s.end(); }
}

(async () => {
  await guardServer();
  const oldUrl = await makeDb('old', []);
  const cap = ['supabase/manual/deletion_u1_drain_capture.sql'];
  await runCase('old rule late writer', () => lateWriter(oldUrl, 'old transaction-id rule with a parked late writer (observation)', true));
  await runCase('capture late writer', async () => lateWriter(await makeDb('cap', cap), 'capture rule waits for a parked late writer open at capture', false));
  await runCase('trigger', async () => signedStyle(await makeDb('trig', [...cap, 'supabase/manual/EXPERIMENTAL_deletion_u1_storage_trigger.sql'])));
  await runCase('idle', async () => idleHolder(await makeDb('idle', cap)));
  await runCase('after capture', async () => afterCapture(await makeDb('after', cap)));
  await runCase('snapshot reuse', async () => snapshotReuse(await makeDb('snap', cap)));
  await runCase('concurrent marks', async () => concurrentMarks(await makeDb('marks', cap)));
  await runCase('per-session disabled', async () => perSessionDisabled(await makeDb('disabled', cap)));
  fs.writeFileSync(path.join(root, 'drain-concurrency-result.json'), JSON.stringify(results, null, 1) + '\n');
  process.exit(failed ? 1 : inconclusive ? 3 : 0);
})().catch(e => { console.error(e); process.exit(1); });
