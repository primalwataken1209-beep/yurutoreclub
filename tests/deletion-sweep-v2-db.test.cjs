// Sweep v2 SQL (unapplied draft, supabase/manual/deletion_u1_sweep_v2.sql): begin/alive/finish, Auth re-check, lease exclusion with the
// normal claim, counts-and-class-only records, privileges and the stop file. Isolated in-memory PostgreSQL (PGlite, one connection);
// synthetic data; no Supabase project. Real concurrency is not shown here.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { PGlite } = require('@electric-sql/pglite');
const A='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', B='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', C='cccccccc-cccc-cccc-cccc-cccccccccccc';
const PREPARE=fs.readFileSync('supabase/manual/deletion_u1_prepare.sql','utf8');
const V2=fs.readFileSync('supabase/manual/deletion_u1_sweep_v2.sql','utf8');
const STOP=fs.readFileSync('supabase/manual/deletion_u1_sweep_v2_stop.sql','utf8');

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
  await db.exec(`create table public.user_progress(user_id uuid primary key references auth.users(id) on delete cascade, data jsonb);
    insert into auth.users(id) values ('${A}'),('${B}'),('${C}');`);
  await db.exec(PREPARE);
  await db.exec(V2);
  const as=async(id,sql)=>{
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id||'']);
    await db.exec('set role '+(id==='service'?'service_role':id?'authenticated':'anon'));
    return db.query(sql);
  };
  const su=async sql=>{await db.exec('reset role');return db.query(sql);};
  const suExec=async sql=>{await db.exec('reset role');return db.exec(sql);};
  const v=async(sql)=>(await as('service',`select ${sql} v`)).rows[0].v;
  // A job past the Auth deletion (as the deletion function leaves it), for user u, in state st.
  const pastAuth=async(u,st='AWAITING_ASSURANCE')=>{
    const id=(await as('service',`select public.yt_deletion_accept('${u}',3600) id`)).rows[0].id;
    await su(`update yt_private.account_deletion_jobs set state='${st}', auth_deleted_at=now(), lease_owner=null, lease_expires_at=null where id='${id}'`);
    await su(`delete from auth.users where id='${u}'`);
    return id;
  };
  const jobRow=async id=>(await su(`select * from yt_private.account_deletion_jobs where id='${id}'`)).rows[0];
  return {db,as,su,suExec,v,pastAuth,jobRow};
}

test('begin: refuses unknown jobs, jobs not past the Auth deletion, a user that exists again in Auth, a missing R, and a held lease',async t=>{
  const {as,su,v,pastAuth,jobRow}=await database(t);
  assert.deepEqual(await v(`public.yt_deletion_sweep_begin('dddddddd-dddd-dddd-dddd-dddddddddddd','sweep-1',460)`),{refused:'not_found'});
  const jb=(await as('service',`select public.yt_deletion_accept('${B}',3600) id`)).rows[0].id;
  assert.deepEqual(await v(`public.yt_deletion_sweep_begin('${jb}','sweep-1',460)`),{refused:'not_past_auth'});
  const ja=await pastAuth(A);
  await su(`insert into auth.users(id) values ('${A}')`);   // the L record says deleted, but Auth has the user
  assert.deepEqual(await v(`public.yt_deletion_sweep_begin('${ja}','sweep-1',460)`),{refused:'auth_exists'});
  await su(`delete from auth.users where id='${A}'`);
  // A job without R (cannot happen through accept; built by hand here).
  await su(`insert into yt_private.account_deletion_jobs(user_id, token_ttl_seconds, state, auth_deleted_at) values ('${C}',3600,'AWAITING_ASSURANCE',now())`);
  await su(`delete from auth.users where id='${C}'`);
  const jc=(await su(`select id from yt_private.account_deletion_jobs where user_id='${C}'`)).rows[0].id;
  assert.deepEqual(await v(`public.yt_deletion_sweep_begin('${jc}','sweep-1',460)`),{refused:'no_refusal'});
  await su(`update yt_private.account_deletion_jobs set lease_owner='worker', lease_expires_at=now()+interval '1 minute' where id='${ja}'`);
  assert.deepEqual(await v(`public.yt_deletion_sweep_begin('${ja}','sweep-1',460)`),{refused:'busy'});
  await su(`update yt_private.account_deletion_jobs set lease_expires_at=now()-interval '1 second' where id='${ja}'`);   // expired lease
  const g0=Number((await jobRow(ja)).generation);
  const r=await v(`public.yt_deletion_sweep_begin('${ja}','sweep-1',460)`);
  assert.deepEqual(r,{user_id:A,generation:g0+1});
  const j=await jobRow(ja);assert.equal(j.lease_owner,'sweep-1');assert.ok(j.lease_expires_at>new Date(Date.now()+450000));
  await assert.rejects(()=>v(`public.yt_deletion_sweep_begin('${ja}','',460)`),/owner/);
  await assert.rejects(()=>v(`public.yt_deletion_sweep_begin('${ja}','x',59)`),/60/);
});

test('lease exclusion: while a sweep holds the lease the normal claim gets nothing; after finish it can claim; a sweep cannot start during a claim',async t=>{
  const {v,pastAuth,jobRow}=await database(t);
  const j=await pastAuth(A,'NEEDS_OPERATOR');
  const b=await v(`public.yt_deletion_sweep_begin('${j}','sweep-1',460)`);
  assert.equal(await v(`public.yt_deletion_claim('${j}','worker',460)`),null,'normal continuation blocked');
  assert.equal(await v(`public.yt_deletion_sweep_finish('${j}',${b.generation},'sweep-1',0,0,0,null,true)`),true);
  assert.equal((await jobRow(j)).lease_owner,null,'released');
  const c=await v(`public.yt_deletion_claim('${j}','worker',460)`);
  assert.ok(c&&c.generation===b.generation+1,'claim works after release and fences the sweep generation');
  assert.deepEqual(await v(`public.yt_deletion_sweep_begin('${j}','sweep-2',460)`),{refused:'busy'},'no sweep during a live claim');
  // The fenced sweep cannot record or look alive.
  assert.equal(await v(`public.yt_deletion_sweep_alive('${j}',${b.generation},'sweep-1',30)`),false);
  assert.equal(await v(`public.yt_deletion_sweep_finish('${j}',${b.generation},'sweep-1',0,0,0,null,true)`),false);
});

test('finish with p_release_lease false records but keeps the lease (an unknown removal may still run); null is refused',async t=>{
  const {v,pastAuth,jobRow}=await database(t);
  const j=await pastAuth(A,'NEEDS_OPERATOR');
  const b=await v(`public.yt_deletion_sweep_begin('${j}','s',460)`);
  await assert.rejects(()=>v(`public.yt_deletion_sweep_finish('${j}',${b.generation},'s',1,0,null,'remove_failed',null)`),/p_release_lease is required/);
  assert.equal(await v(`public.yt_deletion_sweep_finish('${j}',${b.generation},'s',1,0,null,'remove_failed',false)`),true);
  const r=await jobRow(j);
  assert.deepEqual([r.lease_owner,r.sweep_failures,r.sweep_last_error_class],['s',1,'remove_failed']);
  assert.ok(r.lease_expires_at>new Date(),'lease kept until it expires');
  assert.equal(await v(`public.yt_deletion_claim('${j}','worker',460)`),null,'the normal continuation still waits');
  assert.deepEqual(await v(`public.yt_deletion_sweep_begin('${j}','s2',460)`),{refused:'busy'},'and no new sweep');
});

test('alive: true only for the same generation and owner with enough lease left',async t=>{
  const {v,su,pastAuth}=await database(t);
  const j=await pastAuth(A);
  const b=await v(`public.yt_deletion_sweep_begin('${j}','sweep-1',460)`);
  assert.equal(await v(`public.yt_deletion_sweep_alive('${j}',${b.generation},'sweep-1',30)`),true);
  assert.equal(await v(`public.yt_deletion_sweep_alive('${j}',${b.generation},'other',30)`),false);
  assert.equal(await v(`public.yt_deletion_sweep_alive('${j}',${b.generation+1},'sweep-1',30)`),false);
  assert.equal(await v(`public.yt_deletion_sweep_alive('${j}',${b.generation},'sweep-1',500)`),false,'not enough lease left');
  await su(`update yt_private.account_deletion_jobs set lease_expires_at=now()-interval '1 second' where id='${j}'`);
  assert.equal(await v(`public.yt_deletion_sweep_alive('${j}',${b.generation},'sweep-1',0)`),false,'expired');
});

test('finish: completed needs known counts; a stop keeps unknown remaining; only fixed classes; counts only in the log; state unchanged',async t=>{
  const {v,pastAuth,jobRow}=await database(t);
  const j=await pastAuth(A);
  let b=await v(`public.yt_deletion_sweep_begin('${j}','s',460)`);
  await assert.rejects(()=>v(`public.yt_deletion_sweep_finish('${j}',${b.generation},'s',1,1,null,null,true)`),/known planned and remaining/);
  await assert.rejects(()=>v(`public.yt_deletion_sweep_finish('${j}',${b.generation},'s',null,0,0,null,true)`),/known planned and remaining/);
  await assert.rejects(()=>v(`public.yt_deletion_sweep_finish('${j}',${b.generation},'s',1,1,0,'network down: secret',true)`),/unknown error class/);
  await assert.rejects(()=>v(`public.yt_deletion_sweep_finish('${j}',${b.generation},'s',1,-1,0,null,true)`),/non-negative/);
  await assert.rejects(()=>v(`public.yt_deletion_sweep_finish('${j}',${b.generation},'s',1,null,0,null,true)`),/non-negative/);
  assert.equal(await v(`public.yt_deletion_sweep_finish('${j}',${b.generation},'s',2,2,0,null,true)`),true);
  let r=await jobRow(j);
  assert.deepEqual([r.sweeps,r.sweep_failures,r.late_objects_removed,r.sweep_last_error_class,r.state,r.lease_owner],[1,0,2,null,'AWAITING_ASSURANCE',null]);
  assert.ok(r.last_swept_at);
  b=await v(`public.yt_deletion_sweep_begin('${j}','s2',460)`);
  assert.equal(await v(`public.yt_deletion_sweep_finish('${j}',${b.generation},'s2',null,0,null,'limit_exceeded',true)`),true);
  r=await jobRow(j);
  assert.deepEqual([r.sweeps,r.sweep_failures,r.late_objects_removed,r.sweep_last_error_class],[1,1,2,'limit_exceeded']);
  const last=r.log.at(-1);
  assert.deepEqual(Object.keys(last).sort(),['at','error_class','ok','planned','remaining','removed','sweep','v']);
  assert.deepEqual([last.ok,last.planned,last.remaining,last.error_class,last.v],[false,null,null,'limit_exceeded',2]);
  for(const cls of ['list_failed','unexpected_layout','time_budget','lease_lost','remove_failed','verify_failed','unexpected']){
    b=await v(`public.yt_deletion_sweep_begin('${j}','s-${cls}',460)`);
    assert.equal(await v(`public.yt_deletion_sweep_finish('${j}',${b.generation},'s-${cls}',0,0,null,'${cls}',true)`),true,cls);
  }
});

test('privileges: users cannot call the v2 functions; the stop file blocks new sweeps only; applying twice is the same; v1 functions remain',async t=>{
  const {as,v,suExec,pastAuth,su}=await database(t);
  const j=await pastAuth(A);
  for(const who of [A,null])for(const sql of [`public.yt_deletion_sweep_begin('${j}','x',460)`,`public.yt_deletion_sweep_alive('${j}',1,'x',30)`,
      `public.yt_deletion_sweep_finish('${j}',1,'x',0,0,0,null,true)`])
    await assert.rejects(()=>as(who,`select ${sql}`),e=>e.code==='42501',sql);
  await suExec(V2);   // idempotent
  const b=await v(`public.yt_deletion_sweep_begin('${j}','running',460)`);   // a sweep that started before the stop
  await suExec(STOP);
  await assert.rejects(()=>as('service',`select public.yt_deletion_sweep_begin('${j}','new',460)`),e=>e.code==='42501','no new sweep');
  assert.equal(await v(`public.yt_deletion_sweep_alive('${j}',${b.generation},'running',30)`),true,'the running one can still check');
  assert.equal(await v(`public.yt_deletion_sweep_finish('${j}',${b.generation},'running',0,0,0,null,true)`),true,'and record/release');
  assert.equal((await su(`select count(*)::int n from pg_proc where proname in ('yt_deletion_sweep_record','yt_deletion_sweep_target','yt_deletion_sweep_list')`)).rows[0].n,3);
  // R/L guards unchanged: L and R still cannot be removed.
  await assert.rejects(()=>su(`delete from yt_private.account_deletion_jobs where id='${j}'`),/cannot be removed/);
  await assert.rejects(()=>su(`delete from yt_private.deletion_refusals where user_id='${A}'`),/cannot be removed/);
});
