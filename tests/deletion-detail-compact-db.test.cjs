// Detail compaction of deletion jobs (unapplied draft, supabase/manual/deletion_u1_detail_compact.sql). Isolated in-memory PostgreSQL
// (PGlite, one connection); synthetic data only. Real concurrency is NOT shown here.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { PGlite } = require('@electric-sql/pglite');
const PREPARE=fs.readFileSync('supabase/manual/deletion_u1_prepare.sql','utf8');
const V2=fs.readFileSync('supabase/manual/deletion_u1_sweep_v2.sql','utf8');
const SQL=fs.readFileSync('supabase/manual/deletion_u1_detail_compact.sql','utf8');
const STOP=fs.readFileSync('supabase/manual/deletion_u1_detail_compact_stop.sql','utf8');

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
  await db.exec(PREPARE);await db.exec(V2);await db.exec(SQL);
  const as=async(id,sql,params)=>{
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id||'']);
    await db.exec('set role '+(id==='service'?'service_role':id?'authenticated':'anon'));
    try{return params?await db.query(sql,params):await db.query(sql);}finally{await db.exec('reset role');}
  };
  const su=async(sql,params)=>{await db.exec('reset role');return params?db.query(sql,params):db.query(sql);};
  const suExec=async sql=>{await db.exec('reset role');return db.exec(sql);};
  const job=async id=>(await su(`select * from yt_private.account_deletion_jobs where id=$1`,[id])).rows[0];
  // A finished deletion job (as the deletion function leaves it), with a v1-style log and a raw last_error, quiet for `days`.
  const finished=async({days=31,state='AWAITING_ASSURANCE',evidence=true}={})=>{
    const uid=crypto.randomUUID();
    await su(`insert into auth.users(id) values ($1)`,[uid]);
    const id=(await as('service',`select public.yt_deletion_accept($1,3600) id`,[uid])).rows[0].id;
    await su(`delete from auth.users where id=$1`,[uid]);
    await su(`update yt_private.account_deletion_jobs set state=$2, auth_deleted_at=now(), last_error='raw storage error text',
      log='[{"to":"STORAGE_DELETING"},{"to":"AWAITING_ASSURANCE","error":"raw text"}]'::jsonb where id=$1`,[id,state]);
    if(evidence)await su(`update yt_private.deletion_refusals set drained_at=now(), auth_deleted_at=now(), final_empty_at=now() where user_id=$1`,[uid]);
    await age(id,days);
    return {id,uid};
  };
  // Move the last activity back by `days` without counting as activity (trigger off for this one update).
  const age=async(id,days)=>{
    await suExec(`alter table yt_private.account_deletion_jobs disable trigger yt_jobs_detail`);
    await su(`update yt_private.account_deletion_jobs set last_activity_at=now()-make_interval(days=>$2) where id=$1`,[id,days]);
    await suExec(`alter table yt_private.account_deletion_jobs enable trigger yt_jobs_detail`);
  };
  const ver=async id=>Number((await job(id)).detail_version);
  const compact=(items,ref='APPROVAL-1',by='owner')=>as('service','select * from public.yt_deletion_compact_detail($1,$2,$3)',[JSON.stringify(items),ref,by]).then(r=>r.rows);
  return {db,as,su,suExec,job,finished,age,ver,compact};
}

test('compacts only the detail: log becomes one summary, last_error cleared; L row, R and every other column are kept',async t=>{
  const {job,finished,ver,compact,su}=await database(t);
  const {id,uid}=await finished();
  const before=await job(id);
  const rows=await compact([{job_id:id,row_version:await ver(id)}]);
  assert.deepEqual([rows[0].result,rows[0].detail],['compacted',null]);
  const after=await job(id);
  assert.equal(after.log.length,1);
  assert.deepEqual([after.log[0].compacted,after.log[0].entries,after.log[0].last_to],[true,2,'AWAITING_ASSURANCE']);
  assert.equal(after.last_error,null);assert.ok(after.detail_compacted_at);
  for(const k of ['user_id','state','generation','auth_deleted_at','sweeps','late_objects_removed','hold_until','requested_at','last_activity_at'])
    assert.deepEqual(after[k],before[k],k);
  assert.equal(Number(after.detail_version),Number(before.detail_version)+1);
  assert.equal((await su(`select count(*)::int n from yt_private.deletion_refusals where user_id=$1 and final_empty_at is not null`,[uid])).rows[0].n,1,'R kept');
  const run=(await su(`select requested, compacted, skipped from yt_private.detail_compaction_runs`)).rows;
  assert.deepEqual(run,[{requested:1,compacted:1,skipped:0}]);
});

test('not eligible: no R evidence, not AWAITING_ASSURANCE, a live lease, a sweep failure (class or later failure), a hold; an expired lease is fine',async t=>{
  const {su,as,finished,ver,compact,job,age}=await database(t);
  const cases={};
  cases.no_evidence=(await finished({evidence:false})).id;
  cases.state=(await finished({state:'NEEDS_OPERATOR'})).id;
  cases.lease=(await finished()).id;await su(`update yt_private.account_deletion_jobs set lease_owner='w', lease_expires_at=now()+interval '5 minutes' where id=$1`,[cases.lease]);await age(cases.lease,31);
  cases.cls=(await finished()).id;await su(`update yt_private.account_deletion_jobs set sweep_last_error_class='remove_failed' where id=$1`,[cases.cls]);await age(cases.cls,31);
  cases.later=(await finished()).id;await su(`update yt_private.account_deletion_jobs set last_swept_at=now()-interval '40 days', last_sweep_failed_at=now()-interval '35 days' where id=$1`,[cases.later]);await age(cases.later,31);
  cases.onlyFail=(await finished()).id;await su(`update yt_private.account_deletion_jobs set last_swept_at=null, last_sweep_failed_at=now()-interval '35 days' where id=$1`,[cases.onlyFail]);await age(cases.onlyFail,31);
  cases.hold=(await finished()).id;await as('service',`select public.yt_deletion_detail_hold($1,true,'investigating','owner')`,[cases.hold]);await age(cases.hold,31);
  const expired=(await finished()).id;await su(`update yt_private.account_deletion_jobs set lease_owner='w', lease_expires_at=now()-interval '1 minute' where id=$1`,[expired]);await age(expired,31);
  const items=[...Object.values(cases),expired];
  const byId={};for(const r of await compact(await Promise.all(items.map(async id=>({job_id:id,row_version:await ver(id)})))))byId[r.job_id]=[r.result,r.detail];
  const want={no_evidence:'no_evidence',state:'state',lease:'lease',cls:'sweep_failed',later:'sweep_failed',onlyFail:'sweep_failed',hold:'hold'};
  for(const [k,id] of Object.entries(cases)){assert.deepEqual(byId[id],['not_eligible',want[k]],k);assert.equal((await job(id)).log.length,2,k+' log untouched');}
  assert.deepEqual(byId[expired],['compacted',null]);
});

test('quiet time: 30 days after the last activity; equal to the transaction time is not enough; last_swept_at NULL without failures is fine',async t=>{
  const {db,su,finished,ver,compact,job,age}=await database(t);
  const young=(await finished({days:29})).id;
  const r=await compact([{job_id:young,row_version:await ver(young)}]);
  assert.deepEqual([r[0].result,r[0].detail],['not_eligible','not_quiet']);
  // Exactly 30 days before the transaction time.
  const edge=(await finished()).id;
  await db.exec('reset role');await db.exec('begin');
  await db.exec(`alter table yt_private.account_deletion_jobs disable trigger yt_jobs_detail`);
  await db.query(`update yt_private.account_deletion_jobs set last_activity_at=now()-interval '30 days' where id=$1`,[edge]);
  await db.exec(`alter table yt_private.account_deletion_jobs enable trigger yt_jobs_detail`);
  const v=Number((await db.query(`select detail_version v from yt_private.account_deletion_jobs where id=$1`,[edge])).rows[0].v);
  await db.exec('set role service_role');
  const re=(await db.query('select * from public.yt_deletion_compact_detail($1,$2,$3)',[JSON.stringify([{job_id:edge,row_version:v}]),'A','owner'])).rows;
  await db.exec('reset role');await db.exec('commit');
  assert.deepEqual([re[0].result,re[0].detail],['not_eligible','not_quiet'],'exactly 30 days is not past');
  const never=(await finished()).id;
  assert.equal((await job(never)).last_swept_at,null);
  assert.equal((await compact([{job_id:never,row_version:await ver(never)}]))[0].result,'compacted');
});

test('stale candidates: a log entry, a sweep record or a hold after listing changes the version → skipped_changed, newest log kept',async t=>{
  const {su,as,finished,ver,compact,job}=await database(t);
  const {id}=await finished();
  const listed=await ver(id);
  // A sweep records a result after the listing (also activity).
  const b=(await as('service',`select public.yt_deletion_sweep_begin($1,'s',460) v`,[id])).rows[0].v;
  await as('service',`select public.yt_deletion_sweep_finish($1,$2,'s',0,0,0,null,true)`,[id,b.generation]);
  const r=await compact([{job_id:id,row_version:listed}]);
  assert.deepEqual([r[0].result,r[0].detail],['skipped_changed',null]);
  const j=await job(id);
  assert.equal(j.log.length,3,'the new sweep entry is still there');assert.equal(j.log.at(-1).sweep,true);
  // And the sweep counted as activity: now not quiet even with the new version.
  assert.deepEqual((await compact([{job_id:id,row_version:await ver(id)}])).map(x=>x.detail),['not_quiet']);
  // A plain log append (advance-style) also moves the version and the activity.
  const k=(await finished()).id;const lk=await ver(k);
  await su(`update yt_private.account_deletion_jobs set log = log || '[{"note":"late"}]'::jsonb where id=$1`,[k]);
  assert.equal((await compact([{job_id:k,row_version:lk}]))[0].result,'skipped_changed');
  assert.equal((await compact([{job_id:k,row_version:await ver(k)}]))[0].detail,'not_quiet');
});

test('no second compaction of a summary; a new log entry after compaction makes it a candidate again after 30 quiet days',async t=>{
  const {as,finished,ver,compact,job,age}=await database(t);
  const {id}=await finished();
  assert.equal((await compact([{job_id:id,row_version:await ver(id)}]))[0].result,'compacted');
  await age(id,31);
  assert.deepEqual((await compact([{job_id:id,row_version:await ver(id)}])).map(x=>x.detail),['nothing_to_compact']);
  const b=(await as('service',`select public.yt_deletion_sweep_begin($1,'s',460) v`,[id])).rows[0].v;
  await as('service',`select public.yt_deletion_sweep_finish($1,$2,'s',1,1,0,null,true)`,[id,b.generation]);
  assert.deepEqual((await compact([{job_id:id,row_version:await ver(id)}])).map(x=>x.detail),['not_quiet'],'new entry restarted the quiet time');
  await age(id,31);
  assert.equal((await compact([{job_id:id,row_version:await ver(id)}]))[0].result,'compacted');
  const j=await job(id);
  assert.equal(j.log.length,1);assert.equal(j.log[0].entries,3,'summary counts the earlier entries too');
});

test('hold: setting and releasing need a reason and an operator; both restart the quiet time',async t=>{
  const {as,finished,ver,compact,job,age}=await database(t);
  const {id}=await finished();
  await assert.rejects(()=>as('service',`select public.yt_deletion_detail_hold($1,true,'','owner')`,[id]),/required/);
  await as('service',`select public.yt_deletion_detail_hold($1,true,'investigating','owner')`,[id]);
  assert.equal((await job(id)).detail_hold,true);
  await age(id,31);
  assert.deepEqual((await compact([{job_id:id,row_version:await ver(id)}])).map(x=>x.detail),['hold']);
  await as('service',`select public.yt_deletion_detail_hold($1,false,'done','owner')`,[id]);
  assert.deepEqual((await compact([{job_id:id,row_version:await ver(id)}])).map(x=>x.detail),['not_quiet'],'release restarted the quiet time');
});

test('input: 1-50 exact items, no duplicates, approval and operator required; any bad item rejects the whole call',async t=>{
  const {as,su,finished,ver,compact,job}=await database(t);
  const {id}=await finished();const ok={job_id:id,row_version:await ver(id)};
  const bad=[[[],/1 to 50/],[Array.from({length:51},()=>({job_id:crypto.randomUUID(),row_version:0})),/1 to 50/],[[ok,ok],/duplicate/],
    [[ok,{job_id:'x',row_version:0}],/invalid job_id/],[[ok,{job_id:crypto.randomUUID(),row_version:-1}],/invalid row_version/],
    [[ok,{job_id:crypto.randomUUID(),row_version:'1'}],/invalid row_version/],[[{...ok,extra:1}],/exactly/],[[ok,'x'],/exactly/]];
  for(const [items,re] of bad)await assert.rejects(()=>compact(items),re);
  for(const [ref,by] of [['','owner'],['A',''],['x'.repeat(201),'owner']])await assert.rejects(()=>compact([ok],ref,by),/required/);
  await assert.rejects(()=>as('service','select * from public.yt_deletion_compact_detail($1,$2,$3)',['{}','A','owner']),/JSON array/);
  assert.equal((await job(id)).log.length,2,'nothing compacted');
  assert.equal((await su('select count(*)::int n from yt_private.detail_compaction_runs')).rows[0].n,0);
  assert.equal((await compact([{job_id:crypto.randomUUID(),row_version:0}]))[0].result,'missing');
});

test('privileges and stop: users cannot call or read; the stop file blocks compaction and hold for service_role; sweeps keep working on compacted jobs',async t=>{
  const {as,suExec,finished,ver,compact}=await database(t);
  const {id}=await finished();
  for(const who of [crypto.randomUUID(),null])for(const sql of ['select * from public.yt_deletion_compact_detail(\'[]\'::jsonb,\'A\',\'o\')',
      `select public.yt_deletion_detail_hold('${id}',true,'r','o')`,'select * from public.yt_deletion_detail_candidates()','select * from yt_private.detail_compaction_runs'])
    await assert.rejects(()=>as(who,sql),e=>e.code==='42501',sql);
  assert.equal((await compact([{job_id:id,row_version:await ver(id)}]))[0].result,'compacted');
  const cands=(await as('service','select * from public.yt_deletion_detail_candidates()')).rows;
  assert.ok(cands.some(c=>c.job_id===id&&c.log_entries===1));
  // The compacted job still works for the sweep (begin → finish) and still refuses writes through R.
  const b=(await as('service',`select public.yt_deletion_sweep_begin($1,'s',460) v`,[id])).rows[0].v;
  assert.equal(typeof b.generation,'number');
  assert.equal((await as('service',`select public.yt_deletion_sweep_finish($1,$2,'s',0,0,0,null,true) v`,[id,b.generation])).rows[0].v,true);
  await suExec(SQL);   // idempotent
  await suExec(STOP);
  const vNow=await ver(id);
  await assert.rejects(()=>compact([{job_id:id,row_version:vNow}]),e=>e.code==='42501');
  await assert.rejects(()=>as('service',`select public.yt_deletion_detail_hold($1,true,'r','o')`,[id]),e=>e.code==='42501');
  await as('service','select * from public.yt_deletion_detail_candidates()');   // the list stays readable
});
