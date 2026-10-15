const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { PGlite } = require('@electric-sql/pglite');
const A='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', B='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const P='11111111-1111-1111-1111-111111111111', Q='22222222-2222-2222-2222-222222222222';
test('repository migrations enforce RLS in an isolated in-memory PostgreSQL',async t=>{
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
    grant select,insert,update,delete on storage.objects to authenticated;
  `);
  for(const file of fs.readdirSync('supabase/migrations').filter(n=>n.endsWith('.sql')).sort()) {
    await db.exec(fs.readFileSync('supabase/migrations/'+file,'utf8'));
  }
  await db.exec(`insert into auth.users(id) values ('${A}'),('${B}');
    update public.profiles set is_public=false where id='${A}';
    insert into public.posts(id,user_id,body,image_path) values
      ('${P}','${A}','private','${A}/${P}.jpg'),('${Q}','${B}','public','${B}/${Q}.jpg');
    insert into storage.objects(bucket_id,name) values ('post-images','${A}/${P}.jpg'),('post-images','${B}/${Q}.jpg');
    insert into public.comments(post_id,user_id,body) values ('${P}','${A}','private comment');
    insert into public.post_reactions(post_id,user_id,reaction_type) values ('${P}','${A}','panda');
  `);
  const as=async(id,sql)=>{
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id||'']);
    await db.exec('set role '+(id?'authenticated':'anon'));
    return db.query(sql);
  };
  await t.test('private owner sees own post and image; B cannot read them',async()=>{
    assert.equal((await as(A,`select * from public.posts where id='${P}'`)).rows.length,1);
    assert.equal((await as(A,`select * from storage.objects where name='${A}/${P}.jpg'`)).rows.length,1);
    for(const table of ['posts','comments','post_reactions']) {
      assert.equal((await as(B,`select * from public.${table} where ${table==='posts'?'id':'post_id'}='${P}'`)).rows.length,0);
    }
    assert.equal((await as(B,`select * from storage.objects where name='${A}/${P}.jpg'`)).rows.length,0);
    assert.equal((await as(A,`select * from public.posts where id='${Q}'`)).rows.length,1);
  });
  await t.test('B cannot comment/react on private post or write as A',async()=>{
    await as(A,`insert into public.comments(post_id,user_id,body) values ('${Q}','${A}','allowed')`);
    await as(A,`insert into public.post_reactions(post_id,user_id,reaction_type) values ('${Q}','${A}','panda')`);
    await as(A,`insert into storage.objects(bucket_id,name) values ('post-images','${A}/${Q}.jpg')`);
    for(const sql of [
      `insert into public.comments(post_id,user_id,body) values ('${P}','${B}','forbidden')`,
      `insert into public.post_reactions(post_id,user_id,reaction_type) values ('${P}','${B}','panda')`,
      `insert into public.posts(user_id,body) values ('${A}','forged')`,
      `insert into storage.objects(bucket_id,name) values ('post-images','${A}/${Q}.jpg')`
    ]) await assert.rejects(()=>as(B,sql),e=>e.code==='42501');
    assert.equal((await as(B,`update public.posts set body='forged' where id='${P}' returning id`)).rows.length,0);
    assert.equal((await as(B,`delete from storage.objects where name='${A}/${P}.jpg' returning id`)).rows.length,0);
  });
  await t.test('anonymous access is denied',async()=>{
    await assert.rejects(()=>as(null,'select * from public.posts'),e=>e.code==='42501');
    await assert.rejects(()=>as(null,'select * from storage.objects'),e=>e.code==='42501');
  });
  await t.test('deleted public post and its image disappear for other users',async()=>{
    await as(B,`update public.posts set is_deleted=true where id='${Q}'`);
    assert.equal((await as(A,`select * from public.posts where id='${Q}'`)).rows.length,0);
    assert.equal((await as(A,`select * from storage.objects where name='${B}/${Q}.jpg'`)).rows.length,0);
    assert.equal((await as(B,`select * from public.posts where id='${Q}'`)).rows.length,1);
  });
});
