const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { PGlite } = require('@electric-sql/pglite');
const A='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', B='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const C='cccccccc-cccc-cccc-cccc-cccccccccccc', NOBODY='dddddddd-dddd-dddd-dddd-dddddddddddd';
const P='11111111-1111-1111-1111-111111111111';
const report=(target,type='user',as='auth.uid()')=>`insert into public.reports(reporter_user_id,target_type,target_id,reason) values (${as},'${type}','${target}','spam')`;
test('user reports and blocks are enforced by RLS in an isolated in-memory PostgreSQL',async t=>{
  const db=new PGlite();
  t.after(()=>db.close());
  // Minimal Supabase platform schemas, not a connection to a Supabase project.
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth; create schema storage;
    create table auth.users(id uuid primary key, raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth, storage to anon, authenticated;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
    alter table storage.objects enable row level security;
    create function storage.foldername(text) returns text[] language sql immutable as
      $$ select (string_to_array($1,'/'))[1:array_length(string_to_array($1,'/'),1)-1] $$;
  `);
  await db.exec(fs.readFileSync('supabase_v28_events.sql','utf8'));
  for(const file of fs.readdirSync('supabase/migrations').filter(n=>n.endsWith('.sql')).sort()) {
    await db.exec(fs.readFileSync('supabase/migrations/'+file,'utf8'));
  }
  await db.exec(`insert into auth.users(id) values ('${A}'),('${B}'),('${C}');
    update public.profiles set is_public=false where id='${A}';
    insert into public.posts(id,user_id,body) values ('${P}','${B}','public');`);
  const as=async(id,sql)=>{
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id||'']);
    await db.exec('set role '+(id?'authenticated':'anon'));
    return db.query(sql);
  };
  const reset=()=>db.exec('reset role');
  await t.test('current schema (before the draft) rejects user reports, so the app shows its failure message',async()=>{
    await assert.rejects(()=>as(B,report(C)),e=>e.code==='23514');
  });
  await t.test('draft SQL applies once and again without error',async()=>{
    await reset();
    await db.exec(fs.readFileSync('supabase/manual/store_prep_user_reports.sql','utf8'));
    await db.exec(fs.readFileSync('supabase/manual/store_prep_user_reports.sql','utf8'));
  });
  await t.test('another existing user can be reported, including a private account',async()=>{
    await as(B,report(C));
    await as(B,report(A));
  });
  await t.test('self, missing user, impersonation, anonymous and unknown type are rejected',async()=>{
    await assert.rejects(()=>as(B,report(B)),e=>e.code==='42501');
    await assert.rejects(()=>as(B,report(NOBODY)),e=>e.code==='42501');
    await assert.rejects(()=>as(B,report(C,'user',`'${A}'`)),e=>e.code==='42501');
    await assert.rejects(()=>as(null,report(C,'user',`'${B}'`)),e=>e.code==='42501');
    await assert.rejects(()=>as(B,report(C,'profile')),e=>e.code==='23514');
  });
  await t.test('duplicate user report is rejected by the existing unique index',async()=>{
    await assert.rejects(()=>as(B,report(C)),e=>e.code==='23505');
  });
  await t.test('post reports keep working and reports stay unreadable and unchangeable from clients',async()=>{
    await as(C,report(P,'post'));
    await assert.rejects(()=>as(B,'select * from public.reports'),e=>e.code==='42501');
    await assert.rejects(()=>as(B,"update public.reports set status='dismissed'"),e=>e.code==='42501');
    await assert.rejects(()=>as(B,'delete from public.reports'),e=>e.code==='42501');
    await reset();
    assert.deepEqual((await db.query("select target_type,count(*)::int as n from public.reports group by 1 order by 1")).rows,
      [{target_type:'post',n:1},{target_type:'user',n:2}]);
  });
  await t.test('existing blocks: own rows only, no self block, blocked user cannot see or remove it',async()=>{
    await as(B,`insert into public.blocks(blocker_id,blocked_id) values ('${B}','${C}')`);
    await assert.rejects(()=>as(B,`insert into public.blocks(blocker_id,blocked_id) values ('${B}','${B}')`),e=>['42501','23514'].includes(e.code));
    await assert.rejects(()=>as(C,`insert into public.blocks(blocker_id,blocked_id) values ('${B}','${A}')`),e=>e.code==='42501');
    assert.equal((await as(C,'select * from public.blocks')).rows.length,0);
    assert.equal((await as(C,`delete from public.blocks where blocker_id='${B}' returning blocker_id`)).rows.length,0);
    assert.equal((await as(B,'select * from public.blocks')).rows.length,1);
    await assert.rejects(()=>as(null,'select * from public.blocks'),e=>e.code==='42501');
  });
  await t.test('rollback refuses while user reports exist and restores v50 once they are handled',async()=>{
    await reset();
    const rollback=fs.readFileSync('supabase/manual/store_prep_user_reports_rollback.sql','utf8');
    await assert.rejects(()=>db.exec(rollback),/user reports exist/);
    await db.exec('rollback');
    assert.equal((await db.query("select count(*)::int as n from public.reports where target_type='user'")).rows[0].n,2);
    await db.exec("delete from public.reports where target_type='user'");
    await db.exec(rollback);
    await assert.rejects(()=>as(B,report(C)),e=>e.code==='23514');
    await as(B,report(P,'post'));
  });
});
