// NOT RUN. Real-PostgreSQL concurrency check K1-K4: detail compaction (deletion_u1_detail_compact.sql at ee7c471) against the sweep
// v2 begin/finish (deletion_u1_sweep_v2.sql), in both orders. Several connections; database functions only (no Storage, no Supabase).
// Safety (refuses otherwise, exit 2; same as the other runners): YT_DISPOSABLE_PG=1, YT_DISPOSABLE_MARKER=yt_throwaway_<id>,
//   PG_URL on localhost/127.0.0.1/::1 only, and a server holding only "postgres" and the marker database. Each case gets a new database
//   with a random name; an existing name is refused; nothing is dropped. No secrets.
// Ordering: the second connection's wait is confirmed in pg_locks before the first commits; otherwise INCONCLUSIVE (never a pass).
// Each case first compacts a separate eligible job (control). Time limits: connect 10 s, statement 30 s, client 35 s.
// Output: one JSON line per case (results only) and compact-concurrency-result.json. Exit: 1 failed, 3 inconclusive only, 0 all passed.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const V = require('./compact-verdicts.cjs');
const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');

function refuse(msg) { console.error('refused: ' + msg); process.exit(2); }
const URL0 = process.env.PG_URL;
if (!URL0) refuse('PG_URL required');
if (process.env.YT_DISPOSABLE_PG !== '1') refuse('YT_DISPOSABLE_PG=1 required (throwaway server only)');
const MARKER = process.env.YT_DISPOSABLE_MARKER || '';
if (!/^yt_throwaway_[a-z0-9_]{4,40}$/.test(MARKER)) refuse('YT_DISPOSABLE_MARKER must look like yt_throwaway_<id>');
const u0 = new URL(URL0);
if (!['localhost', '127.0.0.1', '[::1]', '::1'].includes(u0.hostname)) refuse('PG_URL host must be local');
const { Client } = require('pg');   // loaded only after the checks above

const LIMITS = { connectionTimeoutMillis: 10000, statement_timeout: 30000, query_timeout: 35000 };
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

const results = []; let failed = false, inconclusive = false;
function report(name, verdict, detail) {
  if (verdict === 'fail') failed = true;
  if (verdict === 'inconclusive') inconclusive = true;
  const line = { name, verdict, ...detail }; results.push(line); console.log(JSON.stringify(line));
}
class Inconclusive extends Error {}

async function guardServer() {
  const c = new Client({ connectionString: URL0, ...LIMITS }); await c.connect();
  const dbs = (await c.query('select datname from pg_database where not datistemplate')).rows.map(r => r.datname);
  await c.end();
  if (!dbs.includes(MARKER)) refuse('marker database not found: not the throwaway server');
  if (dbs.some(d => d !== 'postgres' && d !== MARKER)) refuse('server holds other databases (not a fresh throwaway server)');
}
async function makeDb(label) {
  const name = 'yt_compact_' + label + '_' + crypto.randomBytes(6).toString('hex');
  const admin = new Client({ connectionString: URL0, ...LIMITS }); await admin.connect();
  if ((await admin.query('select 1 from pg_database where datname=$1', [name])).rowCount) { await admin.end(); refuse('database already exists: ' + name); }
  await admin.query(`create database ${name}`); await admin.end();
  const u = new URL(URL0); u.pathname = '/' + name;
  const c = new Client({ connectionString: u.toString(), ...LIMITS }); await c.connect();
  await c.query(STUBS); await c.query(read('supabase_v28_events.sql'));
  for (const f of fs.readdirSync(path.join(root, 'supabase/migrations')).filter(n => n.endsWith('.sql')).sort()) await c.query(read('supabase/migrations/' + f));
  await c.query(`create table public.user_progress(user_id uuid primary key references auth.users(id) on delete cascade, data jsonb)`);
  await c.query(read('supabase/manual/deletion_u1_prepare.sql'));
  await c.query(read('supabase/manual/deletion_u1_sweep_v2.sql'));
  await c.query(read('supabase/manual/deletion_u1_detail_compact.sql'));
  await c.end();
  return u.toString();
}
const conn = async url => { const c = new Client({ connectionString: url, ...LIMITS }); await c.connect(); return c; };
const pidOf = async c => (await c.query('select pg_backend_pid() p')).rows[0].p;
const outcome = p => p.then(r => ({ ok: true, rows: r.rows, value: r.rows[0] ? r.rows[0].v : undefined }), e => ({ ok: false, code: e.code, message: e.message }));
async function waitBlocked(ctl, pid, what) {
  for (let i = 0; i < 200; i++) {
    const r = await ctl.query(`select 1 from pg_locks where pid=$1 and not granted and locktype in ('transactionid','tuple')`, [pid]);
    if (r.rowCount) return;
    await new Promise(res => setTimeout(res, 50));
  }
  throw new Inconclusive('barrier not reached: ' + what);
}
// An eligible finished job: Auth gone, R evidence, AWAITING_ASSURANCE, one successful sweep, a 2-entry log, quiet for 31 days.
async function eligibleJob(su) {
  const uid = crypto.randomUUID();
  await su.query('insert into auth.users(id) values ($1)', [uid]);
  await su.query('set role service_role');
  const id = (await su.query('select public.yt_deletion_accept($1,3600) v', [uid])).rows[0].v;
  await su.query('reset role');
  await su.query('delete from auth.users where id=$1', [uid]);
  await su.query(`update yt_private.account_deletion_jobs set state='AWAITING_ASSURANCE', auth_deleted_at=now(), last_swept_at=now()-interval '40 days', sweeps=1,
    last_error='raw', log='[{"to":"STORAGE_DELETING"},{"to":"AWAITING_ASSURANCE"}]'::jsonb, lease_owner=null, lease_expires_at=null where id=$1`, [id]);
  await su.query(`update yt_private.deletion_refusals set drained_at=now(), auth_deleted_at=now(), final_empty_at=now() where user_id=$1`, [uid]);
  await su.query('alter table yt_private.account_deletion_jobs disable trigger yt_jobs_detail');
  await su.query(`update yt_private.account_deletion_jobs set last_activity_at=now()-interval '31 days' where id=$1`, [id]);
  await su.query('alter table yt_private.account_deletion_jobs enable trigger yt_jobs_detail');
  return id;
}
const row = async (su, id) => (await su.query('select detail_version, log from yt_private.account_deletion_jobs where id=$1', [id])).rows[0];
const texts = log => (log || []).map(e => JSON.stringify(e));   // each entry as JSON text, for exact comparison
const COMPACT = `select * from public.yt_deletion_compact_detail($1,'CONC','op-1')`;
const items = (id, v) => JSON.stringify([{ job_id: id, row_version: Number(v) }]);
async function control(url) {
  const su = await conn(url);
  try {
    const id = await eligibleJob(su); const v = (await row(su, id)).detail_version;
    await su.query('set role service_role');
    const r = (await su.query(COMPACT, [items(id, v)])).rows[0];
    return !!r && r.result === 'compacted';
  } finally { await su.end(); }
}
async function runCase(name, fn) {
  try { await fn(); } catch (e) { if (e instanceof Inconclusive) report(name, 'inconclusive', { reason: e.message }); else report(name, 'fail', { error: e.message }); }
}

async function k1(url) {
  const ctl0 = await control(url);
  const su = await conn(url), a = await conn(url), b = await conn(url), ctl = await conn(url);
  try {
    const id = await eligibleJob(su); const v0 = Number((await row(su, id)).detail_version);
    await a.query('begin'); await a.query('set local role service_role');
    const compact = (await a.query(COMPACT, [items(id, v0)])).rows[0].result;   // compacted, not committed
    await b.query('set role service_role'); const bpid = await pidOf(b);
    const pending = outcome(b.query(`select public.yt_deletion_sweep_begin($1,'sweep-B',460) v`, [id]));
    let blocked = false;
    try { await waitBlocked(ctl, bpid, 'sweep_begin waiting for the compaction'); blocked = true; } finally { await a.query('commit'); }
    const begin = await pending; const r = await row(su, id);
    const o = { control: ctl0, blocked, compact, begin: { ok: begin.ok, value: begin.value, message: begin.message },
      logLen: r.log.length, summary: !!(r.log[0] && r.log[0].compacted), versionDelta: Number(r.detail_version) - v0 };
    report('K1 compaction then sweep_begin: begin waits, then takes the lease on the compacted job', V.k1(o), o);
  } finally { await su.end(); await a.end(); await b.end(); await ctl.end(); }
}
async function k2(url) {
  const ctl0 = await control(url);
  const su = await conn(url), a = await conn(url), b = await conn(url), ctl = await conn(url);
  try {
    const id = await eligibleJob(su); const r0 = await row(su, id); const v0 = Number(r0.detail_version);
    await b.query('begin'); await b.query('set local role service_role');
    const begin = await outcome(b.query(`select public.yt_deletion_sweep_begin($1,'sweep-B',460) v`, [id]));   // lease, not committed
    await a.query('set role service_role'); const apid = await pidOf(a);
    const pending = outcome(a.query(COMPACT, [items(id, v0)]));
    let blocked = false;
    try { await waitBlocked(ctl, apid, 'compaction waiting for sweep_begin'); blocked = true; } finally { await b.query('commit'); }
    const c = await pending; const r = await row(su, id);
    const o = { control: ctl0, blocked, begin: { ok: begin.ok, value: begin.value }, compact: { ok: c.ok, result: c.ok ? c.rows[0].result : null, message: c.message },
      logBefore: texts(r0.log), logAfter: texts(r.log), summary: !!(r.log[0] && r.log[0].compacted) };
    report('K2 sweep_begin then compaction: compaction waits, then skips the changed job', V.k2(o), o);
  } finally { await su.end(); await a.end(); await b.end(); await ctl.end(); }
}
async function k3(url) {
  const ctl0 = await control(url);
  const su = await conn(url), a = await conn(url), b = await conn(url), ctl = await conn(url);
  try {
    const id = await eligibleJob(su);
    await su.query('set role service_role');
    const g = (await su.query(`select public.yt_deletion_sweep_begin($1,'sweep-B',460) v`, [id])).rows[0].v.generation;   // committed lease
    await su.query('reset role');
    const r0 = await row(su, id); const v0 = Number(r0.detail_version);   // the operator lists the job now
    await b.query('begin'); await b.query('set local role service_role');
    const finish = await outcome(b.query(`select public.yt_deletion_sweep_finish($1,$2,'sweep-B',0,0,0,null,true) v`, [id, g]));   // appends a log entry, not committed
    await a.query('set role service_role'); const apid = await pidOf(a);
    const pending = outcome(a.query(COMPACT, [items(id, v0)]));
    let blocked = false;
    try { await waitBlocked(ctl, apid, 'compaction waiting for sweep_finish'); blocked = true; } finally { await b.query('commit'); }
    const c = await pending; const r = await row(su, id);
    const o = { control: ctl0, blocked, finish: { ok: finish.ok, value: finish.value }, compact: { ok: c.ok, result: c.ok ? c.rows[0].result : null, message: c.message },
      logBefore: texts(r0.log), logAfter: texts(r.log), lastIsSweep: !!(r.log.at(-1) && r.log.at(-1).sweep) };
    report('K3 sweep_finish then compaction: compaction waits, then skips; the new log entry is kept', V.k3(o), o);
  } finally { await su.end(); await a.end(); await b.end(); await ctl.end(); }
}
async function k4(url) {
  const ctl0 = await control(url);
  const su = await conn(url), a = await conn(url), b = await conn(url), ctl = await conn(url);
  try {
    const id = await eligibleJob(su);
    await su.query('set role service_role');
    const g = (await su.query(`select public.yt_deletion_sweep_begin($1,'sweep-B',460) v`, [id])).rows[0].v.generation;   // a running sweep holds the lease
    await su.query('reset role');
    const r0 = await row(su, id); const v0 = Number(r0.detail_version);
    await a.query('begin'); await a.query('set local role service_role');
    const c = await outcome(a.query(COMPACT, [items(id, v0)]));   // holds the row lock until commit
    await b.query('set role service_role'); const bpid = await pidOf(b);
    const pending = outcome(b.query(`select public.yt_deletion_sweep_finish($1,$2,'sweep-B',0,0,0,null,true) v`, [id, g]));
    let blocked = false;
    try { await waitBlocked(ctl, bpid, 'sweep_finish waiting for the compaction call'); blocked = true; } finally { await a.query('commit'); }
    const finish = await pending; const r = await row(su, id);
    const o = { control: ctl0, blocked, compact: { ok: c.ok, result: c.ok ? c.rows[0].result : null, detail: c.ok ? c.rows[0].detail : null, message: c.message },
      finish: { ok: finish.ok, value: finish.value, message: finish.message }, summary: !!(r.log[0] && r.log[0].compacted),
      logBefore: texts(r0.log), logAfter: texts(r.log), lastIsSweep: !!(r.log.at(-1) && r.log.at(-1).sweep) };
    report('K4 compaction during a running sweep: compaction refuses (lease); the finish then records', V.k4(o), o);
  } finally { await su.end(); await a.end(); await b.end(); await ctl.end(); }
}

(async () => {
  await guardServer();
  await runCase('K1', async () => k1(await makeDb('k1')));
  await runCase('K2', async () => k2(await makeDb('k2')));
  await runCase('K3', async () => k3(await makeDb('k3')));
  await runCase('K4', async () => k4(await makeDb('k4')));
  fs.writeFileSync(path.join(root, 'compact-concurrency-result.json'), JSON.stringify(results, null, 1) + '\n');
  process.exit(failed ? 1 : inconclusive ? 3 : 0);
})().catch(e => { console.error(e && e.message ? e.message : 'error'); process.exit(1); });
