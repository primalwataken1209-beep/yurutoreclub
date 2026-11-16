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
  await t.test('the job cannot be removed before its hold passes, and its user id cannot be changed',async()=>{
    await assert.rejects(()=>su(`delete from yt_private.account_deletion_jobs where id='${job}'`),/before its hold has passed/);
    await assert.rejects(()=>su(`update yt_private.account_deletion_jobs set user_id='${B}' where id='${job}'`),/immutable/);
  });
  await t.test('applying the draft twice changes nothing',async()=>{
    const before=(await su(`select tablename,policyname from pg_policies where policyname like 'yt deletion:%' order by 1,2`)).rows;
    await suExec(PREPARE);
    assert.deepEqual((await su(`select tablename,policyname from pg_policies where policyname like 'yt deletion:%' order by 1,2`)).rows,before);
    assert.equal(before.length,15);
  });
  await t.test('rollback refuses while a job is held, unless acknowledged; it removes only the guards and keeps the records',async()=>{
    await assert.rejects(()=>suExec(ROLLBACK),/unfinished or held deletion jobs exist/);
    await db.exec('rollback');   // the failed file left its transaction open
    assert.equal((await su(`select count(*)::int n from pg_policies where policyname like 'yt deletion:%'`)).rows[0].n,15,'refused rollback changed nothing');
    await su(`select set_config('yt.rollback_reopens_pending_users','acknowledged',false)`);
    await suExec(ROLLBACK);
    assert.equal((await su(`select count(*)::int n from pg_policies where policyname like 'yt deletion:%'`)).rows[0].n,0);
    assert.equal((await su('select count(*)::int n from yt_private.account_deletion_jobs')).rows[0].n,1,'records kept');
    await as(B,`insert into public.posts(user_id,body) values ('${B}','after rollback')`);
  });
});
