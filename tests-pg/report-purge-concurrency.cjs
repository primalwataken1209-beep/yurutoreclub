// NOT RUN. Real-PostgreSQL concurrency check C1-C4 for public.yt_report_purge (several connections). Never touches Supabase.
// Same safety as tests-pg/drain-concurrency.cjs (refuses to run otherwise, exit 2):
//   YT_DISPOSABLE_PG=1, YT_DISPOSABLE_MARKER=yt_throwaway_<id>, PG_URL on localhost/127.0.0.1/::1, and a server that holds only
//   "postgres" and the marker database. Each case uses its own new database with a random name; nothing is ever dropped.
// Ordering never relies on sleeping: a case proceeds only after pg_locks shows the waiting connection; otherwise INCONCLUSIVE.
// Every case first deletes a separate control report with the same function (proves the setup can delete at all).
// Exit: 1 if any case failed, 3 if none failed but one was inconclusive, 0 if all passed. Results: report-purge-concurrency-result.json
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const V = require('./report-purge-verdicts.cjs');
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

const A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
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
  create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
  alter table storage.objects enable row level security;
  create function storage.foldername(text) returns text[] language sql immutable as $$ select (string_to_array($1,'/'))[1:array_length(string_to_array($1,'/'),1)-1] $$;`;

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
  const name = 'yt_purge_' + label + '_' + crypto.randomBytes(6).toString('hex');
  const admin = new Client({ connectionString: URL0, ...LIMITS }); await admin.connect();
  if ((await admin.query('select 1 from pg_database where datname=$1', [name])).rowCount) { await admin.end(); refuse('database already exists: ' + name); }
  await admin.query(`create database ${name}`); await admin.end();
  const u = new URL(URL0); u.pathname = '/' + name;
  const c = new Client({ connectionString: u.toString(), ...LIMITS }); await c.connect();
  await c.query(STUBS); await c.query(read('supabase_v28_events.sql'));
  for (const f of fs.readdirSync(path.join(root, 'supabase/migrations')).filter(n => n.endsWith('.sql')).sort()) await c.query(read('supabase/migrations/' + f));
  await c.query(read('supabase/manual/store_prep_user_reports.sql'));
  await c.query(`insert into auth.users(id) values ('${A}'),('${B}')`);
  await c.query(read('supabase/manual/report_retention_prepare.sql'));
  await c.query(read('supabase/manual/report_purge_prepare.sql'));
  await c.end();
  return u.toString();
}
// Time limits: connecting 10 s; any statement 30 s (server side) and the client stops waiting at 35 s. A wait that never ends is a failure.
const LIMITS = { connectionTimeoutMillis: 10000, statement_timeout: 30000, query_timeout: 35000 };
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
// An expired, closed report (superuser setup), returning {id, row_version}.
async function expiredReport(su) {
  const id = crypto.randomUUID();
  await su.query(`insert into public.reports(id,reporter_user_id,target_type,target_id,reason,note) values ($1,$2,'post',$1,'spam','synthetic')`, [id, A]);
  await su.query(`update public.reports set status='actioned', closed_at=now()-interval '91 days', retention_until=now()-interval '1 day' where id=$1`, [id]);
  const v = Number((await su.query('select row_version from public.reports where id=$1', [id])).rows[0].row_version);
  return { id, row_version: v };
}
const PURGE = `select * from public.yt_report_purge($1,$2,'operator-code')`;
const purgeAs = (c, items, ref) => c.query(PURGE, [JSON.stringify(items), ref]);
async function asService(c) { await c.query('set role service_role'); }
async function control(url) {
  const su = await conn(url);
  try {
    const r = await expiredReport(su); await asService(su);
    const rows = (await purgeAs(su, [r], 'CONTROL')).rows; return rows[0] && rows[0].result;
  } finally { await su.end(); }
}
const exists = async (su, id) => (await su.query('select count(*)::int n from public.reports where id=$1', [id])).rows[0].n === 1;
async function runCase(name, fn) {
  try { await fn(); } catch (e) { if (e instanceof Inconclusive) report(name, 'inconclusive', { reason: e.message }); else report(name, 'fail', { error: e.message }); }
}

async function c1(url) {
  const ctl0 = await control(url);
  const su = await conn(url), u = await conn(url), p = await conn(url), ctl = await conn(url);
  try {
    const r = await expiredReport(su);
    await u.query('begin'); await u.query(`update public.reports set note='changed by another operator' where id=$1`, [r.id]);
    await asService(p); const ppid = await pidOf(p);
    const pending = outcome(purgeAs(p, [r], 'C1'));
    let blocked = false;
    try { await waitBlocked(ctl, ppid, 'purge waiting for the uncommitted change'); blocked = true; } finally { await u.query('commit'); }
    const purge = await pending;
    const o = { control: ctl0, blocked, purge: { ok: purge.ok, message: purge.message }, result: purge.ok ? purge.rows[0].result : null, rowExists: await exists(su, r.id) };
    report('C1 concurrent change: purge waits, then skips the changed row', V.c1(o), o);
  } finally { await su.end(); await u.end(); await p.end(); await ctl.end(); }
}
async function c2(url) {
  const ctl0 = await control(url);
  const su = await conn(url), p = await conn(url), ro = await conn(url), ctl = await conn(url);
  try {
    const r = await expiredReport(su);
    await p.query('begin'); await asService(p);
    const result = (await purgeAs(p, [r], 'C2')).rows[0].result;   // deleted, still uncommitted (lock held)
    await asService(ro); const ropid = await pidOf(ro);
    const pending = outcome(ro.query(`select public.yt_report_reopen($1,'repeat case','operator-code')`, [r.id]));
    let blocked = false;
    try { await waitBlocked(ctl, ropid, 'reopen waiting for the purge'); blocked = true; } finally { await p.query('commit'); }
    const reopen = await pending;
    const o = { control: ctl0, blocked, result, reopen: { ok: reopen.ok, message: reopen.message }, rowExists: await exists(su, r.id) };
    report('C2 reopen during purge: reopen waits, then finds nothing', V.c2(o), o);
  } finally { await su.end(); await p.end(); await ro.end(); await ctl.end(); }
}
async function c3(url) {
  const ctl0 = await control(url);
  const su = await conn(url), p1 = await conn(url), p2 = await conn(url), ctl = await conn(url);
  try {
    const r = await expiredReport(su);
    const runs0 = (await su.query('select count(*)::int n from yt_private.report_purge_runs')).rows[0].n;
    await p1.query('begin'); await asService(p1);
    const first = (await purgeAs(p1, [r], 'C3-1')).rows[0].result;
    await asService(p2); const p2pid = await pidOf(p2);
    const pending = outcome(purgeAs(p2, [r], 'C3-2'));
    let blocked = false;
    try { await waitBlocked(ctl, p2pid, 'second purge waiting for the first'); blocked = true; } finally { await p1.query('commit'); }
    const second = await pending;
    const runs = (await su.query('select count(*)::int n from yt_private.report_purge_runs')).rows[0].n - runs0;
    const o = { control: ctl0, blocked, first, second: { ok: second.ok, message: second.message }, secondResult: second.ok ? second.rows[0].result : null, rowExists: await exists(su, r.id), runs };
    report('C3 same id purged twice at once: second waits, then missing', V.c3(o), o);
  } finally { await su.end(); await p1.end(); await p2.end(); await ctl.end(); }
}
async function c4(url) {
  const ctl0 = await control(url);
  const su = await conn(url), h = await conn(url), q1 = await conn(url), q2 = await conn(url), ctl = await conn(url);
  try {
    const x = await expiredReport(su), y = await expiredReport(su);
    const [lo] = [x, y].sort((a, b) => (a.id < b.id ? -1 : 1));
    await h.query('begin'); await h.query('select 1 from public.reports where id=$1 for update', [lo.id]);   // hold the lower id
    await asService(q1); await asService(q2);
    const p1 = await pidOf(q1), p2 = await pidOf(q2);
    const r1 = outcome(purgeAs(q1, [x, y], 'C4-1')), r2 = outcome(purgeAs(q2, [y, x], 'C4-2'));
    let bothBlocked = false;
    try {
      await waitBlocked(ctl, p1, 'first purge waiting on the held row');
      await waitBlocked(ctl, p2, 'second purge waiting on the held row');
      bothBlocked = true;
    } finally { await h.query('commit'); }
    const [o1, o2] = await Promise.all([r1, r2]);
    const deadlock = [o1, o2].some(o => !o.ok && o.code === '40P01');
    const remaining = (await su.query('select count(*)::int n from public.reports where id = any($1::uuid[])', [[x.id, y.id]])).rows[0].n;
    const perId = { [x.id]: [], [y.id]: [] };   // every result each id got from the two purges
    for (const out of [o1, o2]) if (out.ok) for (const r of out.rows) (perId[r.id] = perId[r.id] || []).push(r.result);
    const o = { control: ctl0, blocked: true, bothBlocked, q1ok: o1.ok, q2ok: o2.ok, q1: o1.ok ? o1.rows.map(r => r.result) : [], q2: o2.ok ? o2.rows.map(r => r.result) : [],
      perId, ids: [x.id, y.id], deadlock, errors: [o1, o2].filter(o => !o.ok).map(o => o.code + ' ' + o.message), remaining };
    report('C4 overlapping ids in opposite orders: no deadlock, each row deleted once', V.c4(o), o);
  } finally { await su.end(); await h.end(); await q1.end(); await q2.end(); await ctl.end(); }
}

(async () => {
  await guardServer();
  await runCase('C1', async () => c1(await makeDb('c1')));
  await runCase('C2', async () => c2(await makeDb('c2')));
  await runCase('C3', async () => c3(await makeDb('c3')));
  await runCase('C4', async () => c4(await makeDb('c4')));
  fs.writeFileSync(path.join(root, 'report-purge-concurrency-result.json'), JSON.stringify(results, null, 1) + '\n');
  process.exit(failed ? 1 : inconclusive ? 3 : 0);
})().catch(e => { console.error(e); process.exit(1); });
