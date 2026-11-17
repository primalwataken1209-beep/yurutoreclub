// delete-account (U1 draft): runs the real handler with an in-memory stand-in for Supabase (no network, no project, no keys).
// The job store below follows the same compare-and-set rules as supabase/manual/deletion_u1_prepare.sql
// (those rules themselves are checked in tests/deletion-u1-db.test.cjs).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
const ts = require('typescript');
const source = fs.readFileSync('supabase/functions/delete-account/index.ts','utf8');
const code = ts.transpileModule(source.replace(/^import .*createClient.*;\r?\n/m,''),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const uid='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const KEY='fake-service-key';

// opts: env overrides, objects {bucket:[names]}, fail: {list:{bucket:err}, remove:{bucket:err}, deleteUser:err, getUser:true, signOut:true}
// hooks: {beforeDeleteUser(), afterDeleteUser(), onDbDelete(table)} to model what happens concurrently.
function setup(opts={}){
  let handler;
  const calls=[]; const fail=opts.fail||{}; const hooks=opts.hooks||{};
  const store={avatars:new Set((opts.objects&&opts.objects.avatars)||[]),'post-images':new Set((opts.objects&&opts.objects['post-images'])||[])};
  const jobs=new Map(); let authUserExists=true;
  const job=()=>[...jobs.values()][0];
  const now=()=>Date.now();
  const rpc=async(name,a)=>{
    calls.push(['rpc',name,a.p_to||'']);
    if(name==='yt_deletion_accept'){let j=[...jobs.values()].find(x=>x.user_id===a.p_user);
      if(!j){j={id:crypto.randomUUID(),user_id:a.p_user,state:'WRITES_BLOCKED',generation:0,lease_owner:null,lease_expires_at:0,ttl:a.p_token_ttl_seconds,log:[],hold_until:null};jobs.set(j.id,j);}
      return {data:j.id,error:null};}
    const j=jobs.get(a.p_job);
    if(name==='yt_deletion_claim'){
      if(fail.claim)return {data:null,error:{message:'claim failed'}};
      if(!j||j.state==='AWAITING_ASSURANCE'||(j.lease_owner&&j.lease_expires_at>now()&&j.lease_owner!==a.p_owner))return {data:null,error:null};
      j.generation++;j.lease_owner=a.p_owner;j.lease_expires_at=now()+a.p_lease_seconds*1000;
      return {data:{generation:j.generation,state:j.state,user_id:j.user_id},error:null};}
    if(name==='yt_deletion_drain_mark'){if(fail.drainMark)return {data:null,error:{message:'x'}};if(!j)return {data:null,error:{message:'job not found'}};if(j.drain==null)j.drain=1;return {data:j.drain,error:null};}
    if(name==='yt_deletion_drained'){if(fail.drainCheck)return {data:null,error:{message:'x'}};return {data:!!j&&j.drain!=null&&!opts.notDrained,error:null};}
    if(name==='yt_deletion_evidence'){if(fail.evidence===a.p_kind)return {data:null,error:{message:'x'}};j.evidence=j.evidence||{};if(!j.evidence[a.p_kind])j.evidence[a.p_kind]=calls.length;return {data:true,error:null};}
    if(name==='yt_deletion_advance'){
      const ok=!!j&&j.generation===a.p_generation&&j.lease_owner===a.p_owner&&j.lease_expires_at>now()+a.p_min_lease_seconds*1000&&a.p_from.includes(j.state);
      if(!ok)return {data:false,error:null};
      j.state=a.p_to;j.log.push({to:a.p_to,...a.p_note});
      if(a.p_auth_deleted)j.hold_until=now()+(j.ttl+300)*1000;
      if(['AWAITING_ASSURANCE','NEEDS_RETRY','NEEDS_OPERATOR'].includes(a.p_to)){j.lease_owner=null;j.lease_expires_at=0;}
      return {data:true,error:null};}
    throw new Error('unknown rpc '+name);
  };
  const client={
    rpc,
    auth:{
      getUser:async t=>{calls.push(['getUser']);return fail.getUser||!authUserExists?{data:{user:null},error:{message:'invalid'}}:{data:{user:{id:uid}},error:null};},
      admin:{
        signOut:async(t,scope)=>{calls.push(['signOut',scope]);return {error:fail.signOut?{message:'x'}:null};},
        deleteUser:async id=>{calls.push(['auth',id]);if(hooks.beforeDeleteUser)hooks.beforeDeleteUser(store,job());
          const owns=store.avatars.size+store['post-images'].size>0;
          if(fail.deleteUser)return {error:fail.deleteUser};
          if(owns)return {error:{message:'Database error deleting user: user owns storage objects'}};
          if(!authUserExists)return {error:{message:'User not found',status:404}};
          authUserExists=false;if(hooks.afterDeleteUser)hooks.afterDeleteUser(store);return {error:null};}
      }
    },
    storage:{from(bucket){return {
      async list(prefix,{limit,offset}){assert.equal(prefix,uid);calls.push(['list',bucket,offset]);
        if(fail.list&&fail.list[bucket])return {data:null,error:fail.list[bucket]};
        const names=[...store[bucket]].filter(n=>n.startsWith(uid+'/')).map(n=>n.slice(uid.length+1)).sort();
        return {data:names.slice(offset,offset+limit).map(name=>({name,id:'obj'})),error:null};},
      async remove(paths){calls.push(['remove',bucket,paths.length]);
        if(fail.remove&&fail.remove[bucket])return {error:fail.remove[bucket]};
        for(const p of paths)store[bucket].delete(p);return {error:null};}
    };}},
    from(table){return {delete(){return {eq:async(col,id)=>{calls.push(['db',table,col,id]);if(hooks.onDbDelete)hooks.onDbDelete(table,store,job());return {error:null};}};}};}
  };
  const env={SUPABASE_URL:'http://offline.invalid',SERVICE_ROLE_KEY:KEY,YT_ACCESS_TOKEN_TTL_SECONDS:'3600',YT_DELETION_LEASE_SECONDS:'460',YT_FUNCTION_MAX_SECONDS:'400',...(opts.env||{})};
  vm.runInNewContext(code,{Request,Response,console:{log(){},warn(){},error(){}},crypto,
    createClient:(url,key)=>{assert.equal(url,'http://offline.invalid');assert.equal(key,KEY);return client;},
    Deno:{env:{get:k=>env[k]},serve:fn=>handler=fn}},{timeout:5000});
  const run=async({auth='Bearer user-token',body={user_id:'victim'}}={})=>{
    const r=await handler(new Request('http://offline.invalid/delete',{method:'POST',headers:auth?{Authorization:auth}:{},body:JSON.stringify(body)}));
    return {status:r.status,body:await r.json()};
  };
  return {calls,store,jobs,job,run,setAuthGone:()=>{authUserExists=false;}};
}
const files=(n,prefix='p')=>Array.from({length:n},(_,i)=>`${uid}/${prefix}${String(i).padStart(4,'0')}.jpg`);
const kinds=s=>s.calls.filter(c=>['remove','db','auth'].includes(c[0]));

test('a full run deletes Storage, rows and Auth in that order, but answers "awaiting assurance", never ok:true',async()=>{
  const s=setup({objects:{avatars:[`${uid}/avatar.jpg`],'post-images':files(3)}});
  const r=await s.run();
  assert.equal(r.status,200);assert.deepEqual([r.body.ok,r.body.status],[false,'awaiting_assurance']);
  assert.equal(s.store.avatars.size+s.store['post-images'].size,0);
  const order=kinds(s).map(c=>c[0]);
  assert.ok(order.lastIndexOf('remove')<order.indexOf('db')&&order.lastIndexOf('db')<order.indexOf('auth'));
  assert.deepEqual(s.calls.filter(c=>c[0]==='db').map(c=>c[1]).at(-1),'profiles');
  assert.ok(s.calls.filter(c=>c[0]==='db').every(c=>c[3]===uid),'only the job\'s user');
  assert.deepEqual(s.calls.find(c=>c[0]==='signOut'),['signOut','global'],'all sessions are signed out at acceptance');
  assert.equal(s.job().state,'AWAITING_ASSURANCE');assert.ok(s.job().hold_until>Date.now()+3600*1000);
  assert.equal(s.job().log[0].sessions,'revoked');
});
test('the user id in the request body is ignored; the target is the JWT user, stored in the job',async()=>{
  const s=setup();await s.run({body:{user_id:'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'}});
  assert.equal(s.job().user_id,uid);
});
for(const bucket of ['avatars','post-images']){
  test(`${bucket}: a listing error stops before rows/Auth and records NEEDS_RETRY`,async()=>{
    const s=setup({objects:{[bucket]:[`${uid}/x.jpg`]},fail:{list:{[bucket]:{message:'Network error'}}}});
    const r=await s.run();
    assert.deepEqual([r.body.ok,r.body.status,r.body.step],[false,'needs_retry',`storage_list:${bucket}`]);
    assert.equal(kinds(s).some(c=>['db','auth'].includes(c[0])),false);assert.equal(s.job().state,'NEEDS_RETRY');
  });
}
test('a retry after a failure continues the same job and finishes',async()=>{
  const opts={objects:{avatars:[`${uid}/avatar.jpg`]},fail:{list:{avatars:{message:'Network error'}}}};
  const s=setup(opts);await s.run();
  delete opts.fail.list.avatars;
  const r=await s.run();
  assert.equal(r.body.status,'awaiting_assurance');assert.equal(s.jobs.size,1);
});
test('partial Storage removal is recorded: avatars removed, post-images failed → NEEDS_RETRY, nothing else deleted',async()=>{
  const s=setup({objects:{avatars:[`${uid}/avatar.jpg`],'post-images':files(2)},fail:{remove:{'post-images':{message:'denied'}}}});
  const r=await s.run();
  assert.deepEqual([r.body.status,r.body.step],['needs_retry','storage_remove:post-images']);
  assert.equal(s.store.avatars.size,0);assert.equal(s.store['post-images'].size,2);
  assert.equal(kinds(s).some(c=>['db','auth'].includes(c[0])),false);
  assert.ok(s.job().log.some(l=>l.step==='storage_remove:post-images'&&l.removed&&l.removed.avatars===1),'partial result kept in the job');
});
test('more than one page of images: every page is removed and the check lists to the end',async()=>{
  const s=setup({objects:{'post-images':files(250)}});
  assert.equal((await s.run()).body.status,'awaiting_assurance');
  assert.equal(s.store['post-images'].size,0);
  assert.ok(s.calls.some(c=>c[0]==='list'&&c[1]==='post-images'&&c[2]===200),'paged listing');
});
test('an image that appears during row deletion stops before Auth deletion',async()=>{
  const s=setup({hooks:{onDbDelete:(table,store)=>{if(table==='profiles')store.avatars.add(`${uid}/avatar.jpg`);}}});
  const r=await s.run();
  assert.deepEqual([r.body.status,r.body.step],['needs_retry','storage_recheck']);
  assert.equal(s.calls.some(c=>c[0]==='auth'),false);
});
test('Auth deletion refused (e.g. still owns objects) → NEEDS_RETRY, not reported as done',async()=>{
  const s=setup({fail:{deleteUser:{message:'Database error deleting user'}}});
  const r=await s.run();
  assert.deepEqual([r.body.status,r.body.step],['needs_retry','auth_delete']);
  assert.equal(s.job().hold_until,null);
});
test('an image found after Auth deletion → NEEDS_OPERATOR with the hold set (operator must clean up)',async()=>{
  const s=setup({hooks:{afterDeleteUser:store=>store['post-images'].add(`${uid}/late.jpg`)}});
  const r=await s.run();
  assert.deepEqual([r.body.status,r.body.step],['needs_operator','storage_after_auth']);
  assert.equal(s.job().state,'NEEDS_OPERATOR');assert.ok(s.job().hold_until>Date.now());
});
test('a live lease held by another worker: this call does nothing and says in progress',async()=>{
  const t=setup({objects:{avatars:[`${uid}/avatar.jpg`]}});
  // The user's job already exists and another worker holds a live lease on it.
  t.jobs.set('11111111-1111-1111-1111-111111111111',{id:'11111111-1111-1111-1111-111111111111',user_id:uid,state:'STORAGE_DELETING',generation:5,lease_owner:'other',lease_expires_at:Date.now()+60000,ttl:3600,log:[],hold_until:null});
  const r=await t.run();
  assert.deepEqual([r.body.ok,r.body.status],[false,'in_progress']);
  assert.equal(kinds(t).length,0,'no Storage/row/Auth action');
});
test('a worker that loses its lease mid-run is fenced out before Auth deletion',async()=>{
  const s=setup({hooks:{onDbDelete:(table,store,j)=>{if(table==='profiles'){j.generation++;j.lease_owner='new-worker';}}}});
  const r=await s.run();
  assert.deepEqual([r.body.ok,r.body.status],[false,'in_progress']);
  assert.equal(s.calls.some(c=>c[0]==='auth'),false,'old worker did not delete Auth');
});
test('operator continuation: service key + job_id only; no user token check, no user id input; after Auth deletion it can still finish',async()=>{
  const s=setup({fail:{deleteUser:{message:'temporary'}}});
  await s.run();
  const id=s.job().id;
  const before=s.calls.filter(c=>c[0]==='getUser').length;
  const r0=await s.run({auth:'Bearer '+KEY,body:{}});assert.equal(r0.status,400);
  const r1=await s.run({auth:'Bearer '+KEY,body:{job_id:id,user_id:'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'}});
  assert.equal(r1.body.status,'needs_retry','still failing deleteUser');
  assert.equal(s.calls.filter(c=>c[0]==='getUser').length,before,'no user token check in operator mode');
  assert.ok(s.calls.filter(c=>c[0]==='auth').every(c=>c[1]===uid),'target comes from the job');
});
test('missing token-lifetime or lease settings: refused before anything happens',async()=>{
  for(const env of [{YT_ACCESS_TOKEN_TTL_SECONDS:''},{YT_DELETION_LEASE_SECONDS:'30'},{YT_ACCESS_TOKEN_TTL_SECONDS:'abc'},
                    {YT_FUNCTION_MAX_SECONDS:''},{YT_DELETION_LEASE_SECONDS:'400'},{YT_DELETION_LEASE_SECONDS:'120'}]){
    const s=setup({env});const r=await s.run();
    assert.deepEqual([r.status,r.body.step],[500,'config']);assert.equal(s.calls.length,0);
  }
});
test('missing/invalid authentication never creates a job or deletes data',async()=>{
  const a=setup();assert.equal((await a.run({auth:null})).status,401);assert.equal(a.calls.length,0);
  const b=setup({fail:{getUser:true}});assert.equal((await b.run()).status,401);assert.equal(b.jobs.size,0);assert.equal(kinds(b).length,0);
});
const UUID=/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const isAcceptedReply=b=>b.ok===false&&b.accepted===true&&b.contract==='yt-deletion-v1'&&UUID.test(b.job)&&['in_progress','awaiting_assurance','needs_retry','needs_operator'].includes(b.status);
test('contract: every reply after acceptance is HTTP 200 with accepted/contract/job/known status; replies before acceptance are not',async()=>{
  const cases=[
    setup({objects:{avatars:[`${uid}/a.jpg`]}}),                                       // full run
    setup({fail:{list:{avatars:{message:'Network error'}}}}),                            // needs_retry
    setup({fail:{deleteUser:{message:'x'}}}),                                           // needs_retry at Auth
    setup({hooks:{afterDeleteUser:s=>s.avatars.add(`${uid}/late.jpg`)}}),               // needs_operator
    setup({fail:{claim:true}}),                                                         // claim failed after acceptance
  ];
  for(const s of cases){const r=await s.run();assert.equal(r.status,200);assert.ok(isAcceptedReply(r.body),JSON.stringify(r.body));}
  const blocked=setup();blocked.jobs.set('11111111-1111-1111-1111-111111111111',{id:'11111111-1111-1111-1111-111111111111',user_id:uid,state:'STORAGE_DELETING',generation:1,lease_owner:'other',lease_expires_at:Date.now()+60000,ttl:3600,log:[],hold_until:null});
  assert.ok(isAcceptedReply((await blocked.run()).body),'another worker: accepted, in progress');
  for(const [s,opt] of [[setup({fail:{getUser:true}}),{}],[setup({env:{YT_ACCESS_TOKEN_TTL_SECONDS:''}}),{}],[setup(),{auth:null}]]){
    const r=await s.run(opt);assert.notEqual(r.status,200);assert.equal(r.body.accepted,undefined,'no accepted flag before acceptance');
  }
});
test('a failure to take the lease right after acceptance is still "accepted" (the operator continues; no new sign-in needed)',async()=>{
  const s=setup({fail:{claim:true}});const r=await s.run();
  assert.deepEqual([r.body.status,r.body.step],['needs_retry','claim']);assert.equal(s.jobs.size,1);
  assert.deepEqual(s.calls.find(c=>c[0]==='signOut'),['signOut','global']);
});
test('drain: until earlier transactions have ended, nothing is deleted and the reply is accepted/in progress (no waiting time assumed)',async()=>{
  const s=setup({objects:{avatars:[`${uid}/a.jpg`]},notDrained:true});
  const r=await s.run();
  assert.deepEqual([r.body.accepted,r.body.status,r.body.step],[true,'in_progress','draining']);
  assert.equal(kinds(s).length,0,'no Storage/row/Auth action');assert.equal(s.store.avatars.size,1);
  assert.equal(s.calls.some(c=>c[1]==='yt_deletion_claim'),false,'does not even take the lease');
  assert.equal(s.job().evidence,undefined,'no evidence recorded');
});
test('drain mark/check failures are accepted needs_retry and delete nothing',async()=>{
  for(const fail of [{drainMark:true},{drainCheck:true}]){
    const s=setup({objects:{avatars:[`${uid}/a.jpg`]},fail});const r=await s.run();
    assert.equal(r.body.accepted,true);assert.equal(r.body.status,'needs_retry');assert.equal(kinds(s).length,0);
  }
});
test('evidence for the refusal record is written in order: drained → auth_deleted → final_empty, and only after the step itself',async()=>{
  const s=setup({objects:{avatars:[`${uid}/a.jpg`]}});await s.run();
  const e=s.job().evidence;assert.ok(e.drained<e.auth_deleted&&e.auth_deleted<e.final_empty);
  const authCall=s.calls.findIndex(c=>c[0]==='auth');assert.ok(authCall>=0&&authCall<e.auth_deleted);
  const drainedEvent=s.calls.findIndex(c=>c[1]==='yt_deletion_evidence');const firstRemove=s.calls.findIndex(c=>c[0]==='remove');
  assert.ok(drainedEvent<firstRemove,'drained evidence before any deletion');
});
test('an image found after Auth deletion: no final_empty evidence is recorded',async()=>{
  const s=setup({hooks:{afterDeleteUser:st=>st['post-images'].add(`${uid}/late.jpg`)}});await s.run();
  assert.ok(s.job().evidence.auth_deleted);assert.equal(s.job().evidence.final_empty,undefined);
});
test('a failed session sign-out is recorded but does not stop the deletion (the job refuses writes either way)',async()=>{
  const s=setup({fail:{signOut:true}});
  assert.equal((await s.run()).body.status,'awaiting_assurance');assert.equal(s.job().log[0].sessions,'failed');
});
