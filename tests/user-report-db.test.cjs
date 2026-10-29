const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { PGlite } = require('@electric-sql/pglite');
const A='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', B='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const C='cccccccc-cccc-cccc-cccc-cccccccccccc', NOBODY='dddddddd-dddd-dddd-dddd-dddddddddddd';
const P='11111111-1111-1111-1111-111111111111';
const DRAFT=fs.readFileSync('supabase/manual/store_prep_user_reports.sql','utf8');
const ROLLBACK=fs.readFileSync('supabase/manual/store_prep_user_reports_rollback.sql','utf8');
const report=(target,type='user',{as='auth.uid()',status}={})=>status
  ?`insert into public.reports(reporter_user_id,target_type,target_id,reason,status) values (${as},'${type}','${target}','spam','${status}')`
  :`insert into public.reports(reporter_user_id,target_type,target_id,reason) values (${as},'${type}','${target}','spam')`;
// The reports definition Work read from staging and production on 2026-10-29 (names differ from the v50 file).
const LIVE_REPORTS=`
  alter table public.reports drop constraint reports_target_type_valid;
  alter table public.reports add constraint reports_target_type_check check (target_type in ('post','comment'));
  alter table public.reports drop constraint reports_status_valid;
  alter table public.reports add constraint reports_status_check check (status in ('open','reviewed','actioned','dismissed'));
  drop policy "reports: insert own" on public.reports;
  create policy "staging reports insert own" on public.reports for insert to authenticated
    with check (reporter_user_id = auth.uid() and status = 'open');`;

async function database(t,live){
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
  if(live)await db.exec(LIVE_REPORTS);
  await db.exec(`insert into auth.users(id) values ('${A}'),('${B}'),('${C}');
    update public.profiles set is_public=false where id='${A}';
    insert into public.posts(id,user_id,body) values ('${P}','${B}','public');`);
  const as=async(id,sql)=>{
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id||'']);
    await db.exec('set role '+(id?'authenticated':'anon'));
    return db.query(sql);
  };
  const admin=async sql=>{await db.exec('reset role');return db.query(sql);};
  const shape=async()=>({
    checks:(await admin("select conname,pg_get_constraintdef(oid) d from pg_constraint where conrelid='public.reports'::regclass and contype='c' and pg_get_constraintdef(oid) like '%target_type%' order by 1")).rows,
    policies:(await admin("select policyname,cmd,with_check from pg_policies where schemaname='public' and tablename='reports' order by 1")).rows
  });
  return {db,as,admin,shape};
}

for(const [label,live] of [['the live staging/production definition',true],['a database built from the repository migrations',false]]){
  test('user reports on '+label,async t=>{
    const {db,as,admin,shape}=await database(t,live);
    await t.test('before the draft, user reports are rejected by the CHECK',async()=>{
      await assert.rejects(()=>as(B,report(C)),e=>e.code==='23514');
    });
    await t.test('an unexpected extra policy stops the draft and changes nothing',async()=>{
      await admin(`create policy "extra insert" on public.reports for insert to authenticated with check (true)`);
      const before=await shape();
      await assert.rejects(()=>db.exec(DRAFT),/unexpected policy/);
      await db.exec('rollback');
      assert.deepEqual(await shape(),before);
      await admin('drop policy "extra insert" on public.reports');
    });
    await t.test('the draft applies, twice, leaving one CHECK and one INSERT policy',async()=>{
      await admin('select 1');
      await db.exec(DRAFT);await db.exec(DRAFT);
      const s=await shape();
      assert.deepEqual(s.checks.map(r=>r.conname),['reports_target_type_check']);
      assert.match(s.checks[0].d,/'user'/);
      assert.deepEqual(s.policies.map(r=>[r.policyname,r.cmd]),[['reports: insert own','INSERT']]);
      assert.match(s.policies[0].with_check,/status = 'open'/);
    });
    await t.test('another existing user can be reported, including a private account',async()=>{
      await as(B,report(C));
      await as(B,report(A));
    });
    await t.test('self, missing user, impersonation, anonymous and unknown type are rejected',async()=>{
      await assert.rejects(()=>as(B,report(B)),e=>e.code==='42501');
      await assert.rejects(()=>as(B,report(NOBODY)),e=>e.code==='42501');
      await assert.rejects(()=>as(B,report(C,'user',{as:`'${A}'`})),e=>e.code==='42501');
      await assert.rejects(()=>as(null,report(C,'user',{as:`'${B}'`})),e=>e.code==='42501');
      // Both the policy and the CHECK reject an unknown type; RLS is evaluated first.
      await assert.rejects(()=>as(B,report(C,'profile')),e=>['42501','23514'].includes(e.code));
    });
    await t.test('clients can only file open reports, for posts as well as users',async()=>{
      for(const status of ['actioned','reviewed','dismissed']){
        await assert.rejects(()=>as(C,report(P,'post',{status})),e=>e.code==='42501',status);
        await assert.rejects(()=>as(C,report(A,'user',{status})),e=>e.code==='42501',status);
      }
      await as(C,report(P,'post',{status:'open'}));
    });
    await t.test('duplicates are rejected by the existing unique index',async()=>{
      await assert.rejects(()=>as(B,report(C)),e=>e.code==='23505');
    });
    await t.test('reports stay unreadable and unchangeable from clients',async()=>{
      await assert.rejects(()=>as(B,'select * from public.reports'),e=>e.code==='42501');
      await assert.rejects(()=>as(B,"update public.reports set status='dismissed'"),e=>e.code==='42501');
      await assert.rejects(()=>as(B,'delete from public.reports'),e=>e.code==='42501');
      assert.deepEqual((await admin("select target_type,status,count(*)::int as n from public.reports group by 1,2 order by 1")).rows,
        [{target_type:'post',status:'open',n:1},{target_type:'user',status:'open',n:2}]);
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
    await t.test('rollback refuses while user reports exist, then restores the confirmed live definition',async()=>{
      await admin('select 1');
      await assert.rejects(()=>db.exec(ROLLBACK),/user reports exist/);
      await db.exec('rollback');
      assert.equal((await admin("select count(*)::int as n from public.reports where target_type='user'")).rows[0].n,2);
      await admin("delete from public.reports where target_type='user'");
      await db.exec(ROLLBACK);
      const s=await shape();
      assert.deepEqual(s.checks.map(r=>r.conname),['reports_target_type_check']);assert.doesNotMatch(s.checks[0].d,/'user'/);
      assert.deepEqual(s.policies.map(r=>r.policyname),['staging reports insert own']);
      await assert.rejects(()=>as(B,report(C)),e=>e.code==='23514');
      await assert.rejects(()=>as(B,report(P,'post',{status:'actioned'})),e=>e.code==='42501');
      await as(B,report(P,'post'));
    });
  });
}
