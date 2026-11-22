// Operator check SQL (unapplied draft): only service_role can execute it; anon/authenticated get permission denied; the stop file
// removes service_role too. Isolated in-memory PostgreSQL (PGlite); no Supabase project.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { PGlite } = require('@electric-sql/pglite');
const SQL=fs.readFileSync('supabase/manual/deletion_u1_operator_check.sql','utf8');
const STOP=fs.readFileSync('supabase/manual/deletion_u1_operator_check_stop.sql','utf8');

test('operator check: true for service_role only; anon and authenticated are refused; applying twice is the same; the stop file blocks service_role',async t=>{
  const db=new PGlite();t.after(()=>db.close());
  await db.exec('create role anon; create role authenticated; create role service_role;');
  await db.exec(SQL);await db.exec(SQL);
  const as=async(role)=>{await db.exec('reset role');await db.exec('set role '+role);try{return (await db.query('select public.yt_deletion_operator_check() v')).rows[0].v;}finally{await db.exec('reset role');}};
  assert.equal(await as('service_role'),true);
  for(const r of ['anon','authenticated'])await assert.rejects(()=>as(r),e=>e.code==='42501',r);
  const def=(await db.query(`select prosecdef, proconfig from pg_proc where proname='yt_deletion_operator_check'`)).rows[0];
  assert.equal(def.prosecdef,false,'not security definer: the caller role is what is checked');
  await db.exec(STOP);
  await assert.rejects(()=>as('service_role'),e=>e.code==='42501','stopped');
});
