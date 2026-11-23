// NOT RUN. Real-PostgreSQL concurrency check A/B: hold-record purge (audit_retention.sql at 144f296) against the hold function
// (deletion_u1_detail_compact.sql), in both orders. Several connections; database functions only (no Storage, no Supabase).
// Safety (refuses otherwise, exit 2; same as the other runners): YT_DISPOSABLE_PG=1, YT_DISPOSABLE_MARKER=yt_throwaway_<id>,
//   PG_URL on localhost/127.0.0.1/::1 only, and a server holding only "postgres" and the marker database. Each case gets a new database
//   with a random name; an existing name is refused; nothing is dropped. No secrets.
// Ordering: the second connection's wait is confirmed in pg_locks before the first commits; otherwise INCONCLUSIVE (never a pass).
// Each case first purges a separate eligible job with no contention (control). Time limits: connect 10 s, statement 30 s, client 35 s.
// Output: one JSON line per case (results, counts, versions, hashes only) and audit-concurrency-result.json.
// Exit: 1 failed, 3 inconclusive only, 0 all passed.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const V = require('./audit-verdicts.cjs');
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
const FILES = ['supabase/manual/deletion_u1_prepare.sql', 'supabase/manual/deletion_u1_sweep_v2.sql', 'supabase/manual/deletion_u1_detail_compact.sql',
  'supabase/manual/report_retention_prepare.sql', 'supabase/manual/report_purge_prepare.sql', 'supabase/manual/audit_retention.sql'];

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
  const name = 'yt_audit_' + label + '_' + crypto.randomBytes(6).toString('hex');
  const admin = new Client({ connectionString: URL0, ...LIMITS }); await admin.connect();
  if ((await admin.query('select 1 from pg_database where datname=$1', [name])).rowCount) { await admin.end(); refuse('database already exists: ' + name); }
  await admin.query(`create database ${name}`); await admin.end();
  const u = new URL(URL0); u.pathname = '/' + name;
  const c = new Client({ connectionString: u.toString(), ...LIMITS }); await c.connect();
  await c.query(STUBS); await c.query(read('supabase_v28_events.sql'));
  for (const f of fs.readdirSync(path.join(root, 'supabase/migrations')).filter(n => n.endsWith('.sql')).sort()) await c.query(read('supabase/migrations/' + f));
  await c.query(`create table public.user_progress(user_id uuid primary key references auth.users(id) on delete cascade, data jsonb)`);
  await c.query(read('supabase/manual/store_prep_user_reports.sql'));
  for (const f of FILES) await c.query(read(f));
  await c.end();
  return u.toString();
}
const conn = async url => { const c = new Client({ connectionString: url, ...LIMITS }); await c.connect(); return c; };
const pidOf = async c => (await c.query('select pg_backend_pid() p')).rows[0].p;
const outcome = p => p.then(r => ({ ok: true, rows: r.rows }), e => ({ ok: false, code: e.code, message: e.message }));
async function waitBlocked(ctl, pid, what) {
  for (let i = 0; i < 200; i++) {
    const r = await ctl.query(`select 1 from pg_locks where pid=$1 and not granted and locktype in ('transactionid','tuple')`, [pid]);
    if (r.rowCount) return;
    await new Promise(res => setTimeout(res, 50));
  }
  throw new Inconclusive('barrier not reached: ' + what);
}
// A job with one closed hold cycle that started 400 days ago (eligible), not on hold now.
async function eligibleJob(su) {
  const uid = crypto.randomUUID();
  await su.query('insert into auth.users(id) values ($1)', [uid]);
  await su.query('set role service_role');
  const id = (await su.query('select public.yt_deletion_accept($1,3600) v', [uid])).rows[0].v;
  await su.query('reset role');
  await su.query(`insert into yt_private.detail_hold_events(job_id,hold,reason,decided_by,decided_at) values
    ($1,true,'investigation','op-1',now()-interval '400 days'),($1,false,'closed','op-1',now()-interval '10 days')`, [id]);
  return id;
}
const state = async (su, id) => {
  const j = (await su.query('select detail_version, detail_hold from yt_private.account_deletion_jobs where id=$1', [id])).rows[0];
  const ev = (await su.query('select hold from yt_private.detail_hold_events where job_id=$1 order by decided_at, id', [id])).rows;
  const other = (await su.query(`select md5(coalesce(string_agg(to_jsonb(j)::text, '|' order by j.id), '')) h from yt_private.account_deletion_jobs j where j.id <> $1`, [id])).rows[0].h;
  const r = (await su.query(`select md5(coalesce(string_agg(to_jsonb(x)::text, '|' order by x.user_id), '')) h from yt_private.deletion_refusals x`)).rows[0].h;
  return { version: Number(j.detail_version), held: j.detail_hold, events: ev.length, lastIsHold: ev.length > 0 && ev[ev.length - 1].hold === true, other, r };
};
const PURGE = `select * from public.yt_audit_purge_hold_events($1,'CONC','op-1')`;
const HOLD = `select public.yt_deletion_detail_hold($1,true,'new investigation','op-2') v`;
const items = (id, v) => JSON.stringify([{ job_id: id, row_version: v }]);
async function control(url) {
  const su = await conn(url);
  try {
    const id = await eligibleJob(su); const s = await state(su, id);
    await su.query('set role service_role');
    const r = (await su.query(PURGE, [items(id, s.version)])).rows[0];
    return !!r && r.result === 'deleted' && r.removed === 2;
  } finally { await su.end(); }
}
async function runCase(name, fn) {
  try { await fn(); } catch (e) { if (e instanceof Inconclusive) report(name, 'inconclusive', { reason: e.message }); else report(name, 'fail', { error: e.message }); }
}

async function caseA(url) {
  const ctl0 = await control(url);
  const su = await conn(url), h = await conn(url), p = await conn(url), ctl = await conn(url);
  try {
    const id = await eligibleJob(su); await eligibleJob(su);   // a second job stays untouched
    const s0 = await state(su, id);
    await h.query('begin'); await h.query('set local role service_role');
    const hold = await outcome(h.query(HOLD, [id]));   // L row updated and a new hold record, not committed
    await p.query('set role service_role'); const ppid = await pidOf(p);
    const pending = outcome(p.query(PURGE, [items(id, s0.version)]));
    let blocked = false;
    try { await waitBlocked(ctl, ppid, 'purge waiting for the hold'); blocked = true; } finally { await h.query('commit'); }
    const pr = await pending; const s1 = await state(su, id);
    const o = { control: ctl0, blocked, hold: { ok: hold.ok, message: hold.message },
      purge: { ok: pr.ok, result: pr.ok ? pr.rows[0].result : null, removed: pr.ok ? pr.rows[0].removed : null, message: pr.message },
      eventsBefore: s0.events, eventsAfter: s1.events, lastIsHold: s1.lastIsHold, heldAfter: s1.held, versionBefore: s0.version, versionAfter: s1.version,
      otherBefore: s0.other, otherAfter: s1.other, rBefore: s0.r, rAfter: s1.r };
    report('A hold first, then purge: purge waits, then skips; all records kept and the job stays on hold', V.a(o), o);
  } finally { await su.end(); await h.end(); await p.end(); await ctl.end(); }
}
async function caseB(url) {
  const ctl0 = await control(url);
  const su = await conn(url), h = await conn(url), p = await conn(url), ctl = await conn(url);
  try {
    const id = await eligibleJob(su); await eligibleJob(su);
    const s0 = await state(su, id);
    await p.query('begin'); await p.query('set local role service_role');
    const pr = await outcome(p.query(PURGE, [items(id, s0.version)]));   // deletes the cycle, holds the L row lock, not committed
    await h.query('set role service_role'); const hpid = await pidOf(h);
    const pending = outcome(h.query(HOLD, [id]));
    let blocked = false;
    try { await waitBlocked(ctl, hpid, 'hold waiting for the purge'); blocked = true; } finally { await p.query('commit'); }
    const hold = await pending; const s1 = await state(su, id);
    const o = { control: ctl0, blocked,
      purge: { ok: pr.ok, result: pr.ok ? pr.rows[0].result : null, removed: pr.ok ? pr.rows[0].removed : null, message: pr.message },
      hold: { ok: hold.ok, message: hold.message },
      eventsBefore: s0.events, eventsAfter: s1.events, lastIsHold: s1.lastIsHold, heldAfter: s1.held, versionBefore: s0.version, versionAfter: s1.version,
      otherBefore: s0.other, otherAfter: s1.other, rBefore: s0.r, rAfter: s1.r };
    report('B purge first, then hold: hold waits, then the new hold record and the hold flag remain', V.b(o), o);
  } finally { await su.end(); await h.end(); await p.end(); await ctl.end(); }
}

(async () => {
  await guardServer();
  await runCase('A', async () => caseA(await makeDb('a')));
  await runCase('B', async () => caseB(await makeDb('b')));
  fs.writeFileSync(path.join(root, 'audit-concurrency-result.json'), JSON.stringify(results, null, 1) + '\n');
  process.exit(failed ? 1 : inconclusive ? 3 : 0);
})().catch(e => { console.error(e && e.message ? e.message : 'error'); process.exit(1); });
