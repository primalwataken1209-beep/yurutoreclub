// Report review/retention draft (unapplied): synthetic data in an isolated in-memory PostgreSQL; no Supabase project.
// Nothing deletes reports: the draft only lists candidates and re-checks them.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { PGlite } = require('@electric-sql/pglite');
const A='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', B='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', C='cccccccc-cccc-cccc-cccc-cccccccccccc';
const P='11111111-1111-1111-1111-111111111111';
const PREPARE=fs.readFileSync('supabase/manual/report_retention_prepare.sql','utf8');
const ROLLBACK=fs.readFileSync('supabase/manual/report_retention_rollback.sql','utf8');
const USER_REPORTS=fs.readFileSync('supabase/manual/store_prep_user_reports.sql','utf8');
const DAY=86400000;
const iso=ms=>new Date(ms).toISOString();

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
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
    alter table storage.objects enable row level security;
    create function storage.foldername(text) returns text[] language sql immutable as
      $$ select (string_to_array($1,'/'))[1:array_length(string_to_array($1,'/'),1)-1] $$;
  `);
  await db.exec(fs.readFileSync('supabase_v28_events.sql','utf8'));
  for(const file of fs.readdirSync('supabase/migrations').filter(n=>n.endsWith('.sql')).sort())
    await db.exec(fs.readFileSync('supabase/migrations/'+file,'utf8'));
  await db.exec(USER_REPORTS);   // user-target reports, as on staging
  // Worst case for the privilege change: broad platform-style grants on the table (as Supabase's defaults would give).
  await db.exec(`grant all on public.reports to anon, authenticated;`);
  await db.exec(`insert into auth.users(id) values ('${A}'),('${B}'),('${C}');
    insert into public.posts(id,user_id,body) values ('${P}','${B}','public post');`);
  // Synthetic existing reports before the draft: an old open one (40 days ago) and an old closed one (completion date unknown).
  await db.exec(`
    insert into public.reports(id,reporter_user_id,target_type,target_id,reason,status,created_at) values
      ('e0000000-0000-4000-8000-000000000001','${A}','post','${P}','spam','open',now()-interval '40 days'),
      ('e0000000-0000-4000-8000-000000000002','${C}','post','${P}','harassment','actioned',now()-interval '200 days');`);
  await db.exec(PREPARE);
  const as=async(id,sql,params)=>{
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id||'']);
    await db.exec('set role '+(id==='service'?'service_role':id?'authenticated':'anon'));
    return params?db.query(sql,params):db.query(sql);
  };
  const su=async(sql,params)=>{await db.exec('reset role');return params?db.query(sql,params):db.query(sql);};
  const suExec=async sql=>{await db.exec('reset role');return db.exec(sql);};
  const row=async id=>(await su('select * from public.reports where id=$1',[id])).rows[0];
  const svc=(fn,args)=>as('service',`select ${fn} v`,args).then(r=>r.rows[0].v);
  return {db,as,su,suExec,row,svc};
}
const userReport=(target)=>`insert into public.reports(reporter_user_id,target_type,target_id,reason,note) values (auth.uid(),'user','${target}','spam','synthetic note')`;
const refused=e=>e.code==='42501';

test('report retention draft (synthetic data, isolated)',async t=>{
  const {db,as,su,suExec,row,svc}=await database(t);
  const OLD_OPEN='e0000000-0000-4000-8000-000000000001', OLD_CLOSED='e0000000-0000-4000-8000-000000000002';

  await t.test('migration: receipt dates kept; the old open report shows as overdue from receipt, with a separate migration review date',async()=>{
    const r=await row(OLD_OPEN);
    assert.ok(Math.abs(r.review_due_at - (r.created_at.getTime()+14*DAY))<1000,'review due = receipt + 14 days');
    assert.ok(r.review_due_at < new Date(),'already overdue (not hidden by the migration)');
    assert.ok(r.migration_review_due_at > new Date(Date.now()+13*DAY),'separate migration review date');
    const list=(await as('service','select * from public.yt_report_review_list()')).rows;
    const o=list.find(x=>x.id===OLD_OPEN);assert.equal(o.review_overdue,true);assert.ok(o.days_since_receipt>=40);
  });
  await t.test('migration: an old closed report with unknown completion date needs a person, and is never a candidate',async()=>{
    const r=await row(OLD_CLOSED);
    assert.equal(r.legacy_review_required,true);assert.equal(r.closed_at,null);assert.equal(r.retention_until,null);
    const c=(await as('service','select * from public.yt_report_deletion_candidates($1)',[iso(Date.now()+3650*DAY)])).rows;
    assert.equal(c.some(x=>x.id===OLD_CLOSED),false);
  });
  await t.test('users still send reports with the five app columns; management columns start from fixed values',async()=>{
    await as(A,userReport(C));
    const r=(await su(`select * from public.reports where reporter_user_id='${A}' and target_type='user'`)).rows[0];
    assert.equal(r.status,'open');assert.equal(Number(r.row_version),0);
    assert.equal(r.closed_at,null);assert.equal(r.retention_hold,false);assert.equal(r.legacy_review_required,false);
    assert.ok(Math.abs(r.review_due_at-(r.created_at.getTime()+14*DAY))<1000);
  });
  await t.test('users cannot set or change management columns, read reports, or call operator functions',async()=>{
    for(const sql of [
      `insert into public.reports(reporter_user_id,target_type,target_id,reason,closed_at) values (auth.uid(),'post','${P}','spam',now())`,
      `insert into public.reports(reporter_user_id,target_type,target_id,reason,retention_hold) values (auth.uid(),'post','${P}','spam',true)`,
      `insert into public.reports(reporter_user_id,target_type,target_id,reason,row_version) values (auth.uid(),'post','${P}','spam',5)`,
      `insert into public.reports(reporter_user_id,target_type,target_id,reason,status) values (auth.uid(),'post','${P}','spam','dismissed')`,
      `update public.reports set closed_at=now()`,
      `update public.reports set retention_until=now()`,
      `select * from public.reports`,
      `delete from public.reports`,
      `select public.yt_report_close('${OLD_OPEN}','dismissed','x','y')`,
      `select * from public.yt_report_deletion_candidates()`,
    ]) await assert.rejects(()=>as(B,sql),refused,sql);
    await assert.rejects(()=>as(null,userReport(C)),refused,'anon cannot report');
    const grants=(await su(`select privilege_type from information_schema.role_table_grants where table_schema='public' and table_name='reports' and grantee in ('anon','authenticated')`)).rows;
    assert.deepEqual(grants,[],'no table-wide grant left (column grants only)');
  });
  await t.test('even a privileged insert gets the fixed starting values (second line of defence)',async()=>{
    await su(`insert into public.reports(reporter_user_id,target_type,target_id,reason,closed_at,retention_hold,row_version,legacy_review_required)
              values ('${B}','post','${P}','spam',now(),true,9,true)`);
    const r=(await su(`select * from public.reports where reporter_user_id='${B}'`)).rows[0];
    assert.deepEqual([r.closed_at,r.retention_hold,Number(r.row_version),r.legacy_review_required],[null,false,0,false]);
  });
  await t.test('row_version goes up on every related change, not on a no-op, and cannot be set by hand',async()=>{
    const id=(await su(`select id from public.reports where reporter_user_id='${B}'`)).rows[0].id;
    const v=async()=>Number((await row(id)).row_version);
    let n=await v();
    for(const set of [`status='reviewed'`,`closed_at=now()`,`retention_until=now()+interval '1 day'`,`retention_hold=true`,`hold_reason='x'`,
                      `review_due_at=now()`,`legacy_review_required=true`,`migration_review_due_at=now()`,`close_reason='r'`,`note='changed'`]){
      await su(`update public.reports set ${set} where id='${id}'`);const m=await v();assert.equal(m,n+1,set);n=m;
    }
    await su(`update public.reports set note=note where id='${id}'`);assert.equal(await v(),n,'no-op keeps the version');
    await su(`update public.reports set row_version=0 where id='${id}'`);assert.equal(await v(),n,'cannot be set by hand');
  });
  // A clean closed report for the candidate tests.
  // One report per (reporter, target) is allowed (existing unique index); target P is the post, others are users.
  const fresh=async(reporter,target)=>{
    await as(reporter,target===P?`insert into public.reports(reporter_user_id,target_type,target_id,reason) values (auth.uid(),'post','${P}','spam')`:userReport(target));
    return (await su(`select id from public.reports where reporter_user_id='${reporter}' and target_id='${target}'`)).rows[0].id;};
  await su(`delete from public.reports where reporter_user_id='${B}'`);
  const later=iso(Date.now()+91*DAY);
  await t.test('closing sets completion and retention (90 days, a setting); reviewed alone is not completion',async()=>{
    const id=await fresh(B,A);
    await su(`update public.reports set status='reviewed' where id='${id}'`);
    let c=(await as('service','select * from public.yt_report_deletion_candidates($1)',[later])).rows;
    assert.equal(c.some(x=>x.id===id),false,'status reviewed without closed_at is not a candidate');
    await svc(`public.yt_report_close('${id}','dismissed','duplicate report','owner')`);
    const r=await row(id);assert.ok(Math.abs(r.retention_until-(r.closed_at.getTime()+90*DAY))<1000);
    assert.deepEqual([r.last_action,r.last_reason,r.last_decided_by],['close','duplicate report','owner']);
    c=(await as('service','select * from public.yt_report_deletion_candidates()')).rows;
    assert.equal(c.some(x=>x.id===id),false,'not before the retention date');
    c=(await as('service','select * from public.yt_report_deletion_candidates($1)',[later])).rows;
    assert.equal(c.some(x=>x.id===id),true,'candidate after the retention date');
    await su(`update yt_private.report_retention_settings set retention_days=30`);
    const id2=await fresh(C,A);await svc(`public.yt_report_close('${id2}','reviewed','checked','owner')`);
    const r2=await row(id2);assert.ok(Math.abs(r2.retention_until-(r2.closed_at.getTime()+30*DAY))<1000,'setting is used');
    await su(`update yt_private.report_retention_settings set retention_days=90`);
  });
  await t.test('re-check: unchanged candidates are eligible; after listing, hold / extension / reopen / re-close each drop it',async()=>{
    const ids={};
    for(const [k,rep,tg] of [['keep',A,B],['hold',C,B],['extend',B,C]]){ids[k]=await fresh(rep,tg);await svc(`public.yt_report_close('${ids[k]}','actioned','handled','owner')`);}
    const list=(await as('service','select * from public.yt_report_deletion_candidates($1)',[later])).rows;
    const items=Object.values(ids).map(id=>{const x=list.find(c=>c.id===id);assert.ok(x,'listed');return {id,row_version:Number(x.row_version)};});
    // After listing: put one on hold; extend another's retention without changing closed_at.
    await svc(`public.yt_report_hold('${ids.hold}',true,null,'legal question pending','owner')`);
    await svc(`public.yt_report_hold('${ids.extend}',false,'${iso(Date.now()+400*DAY)}','keep for a repeat case','owner')`);
    assert.equal((await row(ids.extend)).closed_at.getTime(),list.find(c=>c.id===ids.extend).closed_at.getTime(),'closed_at unchanged');
    const res=(await as('service','select * from public.yt_report_deletion_recheck($1,$2)',[JSON.stringify(items),later])).rows;
    const by=Object.fromEntries(res.map(r=>[r.id,r]));
    assert.deepEqual([by[ids.keep].eligible,by[ids.keep].reason],[true,'ok']);
    assert.deepEqual([by[ids.hold].eligible,by[ids.hold].reason],[false,'changed_after_listing']);
    assert.deepEqual([by[ids.extend].eligible,by[ids.extend].reason],[false,'changed_after_listing'],'retention extension with the same closed_at is caught');
    // Even if someone re-used an old row_version, the same rule (hold / later retention) still rejects it.
    const sameVer=[{id:ids.hold,row_version:Number((await row(ids.hold)).row_version)},{id:ids.extend,row_version:Number((await row(ids.extend)).row_version)}];
    for(const r of (await as('service','select * from public.yt_report_deletion_recheck($1,$2)',[JSON.stringify(sameVer),later])).rows)assert.deepEqual([r.eligible,r.reason],[false,'not_deletable_now']);
    // Reopen and re-close after listing.
    const ro=await fresh(B,P);await svc(`public.yt_report_close('${ro}','reviewed','ok','owner')`);
    const l2=(await as('service','select * from public.yt_report_deletion_candidates($1)',[later])).rows;
    const roItem={id:ro,row_version:Number(l2.find(c=>c.id===ro).row_version)};
    await svc(`public.yt_report_reopen('${ro}','new information','owner')`);
    let r=(await as('service','select * from public.yt_report_deletion_recheck($1,$2)',[JSON.stringify([roItem]),later])).rows[0];
    assert.deepEqual([r.eligible,r.reason],[false,'changed_after_listing'],'reopened');
    const reopened=await row(ro);assert.equal(reopened.status,'open');assert.equal(reopened.closed_at,null);assert.ok(reopened.review_due_at>new Date(Date.now()+13*DAY));
    await svc(`public.yt_report_close('${ro}','actioned','closed again','owner')`);
    r=(await as('service','select * from public.yt_report_deletion_recheck($1,$2)',[JSON.stringify([roItem]),later])).rows[0];
    assert.deepEqual([r.eligible,r.reason],[false,'changed_after_listing'],'re-closed');
    assert.equal((await su('select count(*)::int n from public.reports')).rows[0].n>0,true,'nothing was deleted');
  });
  await t.test('candidate list and re-check use the same rule: open, legacy, hold, not yet due are all excluded by both',async()=>{
    const ids=[OLD_OPEN,OLD_CLOSED];
    const list=(await as('service','select * from public.yt_report_deletion_candidates($1)',[iso(Date.now()+3650*DAY)])).rows;
    assert.equal(list.some(c=>ids.includes(c.id)),false);
    const items=await Promise.all(ids.map(async id=>({id,row_version:Number((await row(id)).row_version)})));
    for(const r of (await as('service','select * from public.yt_report_deletion_recheck($1,$2)',[JSON.stringify(items),iso(Date.now()+3650*DAY)])).rows)
      assert.deepEqual([r.eligible,r.reason],[false,'not_deletable_now']);
  });
  await t.test('inconsistent rows (e.g. edited directly) are excluded by each part of the rule, in both the list and the re-check',async()=>{
    await su(`insert into public.posts(id,user_id,body) values ('33333333-3333-3333-3333-333333333333','${B}','x'),('44444444-4444-4444-4444-444444444444','${B}','y'),('55555555-5555-5555-5555-555555555555','${B}','z')`);
    const mk=async(post)=>{await su(`insert into public.reports(reporter_user_id,target_type,target_id,reason) values ('${B}','post','${post}','spam')`);
      return (await su(`select id from public.reports where target_id='${post}'`)).rows[0].id;};
    const past=`now()-interval '1 day'`;
    const legacy=await mk('33333333-3333-3333-3333-333333333333');
    await su(`update public.reports set status='actioned', closed_at=${past}, retention_until=${past}, legacy_review_required=true where id='${legacy}'`);
    const noClosed=await mk('44444444-4444-4444-4444-444444444444');
    await su(`update public.reports set status='dismissed', closed_at=null, retention_until=${past} where id='${noClosed}'`);
    const stillOpen=await mk('55555555-5555-5555-5555-555555555555');
    await su(`update public.reports set status='open', closed_at=${past}, retention_until=${past} where id='${stillOpen}'`);
    const ids=[legacy,noClosed,stillOpen];
    const list=(await as('service','select * from public.yt_report_deletion_candidates()')).rows;
    assert.deepEqual(list.filter(c=>ids.includes(c.id)),[],'none listed');
    const items=await Promise.all(ids.map(async id=>({id,row_version:Number((await row(id)).row_version)})));
    for(const r of (await as('service','select * from public.yt_report_deletion_recheck($1)',[JSON.stringify(items)])).rows)
      assert.deepEqual([r.eligible,r.reason],[false,'not_deletable_now'],r.id);
  });
  await t.test('security definer boundaries: search_path fixed, operator functions only for service_role, users cannot touch settings',async()=>{
    const fns=(await su(`select p.proname, p.prosecdef, p.proconfig from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where (n.nspname='public' and p.proname like 'yt_report_%') or (n.nspname='yt_private' and p.proname in ('reports_before_insert','reports_before_update','report_deletable'))`)).rows;
    assert.equal(fns.length,11);
    for(const f of fns)assert.ok((f.proconfig||[]).includes('search_path=""'),f.proname+' search_path fixed');
    for(const f of fns.filter(f=>f.proname.startsWith('yt_report_')))assert.equal(f.prosecdef,true,f.proname);
    for(const who of [B,null]){
      await assert.rejects(()=>as(who,'select * from yt_private.report_retention_settings'),refused);
      await assert.rejects(()=>as(who,'update yt_private.report_retention_settings set retention_days=1'),refused);
      await assert.rejects(()=>as(who,`select public.yt_report_reopen('${OLD_OPEN}','x','y')`),refused);
      await assert.rejects(()=>as(who,`select * from public.yt_report_review_list()`),refused);
    }
    assert.equal((await su('select retention_days from yt_private.report_retention_settings')).rows[0].retention_days,90,'unchanged');
  });
  await t.test('legacy: a person confirms a date; only then can it become a candidate (date in the future refused)',async()=>{
    await assert.rejects(()=>svc(`public.yt_report_resolve_legacy('${OLD_CLOSED}','${iso(Date.now()+DAY)}','x','owner')`),/confirmed date/);
    await svc(`public.yt_report_resolve_legacy('${OLD_CLOSED}',now(),'checked during migration review','owner')`);
    const r=await row(OLD_CLOSED);assert.equal(r.legacy_review_required,false);assert.ok(r.retention_until>new Date(Date.now()+89*DAY));
  });
  await t.test('extension of an open review needs reason, decider and a next date within 14 days',async()=>{
    await assert.rejects(()=>svc(`public.yt_report_extend_review('${OLD_OPEN}','${iso(Date.now()+20*DAY)}','x','owner')`),/allowed extension/);
    await assert.rejects(()=>svc(`public.yt_report_extend_review('${OLD_OPEN}','${iso(Date.now()+7*DAY)}','','owner')`),/required/);
    await svc(`public.yt_report_extend_review('${OLD_OPEN}','${iso(Date.now()+7*DAY)}','waiting for more context','owner')`);
    const r=await row(OLD_OPEN);assert.equal(r.last_action,'extend_review');assert.ok(r.created_at<new Date(Date.now()-39*DAY),'receipt date unchanged');
  });
  await t.test('reporter account deletion still removes that reporter\'s reports (cascade kept); a reported user\'s deletion does not',async()=>{
    const before=(await su(`select count(*)::int n from public.reports where target_id='${C}'`)).rows[0].n;
    await su(`delete from auth.users where id='${A}'`);
    assert.equal((await su(`select count(*)::int n from public.reports where reporter_user_id='${A}'`)).rows[0].n,0);
    await su(`delete from auth.users where id='${C}'`);
    assert.ok((await su(`select count(*)::int n from public.reports where target_id='${C}'`)).rows[0].n>0,'reports about a deleted user remain (handled by review/retention)');
    assert.ok(before>0);
  });
  await t.test('applying the draft again changes nothing (no second migration)',async()=>{
    const snap=async()=>(await su('select id,row_version,legacy_review_required,migration_review_due_at from public.reports order by id')).rows;
    const before=await snap();await suExec(PREPARE);assert.deepEqual(await snap(),before);
  });
  await t.test('re-check rejects malformed items (never eligible): missing/null/non-integer/negative version, bad id, non-object',async()=>{
    // A real, currently eligible candidate, so that only the malformed field can make the answer false.
    const q='66666666-6666-6666-6666-666666666666';
    await su(`insert into public.posts(id,user_id,body) values ('${q}','${B}','q')`);
    await su(`insert into public.reports(reporter_user_id,target_type,target_id,reason) values ('${B}','post','${q}','spam')`);
    const id=(await su(`select id from public.reports where target_id='${q}'`)).rows[0].id;
    await svc(`public.yt_report_close('${id}','actioned','handled','owner')`);
    const ver=Number((await row(id)).row_version);
    const ok=(await as('service','select * from public.yt_report_deletion_recheck($1,$2)',[JSON.stringify([{id,row_version:ver}]),later])).rows[0];
    assert.deepEqual([ok.eligible,ok.reason],[true,'ok'],'baseline is eligible');
    const bad=[{id},{id,row_version:null},{id,row_version:String(ver)},{id,row_version:ver+0.5},{id,row_version:-1},{id,row_version:true},
      {row_version:ver},{id:null,row_version:ver},{id:'not-a-uuid',row_version:ver},{id:42,row_version:ver},'just text',null,[id,ver]];
    const res=(await as('service','select * from public.yt_report_deletion_recheck($1,$2)',[JSON.stringify(bad),later])).rows;
    assert.equal(res.length,bad.length);
    for(const [i,r] of res.entries())assert.deepEqual([r.eligible,r.reason],[false,'invalid_item'],JSON.stringify(bad[i]));
    for(const notArray of ['{}','null','"x"'])await assert.rejects(()=>as('service',`select * from public.yt_report_deletion_recheck('${notArray}'::jsonb)`),/must be a JSON array/);
  });
  await t.test('safe stop (rollback): operations stop, protections stay (5-column reports work, management columns cannot be set), data kept',async()=>{
    const snap=async()=>(await su('select id,row_version,closed_at,retention_until,retention_hold,legacy_review_required from public.reports order by id')).rows;
    const before=await snap();
    await suExec(ROLLBACK);
    assert.deepEqual(await snap(),before,'data unchanged');
    assert.equal((await su(`select count(*)::int n from pg_proc where proname like 'yt_report_%'`)).rows[0].n,0,'operations stopped');
    assert.deepEqual((await su(`select privilege_type from information_schema.role_table_grants where table_schema='public' and table_name='reports' and grantee in ('anon','authenticated')`)).rows,[],'no table-wide grant');
    await su(`insert into public.posts(id,user_id,body) values ('22222222-2222-2222-2222-222222222222','${B}','another post')`);
    await as(B,`insert into public.reports(reporter_user_id,target_type,target_id,reason,note) values (auth.uid(),'post','22222222-2222-2222-2222-222222222222','spam','n')`);
    const r=(await su(`select * from public.reports where target_id='22222222-2222-2222-2222-222222222222'`)).rows[0];
    assert.deepEqual([r.closed_at,r.retention_hold,Number(r.row_version)],[null,false,0],'defaults still applied');
    assert.ok(r.review_due_at&&Math.abs(r.review_due_at-(r.created_at.getTime()+14*DAY))<1000,'insert trigger still sets the review date from receipt');
    for(const sql of [
      `insert into public.reports(reporter_user_id,target_type,target_id,reason,closed_at) values (auth.uid(),'post','${P}','spam',now())`,
      `insert into public.reports(reporter_user_id,target_type,target_id,reason,retention_until,retention_hold) values (auth.uid(),'post','${P}','spam',now(),false)`,
      `insert into public.reports(reporter_user_id,target_type,target_id,reason,row_version) values (auth.uid(),'post','${P}','spam',99)`,
      `update public.reports set retention_hold=true`]) await assert.rejects(()=>as(B,sql),refused,sql);
    // row_version keeps counting while stopped (history not broken), and cannot be reset.
    const v0=Number(r.row_version);await su(`update public.reports set note='edited while stopped' where id='${r.id}'`);
    await su(`update public.reports set row_version=0 where id='${r.id}'`);
    assert.equal(Number((await row(r.id)).row_version),v0+1);
  });
  await t.test('re-applying after the safe stop restores the operations without re-migrating or resetting versions',async()=>{
    const snap=async()=>(await su('select id,row_version,review_due_at,migration_review_due_at,legacy_review_required,closed_at from public.reports order by id')).rows;
    const before=await snap();
    await suExec(PREPARE);
    assert.deepEqual(await snap(),before,'no migration, versions continue');
    assert.ok((await as('service','select * from public.yt_report_review_list()')).rows.length>0,'operations back');
    await assert.rejects(()=>as(B,`insert into public.reports(reporter_user_id,target_type,target_id,reason,closed_at) values (auth.uid(),'post','${P}','spam',now())`),refused);
  });
  await t.test('the safe stop refuses to run if the protections were removed by hand (it must not open the table)',async()=>{
    await su(`drop trigger yt_reports_before_insert on public.reports`);
    await assert.rejects(()=>suExec(ROLLBACK),/protections \(triggers\) are missing/);
    await db.exec('rollback');
    assert.ok((await su(`select count(*)::int n from pg_proc where proname like 'yt_report_%'`)).rows[0].n>0,'refused stop changed nothing');
    await suExec(PREPARE);   // restore the trigger
    await su(`grant insert on public.reports to authenticated`);
    await assert.rejects(()=>suExec(ROLLBACK),/table-wide grant/);
    await db.exec('rollback');
  });
});
