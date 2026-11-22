// NOT RUN. Real-PostgreSQL concurrency check S1-S3 for the sweep v2 lease (supabase/manual/deletion_u1_sweep_v2.sql at ce97a44)
// against the normal claim (deletion_u1_prepare.sql). Several connections; database functions only (no Storage, no Supabase).
// Safety (refuses to run otherwise, exit 2; same as tests-pg/drain-concurrency.cjs and report-purge-concurrency.cjs):
//   YT_DISPOSABLE_PG=1, YT_DISPOSABLE_MARKER=yt_throwaway_<id>, PG_URL on localhost/127.0.0.1/::1 only, and a server that holds only
//   "postgres" and the marker database. Each case creates its own database with a random name and refuses if it exists; nothing is dropped.
// Ordering never relies on sleeping: the second connection's wait is confirmed in pg_locks before the first commits; otherwise INCONCLUSIVE.
// Every case first begins and finishes a sweep on a separate job (control: the setup works).
// Time limits: connect 10 s, statement 30 s (server), client 35 s. Output: one JSON line per case (results only) and sweep-concurrency-result.json.
// Exit: 1 failed, 3 inconclusive only, 0 all passed.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const V = require('./sweep-verdicts.cjs');
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
  const name = 'yt_sweep_' + label + '_' + crypto.randomBytes(6).toString('hex');
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
  await c.end();
  return u.toString();
}
const conn = async url => { const c = new Client({ connectionString: url, ...LIMITS }); await c.connect(); return c; };
const pidOf = async c => (await c.query('select pg_backend_pid() p')).rows[0].p;
const outcome = p => p.then(r => ({ ok: true, value: r.rows[0] ? r.rows[0].v : undefined }), e => ({ ok: false, code: e.code, message: e.message }));
async function waitBlocked(ctl, pid, what) {
  for (let i = 0; i < 200; i++) {
    const r = await ctl.query(`select 1 from pg_locks where pid=$1 and not granted and locktype in ('transactionid','tuple')`, [pid]);
    if (r.rowCount) return;
    await new Promise(res => setTimeout(res, 50));
  }
  throw new Inconclusive('barrier not reached: ' + what);
}
// A job past the Auth deletion for a new synthetic user (superuser setup, as the deletion function leaves it).
async function pastAuthJob(su, state) {
  const uid = crypto.randomUUID();
  await su.query('insert into auth.users(id) values ($1)', [uid]);
  await su.query('set role service_role');
  const id = (await su.query('select public.yt_deletion_accept($1,3600) v', [uid])).rows[0].v;
  await su.query('reset role');
  await su.query(`update yt_private.account_deletion_jobs set state=$2, auth_deleted_at=now(), lease_owner=null, lease_expires_at=null where id=$1`, [id, state]);
  await su.query('delete from auth.users where id=$1', [uid]);
  return id;
}
const leaseOwner = async (su, id) => (await su.query('select lease_owner from yt_private.account_deletion_jobs where id=$1', [id])).rows[0].lease_owner;
async function control(url) {
  const su = await conn(url);
  try {
    const id = await pastAuthJob(su, 'AWAITING_ASSURANCE');
    await su.query('set role service_role');
    const b = (await su.query(`select public.yt_deletion_sweep_begin($1,'control',460) v`, [id])).rows[0].v;
    if (!b || typeof b.generation !== 'number') return false;
    const f = (await su.query(`select public.yt_deletion_sweep_finish($1,$2,'control',0,0,0,null,true) v`, [id, b.generation])).rows[0].v;
    return f === true;
  } finally { await su.end(); }
}
async function runCase(name, fn) {
  try { await fn(); } catch (e) { if (e instanceof Inconclusive) report(name, 'inconclusive', { reason: e.message }); else report(name, 'fail', { error: e.message }); }
}
const BEGIN = `select public.yt_deletion_sweep_begin($1,$2,460) v`;
const CLAIM = `select public.yt_deletion_claim($1,$2,460) v`;

async function s1(url) {
  const ctl0 = await control(url);
  const su = await conn(url), a = await conn(url), b = await conn(url), ctl = await conn(url);
  try {
    const id = await pastAuthJob(su, 'AWAITING_ASSURANCE');
    await a.query('begin'); await a.query('set local role service_role');
    const first = (await a.query(BEGIN, [id, 'sweep-A'])).rows[0].v;   // row locked, lease taken, not committed
    await b.query('set role service_role'); const bpid = await pidOf(b);
    const pending = outcome(b.query(BEGIN, [id, 'sweep-B']));
    let blocked = false;
    try { await waitBlocked(ctl, bpid, 'second sweep waiting for the first'); blocked = true; } finally { await a.query('commit'); }
    const second = await pending;
    const o = { control: ctl0, blocked, first, firstOwner: 'sweep-A', second, finalOwner: await leaseOwner(su, id) };
    report('S1 sweep/sweep: the second waits, then is refused busy', V.s1(o), o);
  } finally { await su.end(); await a.end(); await b.end(); await ctl.end(); }
}
async function s2(url) {
  const ctl0 = await control(url);
  const su = await conn(url), a = await conn(url), b = await conn(url), ctl = await conn(url);
  try {
    const id = await pastAuthJob(su, 'NEEDS_OPERATOR');   // a job the normal continuation can claim
    await a.query('begin'); await a.query('set local role service_role');
    const claim = (await a.query(CLAIM, [id, 'worker-A'])).rows[0].v;
    await b.query('set role service_role'); const bpid = await pidOf(b);
    const pending = outcome(b.query(BEGIN, [id, 'sweep-B']));
    let blocked = false;
    try { await waitBlocked(ctl, bpid, 'sweep waiting for the normal claim'); blocked = true; } finally { await a.query('commit'); }
    const sweep = await pending;
    const o = { control: ctl0, blocked, claim, claimOwner: 'worker-A', sweep, finalOwner: await leaseOwner(su, id) };
    report('S2 normal claim then sweep: the sweep waits, then is refused busy', V.s2(o), o);
  } finally { await su.end(); await a.end(); await b.end(); await ctl.end(); }
}
async function s3(url) {
  const ctl0 = await control(url);
  const su = await conn(url), a = await conn(url), b = await conn(url), ctl = await conn(url);
  try {
    const id = await pastAuthJob(su, 'NEEDS_OPERATOR');
    await a.query('begin'); await a.query('set local role service_role');
    const sweep = (await a.query(BEGIN, [id, 'sweep-A'])).rows[0].v;
    await b.query('set role service_role'); const bpid = await pidOf(b);
    const pending = outcome(b.query(CLAIM, [id, 'worker-B']));
    let blocked = false;
    try { await waitBlocked(ctl, bpid, 'normal claim waiting for the sweep'); blocked = true; } finally { await a.query('commit'); }
    const claim = await pending;
    const o = { control: ctl0, blocked, sweep, sweepOwner: 'sweep-A', claim, finalOwner: await leaseOwner(su, id) };
    report('S3 sweep then normal claim: the claim waits, then gets nothing', V.s3(o), o);
  } finally { await su.end(); await a.end(); await b.end(); await ctl.end(); }
}

(async () => {
  await guardServer();
  await runCase('S1', async () => s1(await makeDb('s1')));
  await runCase('S2', async () => s2(await makeDb('s2')));
  await runCase('S3', async () => s3(await makeDb('s3')));
  fs.writeFileSync(path.join(root, 'sweep-concurrency-result.json'), JSON.stringify(results, null, 1) + '\n');
  process.exit(failed ? 1 : inconclusive ? 3 : 0);
})().catch(e => { console.error(e && e.message ? e.message : 'error'); process.exit(1); });
