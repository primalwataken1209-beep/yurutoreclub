const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const os=require('node:os');
const source=fs.readFileSync('app.js','utf8');
const project='knftduojdalnawvkbelt';
test('staging sources use only the staging project and a publishable key',()=>{
  for(const file of ['app.js','index.html','_headers']){
    const text=fs.readFileSync(file,'utf8');
    assert.ok(text.includes(project));
    assert.ok(!text.includes('eszheiabjwehcbrteqza'));
    assert.ok(!text.includes('sb_secret_'));
  }
  assert.match(source,/SUPABASE_ANON_KEY='sb_publishable_[A-Za-z0-9_-]+'/);
  const csp=fs.readFileSync('_headers','utf8').match(/connect-src ([^;]+)/)[1];
  assert.equal(csp,`https://${project}.supabase.co wss://${project}.supabase.co`);
  assert.match(source,/STAGING_GOOGLE_ENABLED=false/);
  assert.equal((source.match(/STAGING_GOOGLE_ENABLED&&onGoogleLogin/g)||[]).length,2);
});
test('authentication redirects stay on approved preview origins and strip tokens',()=>{
  const code=source.match(/function authRedirectTo\(\)\{[\s\S]*?\n\}/)[0];
  for(const origin of ['https://deploy-preview-9--yurutore-club.netlify.app','https://yurutore-club-staging.netlify.app','http://127.0.0.1:3000']){
    assert.equal(vm.runInNewContext(code+';authRedirectTo()',{URL,location:{href:origin+'/index.html?code=secret#access_token=secret'}}),origin+'/');
  }
  for(const origin of ['https://yurutore-club.netlify.app','https://evil.netlify.app','https://deploy-preview-9--yurutore-club.netlify.app.evil.test','http://deploy-preview-9--yurutore-club.netlify.app']){
    assert.throws(()=>vm.runInNewContext(code+';authRedirectTo()',{URL,location:{href:origin}}),/disabled/);
  }
  assert.match(source,/emailRedirectTo:authRedirectTo\(\)/);
});
test('SDK transport rejects production before any network request',()=>{
  const code=source.match(/function stagingFetch\(input,options\)\{[\s\S]*?\n\}/)[0];
  const calls=[];
  const fetch=vm.runInNewContext(`const SUPABASE_URL='https://${project}.supabase.co';${code};stagingFetch`,{URL,window:{fetch:(...args)=>calls.push(args)}});
  fetch(`https://${project}.supabase.co/auth/v1/token`,{method:'POST'});
  for(const url of ['https://eszheiabjwehcbrteqza.supabase.co/rest/v1/profiles','https://evil.test/','http://knftduojdalnawvkbelt.supabase.co/'])assert.throws(()=>fetch(url),/Blocked/);
  assert.equal(calls.length,1);
});
test('preview build excludes administrative files and rejects production builds',()=>{
  const {build}=require('../scripts/build-staging.cjs');
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'yt-staging-'));
  try{
    assert.throws(()=>build(tmp,{CONTEXT:'production',BRANCH:'staging/isolated-test-app'}),/Only staging/);
    assert.throws(()=>build(tmp,{CONTEXT:'deploy-preview',BRANCH:'main'}),/Unexpected/);
    build(tmp,{CONTEXT:'offline-test',BRANCH:'staging/isolated-test-app'});
    for(const name of ['staging','supabase','tests','scripts','.github'])assert.ok(!fs.existsSync(path.join(tmp,name)));
    assert.ok(fs.existsSync(path.join(tmp,'index.html')));
  }finally{fs.rmSync(tmp,{recursive:true,force:true});}
});
test('staging additions isolate progress, blocks, events, reports and avatar writes',async t=>{
  const {PGlite}=require('@electric-sql/pglite');const db=new PGlite();t.after(()=>db.close());
  await db.exec(`create role anon;create role authenticated;create schema auth;create schema storage;
    create table auth.users(id uuid primary key);create table public.profiles(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth,storage to authenticated;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(bucket_id text,name text);alter table storage.objects enable row level security;
    grant select,insert,update,delete on storage.objects to authenticated;`);
  await db.exec(fs.readFileSync('staging/bootstrap.sql','utf8'));
  const a='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',b='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  await db.exec(`insert into auth.users values('${a}'),('${b}');insert into profiles values('${a}'),('${b}');`);
  async function as(id,sql){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated');return db.query(sql);}
  await as(a,`insert into user_progress(user_id,data) values('${a}','{"nickname":"test"}')`);
  assert.equal((await as(b,'select * from user_progress')).rows.length,0);
  await assert.rejects(()=>as(b,`insert into user_progress(user_id) values('${a}')`));
  await as(a,`insert into blocks(blocker_id,blocked_id) values('${a}','${b}')`);
  assert.equal((await as(b,'select * from blocks')).rows.length,0);
  await assert.rejects(()=>as(b,`insert into blocks(blocker_id,blocked_id) values('${a}','${b}')`));
  await as(a,"insert into app_events(event) values('app_open')");
  await assert.rejects(()=>as(b,`insert into app_events(user_id,event) values('${a}','app_open')`));
  await assert.rejects(()=>as(a,'select * from app_events'));
  await as(a,`insert into reports(target_type,target_id,reason) values('post','${b}','spam')`);
  await assert.rejects(()=>as(a,'select * from reports'));
  await as(a,`insert into storage.objects values('avatars','${a}/avatar.jpg')`);
  await assert.rejects(()=>as(b,`insert into storage.objects values('avatars','${a}/avatar.jpg')`));
  assert.equal((await as(b,`update storage.objects set name='${b}/avatar.jpg' returning name`)).rows.length,0);
  await assert.rejects(()=>as(a,`update storage.objects set name='${b}/avatar.jpg'`));
});
