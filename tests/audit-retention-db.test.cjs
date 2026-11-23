// Audit retention draft (supabase/manual/audit_retention.sql): hold records of deletion jobs are removed per job only for one closed
// cycle 365 days after its first hold; everything unclear is kept. Execution records only get a read-only candidate list.
// Isolated in-memory PostgreSQL (PGlite, one connection); synthetic data. Real concurrency is NOT shown here.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { PGlite } = require('@electric-sql/pglite');
const R=f=>fs.readFileSync('supabase/manual/'+f,'utf8');
const SQL=R('audit_retention.sql'), STOP=R('audit_retention_stop.sql');

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
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,owner_id text, unique(bucket_id,name));
    alter table storage.objects enable row level security;
    create function storage.foldername(text) returns text[] language sql immutable as $$ select (string_to_array($1,'/'))[1:array_length(string_to_array($1,'/'),1)-1] $$;
    grant select,insert,update,delete on storage.objects to anon, authenticated;
  `);
  await db.exec(fs.readFileSync('supabase_v28_events.sql','utf8'));
  for(const file of fs.readdirSync('supabase/migrations').filter(n=>n.endsWith('.sql')).sort())
    await db.exec(fs.readFileSync('supabase/migrations/'+file,'utf8'));
  await db.exec(`create table public.user_progress(user_id uuid primary key references auth.users(id) on delete cascade, data jsonb);`);
  await db.exec(R('store_prep_user_reports.sql'));
  for(const f of ['deletion_u1_prepare.sql','deletion_u1_sweep_v2.sql','deletion_u1_detail_compact.sql','report_retention_prepare.sql','report_purge_prepare.sql',
                  'audit_retention.sql'])await db.exec(R(f));
  const as=async(id,sql,params)=>{
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id||'']);
    await db.exec('set role '+(id==='service'?'service_role':id?'authenticated':'anon'));
    try{return params?await db.query(sql,params):await db.query(sql);}finally{await db.exec('reset role');}
  };
  const su=async(sql,params)=>{await db.exec('reset role');return params?db.query(sql,params):db.query(sql);};
  const suExec=async sql=>{await db.exec('reset role');return db.exec(sql);};
  const newJob=async()=>{
    const uid=crypto.randomUUID();
    await su(`insert into auth.users(id) values ($1)`,[uid]);
    const id=(await as('service',`select public.yt_deletion_accept($1,3600) id`,[uid])).rows[0].id;
    return id;
  };
  // Write hold records with chosen times (days ago) and set the job's hold state like the hold function would.
  const events=async(job,list,heldNow=false)=>{
    for(const [hold,daysAgo,reason='r'] of list)
      await su(`insert into yt_private.detail_hold_events(job_id,hold,reason,decided_by,decided_at) values ($1,$2,$3,'op-1',now()-make_interval(secs=>$4::float8*86400))`,[job,hold,reason,daysAgo]);
    await su(`update yt_private.account_deletion_jobs set detail_hold=$2 where id=$1`,[job,heldNow]);
  };
  const ver=async job=>Number((await su(`select detail_version v from yt_private.account_deletion_jobs where id=$1`,[job])).rows[0].v);
  const count=async job=>(await su(`select count(*)::int n from yt_private.detail_hold_events where job_id=$1`,[job])).rows[0].n;
  const purge=(items,ref='APPROVAL-1',by='op-1')=>as('service','select * from public.yt_audit_purge_hold_events($1,$2,$3)',[JSON.stringify(items),ref,by]).then(r=>r.rows);
  const one=async job=>(await purge([{job_id:job,row_version:await ver(job)}]))[0];
  return {db,as,su,suExec,newJob,events,ver,count,purge,one};
}

test('one closed cycle: deleted 365 days after the FIRST hold (release does not restart the count); other jobs, L and R untouched',async t=>{
  const {su,newJob,events,count,one}=await database(t);
  const a=await newJob();await events(a,[[true,400],[true,380,'extended'],[false,10,'released']]);   // released 10 days ago, started 400 days ago
  const other=await newJob();await events(other,[[true,400],[false,10]]);
  const lBefore=(await su(`select count(*)::int n from yt_private.account_deletion_jobs`)).rows[0].n;
  const rBefore=(await su(`select count(*)::int n from yt_private.deletion_refusals`)).rows[0].n;
  const r=await one(a);
  assert.deepEqual([r.result,r.detail,r.removed],['deleted',null,3]);
  assert.equal(await count(a),0);assert.equal(await count(other),2,'other job untouched');
  assert.equal((await su(`select count(*)::int n from yt_private.account_deletion_jobs`)).rows[0].n,lBefore);
  assert.equal((await su(`select count(*)::int n from yt_private.deletion_refusals`)).rows[0].n,rBefore);
});

test('kept whole (safe side): not due, held now, more than one cycle, orphan release, same time, more than 100 records, no records',async t=>{
  const {su,newJob,events,count,one}=await database(t);
  const c={};
  c.not_due=await newJob();await events(c.not_due,[[true,300],[false,5]]);
  c.held=await newJob();await events(c.held,[[true,500],[false,450],[true,400]],true);
  c.multiple_cycles=await newJob();await events(c.multiple_cycles,[[true,500],[false,450],[true,420],[false,400]]);
  c.orphan_release=await newJob();await events(c.orphan_release,[[false,500],[true,450],[false,400]]);
  c.same_time=await newJob();
  await su(`insert into yt_private.detail_hold_events(job_id,hold,reason,decided_by,decided_at) values ($1,true,'r','op',now()-interval '500 days'),($1,true,'r','op',now()-interval '500 days')`,[c.same_time]);
  await events(c.same_time,[[false,400]]);
  c.too_many_records=await newJob();await events(c.too_many_records,[...Array.from({length:100},(_,i)=>[true,500-i/1000]),[false,390]]);
  c.no_records=await newJob();
  // Records whose insertion order disagrees with their times (a later row with an earlier time): the order is not clear → kept.
  const out_of_order=await newJob();await events(out_of_order,[[true,500],[false,400],[true,450]]);
  const ro=await one(out_of_order);assert.deepEqual([ro.result,ro.detail],['not_eligible','same_time']);assert.equal(await count(out_of_order),3);
  const ended_by_hold=await newJob();await events(ended_by_hold,[[true,500],[false,450],[true,420]],false);   // last record is a hold but the job flag says not held
  for(const [k,job] of Object.entries(c)){const before=await count(job);const r=await one(job);
    assert.deepEqual([r.result,r.detail],['not_eligible',k],k);assert.equal(await count(job),before,k+' kept');}
  const re=await one(ended_by_hold);assert.deepEqual([re.result,re.detail],['not_eligible','multiple_cycles']);
});

test('365-day boundary in the same transaction is not due; a fixed first-hold time well past 365 days is due',async t=>{
  const {db,su,newJob,ver,count}=await database(t);
  const j=await newJob();
  await db.exec('reset role');await db.exec('begin');
  await db.query(`insert into yt_private.detail_hold_events(job_id,hold,reason,decided_by,decided_at) values ($1,true,'r','op',now()-interval '365 days'),($1,false,'r','op',now()-interval '1 day')`,[j]);
  const v=Number((await db.query(`select detail_version v from yt_private.account_deletion_jobs where id=$1`,[j])).rows[0].v);
  await db.exec('set role service_role');
  const r=(await db.query('select * from public.yt_audit_purge_hold_events($1,$2,$3)',[JSON.stringify([{job_id:j,row_version:v}]),'A','op'])).rows[0];
  await db.exec('reset role');await db.exec('commit');
  assert.deepEqual([r.result,r.detail],['not_eligible','not_due']);assert.equal(await count(j),2);
});

test('a hold or release after the candidate list (new version) is skipped; the new record is kept',async t=>{
  const {as,newJob,events,ver,count,purge}=await database(t);
  const j=await newJob();await events(j,[[true,500],[false,400]]);
  const listed=await ver(j);
  await as('service',`select public.yt_deletion_detail_hold($1,true,'new investigation','op-2')`,[j]);
  const r=(await purge([{job_id:j,row_version:listed}]))[0];
  assert.deepEqual([r.result],['skipped_changed']);assert.equal(await count(j),3);
  const r2=(await purge([{job_id:j,row_version:await ver(j)}]))[0];
  assert.deepEqual([r2.result,r2.detail],['not_eligible','held']);
});

test('at most 100 records per call: a job that would exceed the total is skipped whole, never partly removed',async t=>{
  const {newJob,events,ver,count,purge}=await database(t);
  const a=await newJob();await events(a,[...Array.from({length:59},(_,i)=>[true,500-i/1000]),[false,400]]);   // 60
  const b=await newJob();await events(b,[...Array.from({length:59},(_,i)=>[true,500-i/1000]),[false,400]]);   // 60
  const rows=await purge([{job_id:a,row_version:await ver(a)},{job_id:b,row_version:await ver(b)}]);
  const by=Object.fromEntries(rows.map(r=>[r.job_id,[r.result,r.removed]]));
  const [first,second]=[a,b].sort();
  assert.deepEqual(by[first],['deleted',60]);assert.deepEqual(by[second],['over_limit',0]);
  assert.equal(await count(second),60,'second job kept whole');
});

test('input: 1-100 exact items, no duplicates, approval and operator required; any bad item rejects all; missing job is reported',async t=>{
  const {newJob,events,ver,count,purge}=await database(t);
  const j=await newJob();await events(j,[[true,500],[false,400]]);const ok={job_id:j,row_version:await ver(j)};
  for(const [items,re] of [[[],/1 to 100/],[Array.from({length:101},()=>({job_id:crypto.randomUUID(),row_version:0})),/1 to 100/],[[ok,ok],/duplicate/],
      [[ok,{job_id:'x',row_version:0}],/invalid job_id/],[[ok,{job_id:crypto.randomUUID(),row_version:-1}],/invalid row_version/],
      [[ok,{job_id:crypto.randomUUID(),row_version:'1'}],/invalid row_version/],[[{...ok,x:1}],/exactly/]])
    await assert.rejects(()=>purge(items),re);
  for(const [ref,by] of [['','op'],['A',''],['x'.repeat(201),'op'],['A','y'.repeat(101)]])await assert.rejects(()=>purge([ok],ref,by),/required/);
  assert.equal(await count(j),2,'nothing removed');
  assert.equal((await purge([{job_id:crypto.randomUUID(),row_version:0}]))[0].result,'missing');
});

test('execution records: read-only candidate counts only (no deletion function); privileges; stop keeps the candidate list',async t=>{
  const {as,su,suExec,newJob,events,ver,purge}=await database(t);
  await su(`insert into yt_private.detail_compaction_runs(approval_ref,executed_by,executed_at,requested,compacted,skipped) values ('A','op',now()-interval '400 days',1,1,0),('A','op',now(),1,0,1)`);
  await su(`insert into yt_private.report_purge_runs(approval_ref,executed_by,executed_at,requested,deleted,skipped_changed,skipped_held_or_open,missing) values ('A','op',now()-interval '10 days',1,1,0,0,0)`);
  const j=await newJob();await events(j,[[true,500],[false,400]]);
  const c=(await as('service','select * from public.yt_audit_retention_candidates()')).rows;
  const dc=c.find(x=>x.table_name==='detail_compaction_runs');assert.deepEqual([dc.records,dc.status],[2,'past_365_days: 1']);
  const rp=c.find(x=>x.table_name==='report_purge_runs');assert.deepEqual([rp.records,rp.status],[1,'past_365_days: 0']);
  const he=c.find(x=>x.table_name==='detail_hold_events'&&x.job_id===j);assert.deepEqual([he.records,he.status],[2,'eligible']);
  assert.equal(Object.keys(c[0]).includes('reason'),false,'no free text in the list');
  assert.equal((await su(`select count(*)::int n from pg_proc where proname ~ '^yt_audit_purge_(runs|compaction|report)'`)).rows[0].n,0,'no deletion for execution records');
  for(const who of [crypto.randomUUID(),null])for(const sql of ['select * from public.yt_audit_retention_candidates()',"select * from public.yt_audit_purge_hold_events('[]'::jsonb,'A','o')"])
    await assert.rejects(()=>as(who,sql),e=>e.code==='42501',sql);
  await suExec(SQL);   // idempotent
  await suExec(STOP);
  const vj=await ver(j);
  await assert.rejects(()=>purge([{job_id:j,row_version:vj}]),e=>e.code==='42501');
  await as('service','select * from public.yt_audit_retention_candidates()');
});
