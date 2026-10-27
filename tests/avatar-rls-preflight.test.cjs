const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');
const A='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',B='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const prepare=fs.readFileSync('supabase/manual/v51_4_7_avatars_prepare.sql','utf8');
const stop=fs.readFileSync('supabase/manual/v51_4_7_avatars_emergency_stop.sql','utf8');
test('private avatar SQL protects ownership and leaves post-images unchanged',async t=>{
 const db=new PGlite();t.after(()=>db.close());
 await db.exec(`
 create role anon;create role authenticated;create schema auth;create schema storage;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth,storage to anon,authenticated;
 create table public.profiles(id uuid primary key,is_public boolean not null);
 alter table public.profiles enable row level security;
 create policy "profiles own or public" on public.profiles for select to authenticated using(id=auth.uid() or is_public);
 grant select on public.profiles to authenticated;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(bucket_id text,name text,primary key(bucket_id,name));
 alter table storage.objects enable row level security;
 grant select,insert,update,delete on storage.objects to anon,authenticated;
 create policy "post-images baseline" on storage.objects for all to authenticated
 using(bucket_id='post-images' and name=auth.uid()::text||'/post.jpg')
 with check(bucket_id='post-images' and name=auth.uid()::text||'/post.jpg');
 insert into storage.buckets values('post-images','post-images',false,3145728,array['image/jpeg']);
 insert into profiles values('${A}',false),('${B}',true);
 insert into storage.objects values('post-images','${A}/post.jpg'),('post-images','${B}/post.jpg');
 `);
 const before=(await db.query("select row_to_json(b) data from storage.buckets b where id='post-images'")).rows;
 await db.exec(prepare);
 const as=async(id,sql)=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id||'']);await db.exec('set role '+(id?'authenticated':'anon'));return db.query(sql);};
 await t.test('creates only a private JPEG bucket with a 3MiB limit',async()=>{
  assert.deepEqual((await db.query("select public,file_size_limit,allowed_mime_types from storage.buckets where id='avatars'")).rows,[{public:false,file_size_limit:3145728,allowed_mime_types:['image/jpeg']}]);
  assert.deepEqual((await db.query("select row_to_json(b) data from storage.buckets b where id='post-images'")).rows,before);
 });
 await t.test('owners can insert and replace their fixed avatar path',async()=>{
  await as(A,`insert into storage.objects values('avatars','${A}/avatar.jpg')`);
  await as(B,`insert into storage.objects values('avatars','${B}/avatar.jpg')`);
  assert.equal((await as(A,`insert into storage.objects values('avatars','${A}/avatar.jpg') on conflict(bucket_id,name) do update set name=excluded.name returning name`)).rows.length,1);
 });
 await t.test('private avatar is hidden from B; public avatar is visible to A',async()=>{
  assert.equal((await as(B,`select * from storage.objects where bucket_id='avatars' and name='${A}/avatar.jpg'`)).rows.length,0);
  assert.equal((await as(A,`select * from storage.objects where bucket_id='avatars' and name='${B}/avatar.jpg'`)).rows.length,1);
 });
 await t.test('writes cannot impersonate, rename to another owner, or delete others',async()=>{
  await assert.rejects(()=>as(B,`insert into storage.objects values('avatars','${A}/other.jpg')`),e=>e.code==='42501');
  await assert.rejects(()=>as(A,`update storage.objects set name='${B}/renamed.jpg' where bucket_id='avatars' and name='${A}/avatar.jpg'`),e=>e.code==='42501');
  assert.equal((await as(B,`delete from storage.objects where bucket_id='avatars' and name='${A}/avatar.jpg' returning name`)).rows.length,0);
 });
 await t.test('restrictive guards withstand broad avatar policies and anonymous grants',async()=>{
  await db.exec('reset role');
  await db.exec(`create policy "intentionally broad avatar access" on storage.objects for all to anon,authenticated using(bucket_id='avatars') with check(bucket_id='avatars')`);
  assert.equal((await as(B,`select * from storage.objects where bucket_id='avatars' and name='${A}/avatar.jpg'`)).rows.length,0);
  assert.equal((await as(null,"select * from storage.objects where bucket_id='avatars'")).rows.length,0);
  await assert.rejects(()=>as(null,`insert into storage.objects values('avatars','${A}/avatar.jpg')`),e=>e.code==='42501');
  await assert.rejects(()=>as(B,`update storage.objects set name='${A}/changed.jpg' where bucket_id='avatars' and name='${B}/avatar.jpg'`),e=>e.code==='42501');
 });
 await t.test('changing a public profile to private immediately changes subsequent RLS reads',async()=>{
  await db.exec('reset role');await db.query("update profiles set is_public=false where id=$1",[B]);
  assert.equal((await as(A,`select * from storage.objects where bucket_id='avatars' and name='${B}/avatar.jpg'`)).rows.length,0);
  assert.equal((await as(B,`select * from storage.objects where bucket_id='avatars' and name='${B}/avatar.jpg'`)).rows.length,1);
 });
 await t.test('owners can delete and re-register an avatar',async()=>{
  assert.equal((await as(A,`delete from storage.objects where bucket_id='avatars' and name='${A}/avatar.jpg' returning name`)).rows.length,1);
  await as(A,`insert into storage.objects values('avatars','${A}/avatar.jpg')`);
 });
 await t.test('repeat preparation refuses to overwrite the existing bucket',async()=>{
  await db.exec('reset role');await assert.rejects(()=>db.exec(prepare),/already exists/);await db.exec('rollback');
  assert.equal((await db.query("select public from storage.buckets where id='avatars'")).rows[0].public,false);
 });
 await t.test('emergency stop preserves files and denies all avatar operations while post-images still work',async()=>{
  await db.exec('reset role');const count=(await db.query("select count(*)::int n from storage.objects where bucket_id='avatars'")).rows[0].n;
  await db.exec(stop);
  assert.equal((await as(A,"select * from storage.objects where bucket_id='avatars'")).rows.length,0);
  await assert.rejects(()=>as(A,`insert into storage.objects values('avatars','${A}/avatar.jpg') on conflict(bucket_id,name) do update set name=excluded.name`),e=>e.code==='42501');
  assert.equal((await as(A,"delete from storage.objects where bucket_id='avatars' returning name")).rows.length,0);
  assert.equal((await as(A,"select * from storage.objects where bucket_id='post-images'")).rows.length,1);
  await db.exec('reset role');assert.equal((await db.query("select count(*)::int n from storage.objects where bucket_id='avatars'")).rows[0].n,count);
  assert.deepEqual((await db.query("select row_to_json(b) data from storage.buckets b where id='post-images'")).rows,before);
 });
});
