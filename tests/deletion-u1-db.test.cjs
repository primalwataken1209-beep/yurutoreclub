// U1 (unapplied draft): while a deletion job exists, the user's own JWT cannot create or change data/files; others are unaffected.
// Isolated in-memory PostgreSQL with minimal Supabase platform schemas; no connection to any Supabase project.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { PGlite } = require('@electric-sql/pglite');
const A='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', B='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const P='11111111-1111-1111-1111-111111111111', Q='22222222-2222-2222-2222-222222222222';
const PREPARE=fs.readFileSync('supabase/manual/deletion_u1_prepare.sql','utf8');
const ROLLBACK=fs.readFileSync('supabase/manual/deletion_u1_rollback.sql','utf8');

async function database(t){
  const db=new PGlite();
  t.after(()=>db.close());
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth; create schema storage;
    create table auth.users(id uuid primary key, raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth, storage to anon, authenticated, service_role;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,owner_id text, unique(bucket_id,name));
    alter table storage.objects enable row level security;
    create function storage.foldername(text) returns text[] language sql immutable as
      $$ select (string_to_array($1,'/'))[1:array_length(string_to_array($1,'/'),1)-1] $$;
    grant select,insert,update,delete on storage.objects to anon, authenticated;
  `);
  await db.exec(fs.readFileSync('supabase_v28_events.sql','utf8'));
  await db.exec(`grant select,insert,update,delete on public.app_events to authenticated;
    grant usage on sequence public.app_events_id_seq to authenticated;`);
  for(const file of fs.readdirSync('supabase/migrations').filter(n=>n.endsWith('.sql')).sort())
    await db.exec(fs.readFileSync('supabase/migrations/'+file,'utf8'));
  // Staging-only pieces, as Work read them on 2026-11-16 (definitions only): user_progress with the owner's four policies
  // and a cascade to auth.users; avatars with owner-path policies (simplified to one permissive set).
  await db.exec(`
    create table public.user_progress(user_id uuid primary key references auth.users(id) on delete cascade, data jsonb, updated_at timestamptz default now());
    alter table public.user_progress enable row level security;
    create policy "up select own" on public.user_progress for select to authenticated using (user_id = auth.uid());
    create policy "up insert own" on public.user_progress for insert to authenticated with check (user_id = auth.uid());
    create policy "up update own" on public.user_progress for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
    create policy "up delete own" on public.user_progress for delete to authenticated using (user_id = auth.uid());
    grant select,insert,update,delete on public.user_progress to authenticated;
    create policy "avatars own" on storage.objects for all to authenticated
      using (bucket_id='avatars' and name = auth.uid()::text || '/avatar.jpg')
      with check (bucket_id='avatars' and name = auth.uid()::text || '/avatar.jpg');
    insert into auth.users(id) values ('${A}'),('${B}');
    insert into public.posts(id,user_id,body) values ('${P}','${A}','a'),('${Q}','${B}','b');
  `);
  await db.exec(PREPARE);
  const as=async(id,sql,params)=>{
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id||'']);
    await db.exec('set role '+(id==='service'?'service_role':id?'authenticated':'anon'));
    return params?db.query(sql,params):db.query(sql);
  };
  const su=async(sql,params)=>{await db.exec('reset role');return params?db.query(sql,params):db.query(sql);};
  const suExec=async sql=>{await db.exec('reset role');return db.exec(sql);};   // multi-statement files
  return {db,as,su,suExec};
}
// Writes a user makes in normal use; {id} is the acting user.
const writes=(id,other)=>[
  ['avatar insert',`insert into storage.objects(bucket_id,name) values ('avatars','${id}/avatar.jpg')`],
  ['avatar upsert',`insert into storage.objects(bucket_id,name) values ('avatars','${id}/avatar.jpg') on conflict(bucket_id,name) do update set owner_id=excluded.owner_id`],
  ['post image insert',`insert into storage.objects(bucket_id,name) values ('post-images','${id}/${'99999999-9999-4999-8999-'+id.slice(-12)}.jpg')`],
  ['profile update',`update public.profiles set nickname='x' where id='${id}' returning id`],
  ['post insert',`insert into public.posts(user_id,body) values ('${id}','new')`],
  ['comment insert',`insert into public.comments(post_id,user_id,body) values ('${other}','${id}','c')`],
  ['reaction insert',`insert into public.post_reactions(post_id,user_id,reaction_type) values ('${other}','${id}','panda')`],
  ['follow insert',`insert into public.follows(follower_id,following_id) values ('${id}','${id===A?B:A}')`],
  ['block insert',`insert into public.blocks(blocker_id,blocked_id) values ('${id}','${id===A?B:A}')`],
  ['report insert',`insert into public.reports(reporter_user_id,target_type,target_id,reason) values ('${id}','post','${other}','spam')`],
  ['progress upsert',`insert into public.user_progress(user_id,data) values ('${id}','{}') on conflict(user_id) do update set data='{"n":1}'`],
  ['event insert',`insert into public.app_events(event) values ('app_open')`],
];
const refused=e=>e.code==='42501';

test('U1 draft: a deletion job stops only that user\'s own creates/changes; deletes and other users are unaffected',async t=>{
  const {db,as,su,suExec}=await database(t);
  await t.test('before any job, normal writes work for both users',async()=>{
    for(const [name,sql] of writes(A,Q)){const r=await as(A,sql);if(name==='profile update')assert.equal(r.rows.length,1,name);}
    for(const [name,sql] of writes(B,P)){const r=await as(B,sql);if(name==='profile update')assert.equal(r.rows.length,1,name);}
  });
  let job;
  await t.test('users cannot see or touch the job table or the service functions',async()=>{
    await assert.rejects(()=>as(A,'select * from yt_private.account_deletion_jobs'),refused);
    await assert.rejects(()=>as(A,'select * from yt_private.deletion_refusals'),refused);
    for(const fn of [`public.yt_deletion_drain_mark('${P}')`,`public.yt_deletion_drained('${P}')`,`public.yt_deletion_evidence('${P}','drained')`])
      await assert.rejects(()=>as(A,`select ${fn}`),refused,fn);
    await assert.rejects(()=>as(A,`select public.yt_deletion_accept('${B}',3600)`),refused);
    await assert.rejects(()=>as(A,`select public.yt_deletion_claim('${P}','x',60)`),refused);
    await assert.rejects(()=>as(null,`select public.yt_deletion_accept('${B}',3600)`),refused);
    assert.equal((await as(A,'select yt_private.write_allowed() ok')).rows[0].ok,true);
  });
  await t.test('the service role creates one job per user (a second request returns the same job)',async()=>{
    job=(await as('service',`select public.yt_deletion_accept('${A}',3600) id`)).rows[0].id;
    assert.equal((await as('service',`select public.yt_deletion_accept('${A}',3600) id`)).rows[0].id,job);
    assert.equal((await su('select count(*)::int n from yt_private.account_deletion_jobs')).rows[0].n,1);
  });
  await t.test('with a job, every create/change by A is refused (images, profile, posts, comments, reactions, follows, blocks, reports, progress, events)',async()=>{
    for(const [name,sql] of writes(A,Q)){
      if(name==='profile update'){assert.equal((await as(A,sql)).rows.length,0,name);continue;}   // UPDATE: row filtered out
      await assert.rejects(()=>as(A,sql),refused,name);
    }
    assert.equal((await as(A,`update storage.objects set owner_id='x' where name='${A}/avatar.jpg' returning id`)).rows.length,0,'avatar update');
    assert.equal((await as(A,`update public.posts set body='changed' where id='${P}' returning id`)).rows.length,0,'post update');
    assert.equal((await as(A,'select yt_private.write_allowed() ok')).rows[0].ok,false);
  });
  await t.test('A can still delete own data/files (only reduces what is left)',async()=>{
    assert.equal((await as(A,`delete from storage.objects where name='${A}/avatar.jpg' returning id`)).rows.length,1);
    assert.equal((await as(A,`delete from public.posts where user_id='${A}' and body='new' returning id`)).rows.length,1);
  });
  await t.test('B is not affected while A is being deleted',async()=>{
    // Rows that already exist from the first round (unique keys) are left out; the upserts and new rows are repeated.
    for(const [name,sql] of writes(B,P).filter(([n])=>!['avatar insert','reaction insert','follow insert','block insert','report insert','post image insert'].includes(n))){
      const r=await as(B,sql);if(name==='profile update')assert.equal(r.rows.length,1,name);
    }
  });
  await t.test('lease and generation: a second worker cannot claim a live lease; after expiry it can, and the old worker is fenced out',async()=>{
    const first=(await as('service',`select public.yt_deletion_claim('${job}','w1',120) c`)).rows[0].c;
    assert.equal(first.generation,1);assert.equal(first.user_id,A);
    assert.equal((await as('service',`select public.yt_deletion_claim('${job}','w2',120) c`)).rows[0].c,null);
    assert.equal((await as('service',`select public.yt_deletion_advance('${job}',1,'w1',array['WRITES_BLOCKED'],'STORAGE_DELETING','{"step":"s"}',10) ok`)).rows[0].ok,true);
    await su(`update yt_private.account_deletion_jobs set lease_expires_at=now()-interval '1 second' where id='${job}'`);
    const second=(await as('service',`select public.yt_deletion_claim('${job}','w2',120) c`)).rows[0].c;
    assert.equal(second.generation,2);
    assert.equal((await as('service',`select public.yt_deletion_advance('${job}',1,'w1',array['STORAGE_DELETING'],'STORAGE_VERIFIED','{}',10) ok`)).rows[0].ok,false,'old worker fenced');
    assert.equal((await as('service',`select public.yt_deletion_advance('${job}',2,'w2',array['WRITES_BLOCKED'],'STORAGE_VERIFIED','{}',10) ok`)).rows[0].ok,false,'wrong from-state refused');
    assert.equal((await as('service',`select public.yt_deletion_advance('${job}',2,'w2',array['STORAGE_DELETING'],'STORAGE_VERIFIED','{}',200) ok`)).rows[0].ok,false,'not enough lease left');
    assert.equal((await as('service',`select public.yt_deletion_advance('${job}',2,'w2',array['STORAGE_DELETING'],'STORAGE_VERIFIED','{}',10) ok`)).rows[0].ok,true);
  });
  await t.test('Auth deletion keeps the job (no foreign key) and sets a hold of token lifetime + 5 minutes; writes stay refused',async()=>{
    for(const [from,to] of [['STORAGE_VERIFIED','DB_DELETING'],['DB_DELETING','AUTH_DELETING']])
      assert.equal((await as('service',`select public.yt_deletion_advance('${job}',2,'w2',array['${from}'],'${to}','{}',10) ok`)).rows[0].ok,true);
    await su(`delete from auth.users where id='${A}'`);
    assert.equal((await as('service',`select public.yt_deletion_advance('${job}',2,'w2',array['AUTH_DELETING'],'AWAITING_ASSURANCE','{}',10,true) ok`)).rows[0].ok,true);
    const j=(await su(`select state, extract(epoch from hold_until-auth_deleted_at)::int secs, lease_owner from yt_private.account_deletion_jobs where id='${job}'`)).rows[0];
    assert.deepEqual(j,{state:'AWAITING_ASSURANCE',secs:3900,lease_owner:null});
    // An old access token of A is still accepted by the database until it expires; the job keeps refusing its writes.
    await assert.rejects(()=>as(A,`insert into storage.objects(bucket_id,name) values ('avatars','${A}/avatar.jpg')`),refused);
    assert.equal((await as('service',`select public.yt_deletion_claim('${job}','w3',120) c`)).rows[0].c,null,'no claims after the final state');
  });
  await t.test('R (refusal) is created with the job; the job (L) cannot be removed while R lacks its evidence, even after review time',async()=>{
    assert.equal((await su(`select count(*)::int n from yt_private.deletion_refusals where user_id='${A}'`)).rows[0].n,1);
    await su(`update yt_private.account_deletion_jobs set hold_until=now()-interval '30 days', auth_deleted_at=now()-interval '31 days' where id='${job}'`);
    await assert.rejects(()=>su(`delete from yt_private.account_deletion_jobs where id='${job}'`),/no terminal state/);
    for(const kind of ['drained','auth_deleted']){
      await as('service',`select public.yt_deletion_evidence('${job}','${kind}')`);
      await assert.rejects(()=>su(`delete from yt_private.account_deletion_jobs where id='${job}'`),/no terminal state/,'still not removable');
    }
    await assert.rejects(()=>su(`update yt_private.account_deletion_jobs set user_id='${B}' where id='${job}'`),/immutable/);
  });
  await t.test('R evidence is set once and never changed or cleared; R itself cannot be removed; A stays refused through it',async()=>{
    const first=(await su(`select drained_at from yt_private.deletion_refusals where user_id='${A}'`)).rows[0].drained_at;
    await as('service',`select public.yt_deletion_evidence('${job}','drained')`);   // second call: no change
    assert.equal((await su(`select drained_at from yt_private.deletion_refusals where user_id='${A}'`)).rows[0].drained_at.getTime(),first.getTime());
    await assert.rejects(()=>su(`update yt_private.deletion_refusals set drained_at=null where user_id='${A}'`),/set once/);
    await assert.rejects(()=>su(`update yt_private.deletion_refusals set refused_since=now() where user_id='${A}'`),/immutable/);
    await assert.rejects(()=>as('service',`select public.yt_deletion_evidence('${job}','something')`),/unknown evidence kind/);
    await as('service',`select public.yt_deletion_evidence('${job}','final_empty')`);
    // AWAITING_ASSURANCE with all three pieces of evidence is still not terminal: L (job_id, drain boundary, history) stays.
    await assert.rejects(()=>su(`delete from yt_private.account_deletion_jobs where id='${job}'`),/no terminal state/);
    await assert.rejects(()=>su(`delete from yt_private.deletion_refusals where user_id='${A}'`),/cannot be removed/);
    await assert.rejects(()=>as(A,`insert into storage.objects(bucket_id,name) values ('avatars','${A}/avatar.jpg')`),refused,'still refused');
  });
  await t.test('sweep: only for jobs past the Auth deletion; records each sweep; users cannot use it; it never ends the refusal',async()=>{
    const jb=(await as('service',`select public.yt_deletion_accept('${B}',3600) id`)).rows[0].id;
    assert.equal((await as('service',`select public.yt_deletion_sweep_target('${jb}') v`)).rows[0].v,null,'account still in use: no sweep');
    assert.equal((await as('service',`select public.yt_deletion_sweep_record('${jb}',1,0) v`)).rows[0].v,false);
    assert.equal((await as('service',`select public.yt_deletion_sweep_target('${job}') v`)).rows[0].v,A);
    assert.equal((await as('service',`select public.yt_deletion_sweep_record('${job}',2,0) v`)).rows[0].v,true);
    assert.equal((await as('service',`select public.yt_deletion_sweep_record('${job}',0,0) v`)).rows[0].v,true);
    const j=(await su(`select sweeps, late_objects_removed, last_swept_at is not null s, state from yt_private.account_deletion_jobs where id='${job}'`)).rows[0];
    assert.deepEqual(j,{sweeps:2,late_objects_removed:2,s:true,state:'AWAITING_ASSURANCE'},'an empty sweep does not change the state');
    const list=(await as('service','select * from public.yt_deletion_sweep_list()')).rows;
    assert.deepEqual(list.map(r=>r.job_id),[job]);
    await assert.rejects(()=>as('service',`select public.yt_deletion_sweep_record('${job}',-1,0)`),/non-negative/);
    // A failed sweep: remaining unknown (null), recorded apart; the successful sweep's time and count do not move.
    // Pin the successful sweep time to a known past value (text, microseconds) so that a change by the failed sweep is visible.
    await su(`alter table yt_private.account_deletion_jobs disable trigger user`);
    await su(`update yt_private.account_deletion_jobs set last_swept_at='2000-01-01 00:00:00+00' where id='${job}'`);
    await su(`alter table yt_private.account_deletion_jobs enable trigger user`);
    const before=(await su(`select last_swept_at::text t from yt_private.account_deletion_jobs where id='${job}'`)).rows[0].t;
    assert.equal((await as('service',`select public.yt_deletion_sweep_record('${job}',1,null,'list failed') v`)).rows[0].v,true);
    const f=(await su(`select sweeps, sweep_failures, late_objects_removed, last_swept_at::text t, last_sweep_failed_at is not null fa, log->-1 e from yt_private.account_deletion_jobs where id='${job}'`)).rows[0];
    assert.deepEqual([f.sweeps,f.sweep_failures,f.late_objects_removed,f.fa],[2,1,3,true]);
    assert.equal(String(f.t),String(before),'a failed sweep does not advance the successful sweep time');
    assert.deepEqual([f.e.ok,f.e.remaining,f.e.error],[false,null,'list failed']);
    await assert.rejects(()=>as('service',`select public.yt_deletion_sweep_record('${job}',0,null)`),/known remaining/);
    await assert.rejects(()=>as('service',`select public.yt_deletion_sweep_record('${job}',0,0,'x')`),/unknown remaining/);
    const l2=(await as('service','select * from public.yt_deletion_sweep_list()')).rows[0];
    assert.deepEqual([l2.sweeps,l2.sweep_failures],[2,1]);
    for(const fn of [`public.yt_deletion_sweep_target('${job}')`,`public.yt_deletion_sweep_record('${job}',0,0)`,`public.yt_deletion_sweep_list()`])
      await assert.rejects(()=>as(A,`select ${fn}`),refused,fn);
    await assert.rejects(()=>as(A,`insert into storage.objects(bucket_id,name) values ('avatars','${A}/avatar.jpg')`),refused,'still refused');
  });
  await t.test('the refusal comes from R alone: a user with an R row but no job is refused; others are not',async()=>{
    const D='dddddddd-dddd-dddd-dddd-dddddddddddd';
    await su(`insert into auth.users(id) values ('${D}')`);
    await as(D,`insert into storage.objects(bucket_id,name) values ('avatars','${D}/avatar.jpg')`);
    await su(`insert into yt_private.deletion_refusals(user_id) values ('${D}')`);
    assert.equal((await su(`select count(*)::int n from yt_private.account_deletion_jobs where user_id='${D}'`)).rows[0].n,0);
    await assert.rejects(()=>as(D,`insert into public.posts(user_id,body) values ('${D}','x')`),refused);
    assert.equal((await as(D,'select yt_private.write_allowed() ok')).rows[0].ok,false);
  });
  await t.test('L cannot be removed in a non-final state either',async()=>{
    const jb=(await su(`select id from yt_private.account_deletion_jobs where user_id='${B}'`)).rows[0].id;
    for(const k of ['drained','auth_deleted','final_empty'])await as('service',`select public.yt_deletion_evidence('${jb}','${k}')`);
    await assert.rejects(()=>su(`delete from yt_private.account_deletion_jobs where id='${jb}'`),/no terminal state/);
  });
  await t.test('drain functions: the boundary is recorded once; with no other transaction running, it is drained (single connection only)',async()=>{
    const jb=(await su(`select id from yt_private.account_deletion_jobs where user_id='${B}'`)).rows[0].id;
    const m1=(await as('service',`select public.yt_deletion_drain_mark('${jb}') v`)).rows[0].v;
    const m2=(await as('service',`select public.yt_deletion_drain_mark('${jb}') v`)).rows[0].v;
    assert.equal(String(m1),String(m2),'recorded once');
    assert.equal((await as('service',`select public.yt_deletion_drained('${jb}') v`)).rows[0].v,true);
    // A boundary far in the future is not drained (models a transaction that was still running).
    await su(`update yt_private.account_deletion_jobs set drain_xmax=drain_xmax+1000000 where id='${jb}'`);
    assert.equal((await as('service',`select public.yt_deletion_drained('${jb}') v`)).rows[0].v,false);
  });
  await t.test('sign-URL guard: creating a signed upload URL for avatars/post-images is refused for everyone; normal uploads are not',async()=>{
    const C='cccccccc-cccc-cccc-cccc-cccccccccccc';
    await su(`insert into auth.users(id) values ('${C}')`);
    const withOp=async(op,pathv,sql)=>{await db.exec('reset role');
      await db.query("select set_config('request.jwt.claim.sub',$1,false), set_config('storage.operation',$2,false), set_config('request.path',$3,false)",[C,op,pathv]);
      await db.exec('set role authenticated');return db.query(sql);};
    const ins=`insert into storage.objects(bucket_id,name) values ('avatars','${C}/avatar.jpg')`;
    await assert.rejects(()=>withOp('storage.object.sign_upload_url','/object/upload/sign/avatars/x',ins),refused,'by operation');
    await assert.rejects(()=>withOp('','/object/upload/sign/avatars/x',ins),refused,'by path');
    await assert.rejects(()=>withOp('storage.object.sign_upload_url','',`insert into storage.objects(bucket_id,name) values ('post-images','${C}/${'99999999-9999-4999-8999-'+C.slice(-12)}.jpg')`),refused,'post-images too');
    await withOp('storage.object.upload','/object/avatars/'+C+'/avatar.jpg',ins);   // normal upload of a user with no job: allowed
    assert.equal((await withOp('storage.object.sign_upload_url','/object/upload/sign/avatars/x',`update storage.objects set owner_id='x' where name='${C}/avatar.jpg' returning id`)).rows.length,0,'upsert path refused');
    await db.query("select set_config('storage.operation','',false), set_config('request.path','',false)");
  });
  await t.test('applying the draft twice changes nothing',async()=>{
    const q=`select tablename,policyname from pg_policies where policyname like 'yt deletion:%' or policyname like 'yt no signed upload urls%' order by 1,2`;
    const before=(await su(q)).rows;
    await suExec(PREPARE);
    assert.deepEqual((await su(q)).rows,before);
    assert.equal(before.length,17);
  });
  await t.test('rollback refuses while refusals exist, unless acknowledged; removes only the deletion guards; keeps R, L and the sign-URL guard',async()=>{
    await assert.rejects(()=>suExec(ROLLBACK),/deletion refusals or jobs exist/);
    await db.exec('rollback');   // the failed file left its transaction open
    assert.equal((await su(`select count(*)::int n from pg_policies where policyname like 'yt deletion:%'`)).rows[0].n,15,'refused rollback changed nothing');
    await su(`select set_config('yt.rollback_reopens_pending_users','acknowledged',false)`);
    await suExec(ROLLBACK);
    assert.equal((await su(`select count(*)::int n from pg_policies where policyname like 'yt deletion:%'`)).rows[0].n,0);
    assert.equal((await su(`select count(*)::int n from pg_policies where policyname like 'yt no signed upload urls%'`)).rows[0].n,2,'sign-URL guard kept');
    assert.equal((await su('select count(*)::int n from yt_private.deletion_refusals')).rows[0].n,3,'refusals kept (A, B, and D from the R-only test)');
    assert.equal((await su('select count(*)::int n from yt_private.account_deletion_jobs')).rows[0].n,2,'jobs kept');
    await as(B,`insert into public.posts(user_id,body) values ('${B}','after rollback')`);
    await su(`select set_config('yt.remove_sign_url_guard','acknowledged',false)`);
    await suExec(ROLLBACK);
    assert.equal((await su(`select count(*)::int n from pg_policies where policyname like 'yt no signed upload urls%'`)).rows[0].n,0,'removed only on its own acknowledgement');
  });
});
