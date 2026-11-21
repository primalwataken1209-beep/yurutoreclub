// Report purge draft (unapplied): conditional deletion of listed, expired, closed reports. Synthetic data in an isolated in-memory
// PostgreSQL (PGlite, one connection); no Supabase project. Concurrency is NOT shown here (see tests-pg proposal in the handoff file).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { PGlite } = require('@electric-sql/pglite');
const A='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', B='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', C='cccccccc-cccc-cccc-cccc-cccccccccccc';
const P='11111111-1111-1111-1111-111111111111';
const RETENTION=fs.readFileSync('supabase/manual/report_retention_prepare.sql','utf8');
const USER_REPORTS=fs.readFileSync('supabase/manual/store_prep_user_reports.sql','utf8');
const PURGE=fs.readFileSync('supabase/manual/report_purge_prepare.sql','utf8');
const STOP=fs.readFileSync('supabase/manual/report_purge_stop.sql','utf8');

async function database(t){
  const db=new PGlite();
  t.after(()=>db.close());
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth; create schema storage;
    create table auth.users(id uuid primary key, raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth, storage to anon, authenticated, service_role;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
    alter table storage.objects enable row level security;
    create function storage.foldername(text) returns text[] language sql immutable as $$ select (string_to_array($1,'/'))[1:array_length(string_to_array($1,'/'),1)-1] $$;
  `);
  await db.exec(fs.readFileSync('supabase_v28_events.sql','utf8'));
  for(const file of fs.readdirSync('supabase/migrations').filter(n=>n.endsWith('.sql')).sort())
    await db.exec(fs.readFileSync('supabase/migrations/'+file,'utf8'));
  await db.exec(USER_REPORTS);
  await db.exec(`grant all on public.reports to anon, authenticated;`);
  await db.exec(`insert into auth.users(id) values ('${A}'),('${B}'),('${C}'); insert into public.posts(id,user_id,body) values ('${P}','${B}','post');`);
  await db.exec(RETENTION);
  await db.exec(PURGE);
  const as=async(id,sql,params)=>{
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id||'']);
    await db.exec('set role '+(id==='service'?'service_role':id?'authenticated':'anon'));
    return params?db.query(sql,params):db.query(sql);
  };
  const su=async(sql,params)=>{await db.exec('reset role');return params?db.query(sql,params):db.query(sql);};
  const suExec=async sql=>{await db.exec('reset role');return db.exec(sql);};
  return {db,as,su,suExec};
}
let seq=0;
const rid=()=>'f0000000-0000-4000-8000-'+String(++seq).padStart(12,'0');
// A synthetic report in a given state (set by the superuser; row_version moves on every change, as in real use).
async function report(su,state){
  const id=rid();
  const who=[A,B,C][seq%3];
  await su(`insert into public.reports(id,reporter_user_id,target_type,target_id,reason,note) values ('${id}','${who}','post','${id}','spam','synthetic ${seq}')`);   // target = own id: unique per reporter/target
  const past=`now()-interval '1 day'`, future=`now()+interval '1 day'`;
  const sets={
    expired:`status='actioned', closed_at=now()-interval '91 days', retention_until=${past}`,
    boundary:`status='reviewed', closed_at=now()-interval '90 days', retention_until=now()+interval '5 seconds'`,   // just before the end of retention
    notDue:`status='dismissed', closed_at=now()-interval '89 days', retention_until=${future}`,
    open:`status='open', closed_at=${past}, retention_until=${past}`,
    hold:`status='actioned', closed_at=now()-interval '91 days', retention_until=${past}, retention_hold=true, hold_reason='x'`,
    legacy:`status='actioned', closed_at=now()-interval '91 days', retention_until=${past}, legacy_review_required=true`,
    noClosed:`status='dismissed', closed_at=null, retention_until=${past}`,
  };
  if(state!=='fresh')await su(`update public.reports set ${sets[state]} where id='${id}'`);
  const v=(await su(`select row_version from public.reports where id='${id}'`)).rows[0].row_version;
  return {id,row_version:Number(v)};
}
const purge=(as,items,ref='APPROVAL-TEST-1',by='owner')=>as('service','select * from public.yt_report_purge($1,$2,$3)',[JSON.stringify(items),ref,by]).then(r=>r.rows);
const exists=async(su,id)=>(await su(`select count(*)::int n from public.reports where id='${id}'`)).rows[0].n===1;

test('purge: only listed, expired, closed, unchanged reports are deleted; every other state is skipped with its reason',async t=>{
  const {as,su}=await database(t);
  const s={};
  for(const k of ['expired','boundary','notDue','open','hold','legacy','noClosed'])s[k]=await report(su,k);
  const changed=await report(su,'expired');
  await su(`update public.reports set note='edited after listing' where id='${changed.id}'`);   // row_version moves
  const missing={id:'f0000000-0000-4000-8000-999999999999',row_version:0};
  const rows=await purge(as,[...Object.values(s),changed,missing].reverse());   // given in reverse: results must still come in id order
  const by=Object.fromEntries(rows.map(r=>[r.id,[r.result,r.detail]]));
  assert.deepEqual(by[s.expired.id],['deleted',null]);
  assert.deepEqual(by[s.boundary.id],['skipped_held_or_open','retention_not_passed'],'a few seconds before the end of retention');
  assert.deepEqual(by[s.notDue.id],['skipped_held_or_open','retention_not_passed']);
  assert.deepEqual(by[s.open.id],['skipped_held_or_open','open']);
  assert.deepEqual(by[s.hold.id],['skipped_held_or_open','hold']);
  assert.deepEqual(by[s.legacy.id],['skipped_held_or_open','legacy_review_required']);
  assert.deepEqual(by[s.noClosed.id],['skipped_held_or_open','no_closed_at']);
  assert.deepEqual(by[changed.id],['skipped_changed',null]);
  assert.deepEqual(by[missing.id],['missing',null]);
  assert.deepEqual(rows.map(r=>r.id),[...rows.map(r=>r.id)].sort(),'results in id order');
  assert.equal(await exists(su,s.expired.id),false);
  for(const k of ['boundary','notDue','open','hold','legacy','noClosed'])assert.equal(await exists(su,s[k].id),true,k);
  assert.equal(await exists(su,changed.id),true);
  const run=(await su('select * from yt_private.report_purge_runs')).rows;
  assert.equal(run.length,1);
  assert.deepEqual([run[0].approval_ref,run[0].executed_by,run[0].requested,run[0].deleted,run[0].skipped_changed,run[0].skipped_held_or_open,run[0].missing],
    ['APPROVAL-TEST-1','owner',9,1,1,6,1]);
  assert.deepEqual(Object.keys(run[0]).sort(),['approval_ref','deleted','executed_at','executed_by','id','missing','requested','skipped_changed','skipped_held_or_open'],'no ids or report text in the run record');
  // Running the same list again: the deleted one is now missing; nothing else changes.
  const again=Object.fromEntries((await purge(as,[s.expired,s.open])).map(r=>[r.id,r.result]));
  assert.deepEqual([again[s.expired.id],again[s.open.id]],['missing','skipped_held_or_open']);
});

test('purge: retention_until equal to the database time of the same transaction is not passed (strict boundary)',async t=>{
  const {db,as,su}=await database(t);
  const r=await report(su,'expired');
  await db.exec('reset role'); await db.exec('begin');
  await db.query(`update public.reports set retention_until=now() where id='${r.id}'`);   // now() = this transaction's time
  const v=Number((await db.query(`select row_version from public.reports where id='${r.id}'`)).rows[0].row_version);
  const rows=await as('service','select * from public.yt_report_purge($1,$2,$3)',[JSON.stringify([{id:r.id,row_version:v}]),'A','owner']).then(x=>x.rows);
  await db.exec('reset role');
  const same=(await db.query(`select (retention_until = now()) eq from public.reports where id='${r.id}'`)).rows[0].eq;
  await db.exec('reset role'); await db.exec('commit');
  assert.equal(same,true,'retention_until equals the transaction time');
  assert.deepEqual([rows[0].result,rows[0].detail],['skipped_held_or_open','retention_not_passed']);
  assert.equal(await exists(su,r.id),true);
});

test('purge: a reopened report (after expiry) and a report whose hold ended without passing the new date are not deleted',async t=>{
  const {as,su}=await database(t);
  const r1=await report(su,'expired');
  await as('service',`select public.yt_report_reopen('${r1.id}','repeat case','owner')`);
  const v1=Number((await su(`select row_version from public.reports where id='${r1.id}'`)).rows[0].row_version);
  const r2=await report(su,'expired');
  await as('service',`select public.yt_report_hold('${r2.id}',true,now()+interval '30 days','keep','owner')`);
  await as('service',`select public.yt_report_hold('${r2.id}',false,null,'hold ended','owner')`);
  const v2=Number((await su(`select row_version from public.reports where id='${r2.id}'`)).rows[0].row_version);
  const by=Object.fromEntries((await purge(as,[{id:r1.id,row_version:v1},{id:r2.id,row_version:v2}])).map(r=>[r.id,[r.result,r.detail]]));
  assert.deepEqual(by[r1.id],['skipped_held_or_open','open']);
  assert.deepEqual(by[r2.id],['skipped_held_or_open','retention_not_passed'],'ending a hold does not shorten retention');
});

test('purge: malformed, duplicate, empty, too many, extra keys, missing approval or operator reject the whole call; nothing is deleted',async t=>{
  const {as,su}=await database(t);
  const ok=await report(su,'expired');
  const bad=[
    [[ok,ok],/duplicate id/],
    [[{id:ok.id.toUpperCase(),row_version:ok.row_version},ok],/duplicate id/],
    [[],/1 to 100/],
    [Array.from({length:101},(_,i)=>({id:'f1000000-0000-4000-8000-'+String(i).padStart(12,'0'),row_version:0})),/1 to 100/],
    [[ok,{id:'not-a-uuid',row_version:0}],/invalid id/],
    [[ok,{id:ok.id.replace(/.$/,'9'),row_version:-1}],/invalid row_version/],
    [[ok,{id:ok.id.replace(/.$/,'9'),row_version:1.5}],/invalid row_version/],
    [[ok,{id:ok.id.replace(/.$/,'9'),row_version:'1'}],/invalid row_version/],
    [[ok,{id:ok.id.replace(/.$/,'9'),row_version:null}],/invalid row_version/],
    [[ok,{id:ok.id.replace(/.$/,'9')}],/exactly/],
    [[{...ok,now:'2099-01-01T00:00:00Z'}],/exactly/],
    [[ok,'x'],/exactly/],
  ];
  for(const [items,re] of bad)await assert.rejects(()=>purge(as,items),re,JSON.stringify(items).slice(0,80));
  await assert.rejects(()=>as('service','select * from public.yt_report_purge($1,$2,$3)',['{"id":1}','A','owner']),/JSON array/);
  for(const [ref,by] of [['','owner'],['  ','owner'],['A',''],['x'.repeat(201),'owner'],['A','y'.repeat(101)],[null,'owner'],['A',null]])
    await assert.rejects(()=>as('service','select * from public.yt_report_purge($1,$2,$3)',[JSON.stringify([ok]),ref,by]),/required/);
  assert.equal(await exists(su,ok.id),true);
  assert.equal((await su('select count(*)::int n from yt_private.report_purge_runs')).rows[0].n,0,'no run record for a rejected call');
  // The function has no time parameter: the database time is used.
  assert.equal((await su(`select pronargs from pg_proc where proname='yt_report_purge'`)).rows[0].pronargs,3);
});

test('purge: a database error after a deletion rolls the whole call back',async t=>{
  const {as,su,suExec}=await database(t);
  const first=await report(su,'expired'), second=await report(su,'expired');
  await suExec(`create function public.fail_on_second() returns trigger language plpgsql as $$ begin
      if old.id = '${second.id}' then raise exception 'synthetic failure'; end if; return old; end $$;
    create trigger fail_on_second before delete on public.reports for each row execute function public.fail_on_second();`);
  await assert.rejects(()=>purge(as,[first,second]),/synthetic failure/);
  assert.equal(await exists(su,first.id),true,'the first deletion was rolled back');
  assert.equal(await exists(su,second.id),true);
  assert.equal((await su('select count(*)::int n from yt_private.report_purge_runs')).rows[0].n,0);
});

test('purge: only service_role can run it; users cannot read the run records; the stop file removes only this function',async t=>{
  const {as,su,suExec}=await database(t);
  const ok=await report(su,'expired');
  for(const who of [A,null]){
    await assert.rejects(()=>as(who,'select * from public.yt_report_purge($1,$2,$3)',[JSON.stringify([ok]),'A','owner']),/permission denied/);
    await assert.rejects(()=>as(who,'select * from yt_private.report_purge_runs'),/permission denied/);
  }
  assert.equal(await exists(su,ok.id),true);
  await suExec(PURGE);   // applying twice is the same
  await suExec(STOP);
  await assert.rejects(()=>purge(as,[ok]),/permission denied/,'stopped for service_role too');
  // Other report functions keep working for service_role.
  await as('service',`select * from public.yt_report_deletion_candidates()`);
  await as('service',`select * from public.yt_report_deletion_recheck('[]'::jsonb)`);
  assert.equal(await exists(su,ok.id),true);
});
