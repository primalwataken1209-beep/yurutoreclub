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
const ANON='fake-anon-key';

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
    // Sweep v2: same rules as supabase/manual/deletion_u1_sweep_v2.sql (checked there against PGlite).
    if(name==='yt_deletion_sweep_begin'){
      if(fail.sweepBegin)return {data:null,error:{message:'begin failed'}};
      if(!j)return {data:{refused:'not_found'},error:null};
      if(!j.authDeleted||!['AWAITING_ASSURANCE','NEEDS_OPERATOR'].includes(j.state))return {data:{refused:'not_past_auth'},error:null};
      if(authUserExists)return {data:{refused:'auth_exists'},error:null};
      if(opts.noRefusal)return {data:{refused:'no_refusal'},error:null};
      if(j.lease_owner&&j.lease_expires_at>now())return {data:{refused:'busy'},error:null};
      j.generation++;j.lease_owner=a.p_owner;j.lease_expires_at=now()+a.p_lease_seconds*1000;
      return {data:{user_id:j.user_id,generation:j.generation},error:null};}
    if(name==='yt_deletion_sweep_alive'){
      if(fail.alive)return {data:null,error:{message:'x'}};
      if(hooks.onAlive)hooks.onAlive();
      return {data:!!j&&j.generation===a.p_generation&&j.lease_owner===a.p_owner&&j.lease_expires_at>now()+a.p_min_lease_seconds*1000,error:null};}
    if(name==='yt_deletion_sweep_finish'){
      if(fail.sweepFinish==='error')return {data:null,error:{message:'finish failed'}};
      if(fail.sweepFinish==='false')return {data:false,error:null};
      const CLASSES=[null,'list_failed','limit_exceeded','unexpected_layout','time_budget','lease_lost','remove_failed','verify_failed','unexpected'];
      if(!CLASSES.includes(a.p_error_class??null))return {data:null,error:{message:'unknown error class'}};
      if((a.p_error_class??null)===null&&(a.p_remaining==null||a.p_planned==null))return {data:null,error:{message:'completed sweep needs counts'}};
      if(!(j&&j.generation===a.p_generation&&j.lease_owner===a.p_owner))return {data:false,error:null};
      if(typeof a.p_release_lease!=='boolean')return {data:null,error:{message:'p_release_lease is required'}};
      j.sweeps=(j.sweeps||[]);j.sweeps.push([a.p_planned??null,a.p_removed,a.p_remaining??null,a.p_error_class??null]);
      if(a.p_release_lease){j.lease_owner=null;j.lease_expires_at=0;}return {data:true,error:null};}
    if(name==='yt_deletion_drain_mark'){if(fail.drainMark)return {data:null,error:{message:'x'}};if(!j)return {data:null,error:{message:'job not found'}};if(j.drain==null)j.drain=1;return {data:j.drain,error:null};}
    if(name==='yt_deletion_drained'){if(fail.drainCheck)return {data:null,error:{message:'x'}};return {data:!!j&&j.drain!=null&&!opts.notDrained,error:null};}
    if(name==='yt_deletion_evidence'){if(fail.evidence===a.p_kind)return {data:null,error:{message:'x'}};j.evidence=j.evidence||{};if(!j.evidence[a.p_kind])j.evidence[a.p_kind]=calls.length;return {data:true,error:null};}
    if(name==='yt_deletion_advance'){
      const ok=!!j&&j.generation===a.p_generation&&j.lease_owner===a.p_owner&&j.lease_expires_at>now()+a.p_min_lease_seconds*1000&&a.p_from.includes(j.state);
      if(!ok)return {data:false,error:null};
      j.state=a.p_to;j.log.push({to:a.p_to,...a.p_note});
      if(a.p_auth_deleted){j.hold_until=now()+(j.ttl+300)*1000;j.authDeleted=true;}
      if(['AWAITING_ASSURANCE','NEEDS_RETRY','NEEDS_OPERATOR'].includes(a.p_to)){j.lease_owner=null;j.lease_expires_at=0;}
      return {data:true,error:null};}
    throw new Error('unknown rpc '+name);
  };
  const client={
    rpc,
    auth:{
      // Like Auth: only a user's access token resolves to a user (a service_role token has no user → error).
      getUser:async t=>{calls.push(['getUser']);return fail.getUser||!authUserExists||!String(t).startsWith('user-')?{data:{user:null},error:{message:'invalid'}}:{data:{user:{id:uid}},error:null};},
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
      // Like Storage: the direct children of a prefix; a deeper path shows as a folder entry (id null), files have an id.
      async list(prefix,{limit,offset}){assert.ok(prefix===uid||prefix.startsWith(uid+'/'));calls.push(['list',bucket,offset,prefix]);
        if(hooks.onList)hooks.onList(bucket,prefix);
        if(fail.list&&fail.list[bucket])return {data:null,error:fail.list[bucket]};
        if(fail.nullList&&fail.nullList===bucket)return {data:null,error:null};
        if(fail.badName&&fail.badName===bucket)return {data:[{name:'../other/file.png',id:'obj'}],error:null};
        const entries=new Map();
        for(const n of store[bucket]){if(!n.startsWith(prefix+'/'))continue;const rest=n.slice(prefix.length+1);const i=rest.indexOf('/');
          if(i<0)entries.set(rest,{name:rest,id:'obj'});else entries.set(rest.slice(0,i),{name:rest.slice(0,i),id:null});}
        const list=[...entries.values()].sort((x,y)=>x.name<y.name?-1:x.name>y.name?1:0);
        if(list.length===0&&hooks.onEmptyList)hooks.onEmptyList(bucket,store);   // e.g. an object that lands right after an empty listing
        return {data:list.slice(offset,offset+limit),error:null};},
      async remove(paths){calls.push(['remove',bucket,paths.length]);
        if(hooks.onRemove)await hooks.onRemove(bucket,paths,store,job());
        if(fail.remove&&fail.remove[bucket])return {error:fail.remove[bucket]};
        for(const p of paths)store[bucket].delete(p);return {error:null};}
    };}},
    from(table){return {delete(){return {eq:async(col,id)=>{calls.push(['db',table,col,id]);if(hooks.onDbDelete)hooks.onDbDelete(table,store,job());return {error:null};}};}};}
  };
  const env={SUPABASE_URL:'http://offline.invalid',SERVICE_ROLE_KEY:KEY,SUPABASE_ANON_KEY:ANON,YT_ACCESS_TOKEN_TTL_SECONDS:'3600',YT_DELETION_LEASE_SECONDS:'460',YT_FUNCTION_MAX_SECONDS:'400',...(opts.env||{})};
  vm.runInNewContext(code,{Request,Response,console:{log(){},warn(){},error(){}},crypto,
    // The anon-key client is only used to ask PostgREST whether the caller's own token is service_role (operator check).
    // Here a token is "verified service_role" only if it is listed in opts.serviceTokens (the gateway/PostgREST would verify the signature).
    createClient:(url,key,o)=>{assert.equal(url,'http://offline.invalid');
      if(key===ANON){const authz=o&&o.global&&o.global.headers&&o.global.headers.Authorization;calls.push(['operatorCheck']);
        return {rpc:async name=>{assert.equal(name,'yt_deletion_operator_check');
          if(fail.operatorCheck==='falseData')return {data:false,error:null};
          if(fail.operatorCheck==='throw')throw new Error('network');
          if(fail.operatorCheck)return {data:null,error:{message:'network'}};
          return (opts.serviceTokens||[]).map(t=>'Bearer '+t).includes(authz)?{data:true,error:null}:{data:null,error:{code:'42501',message:'permission denied for function yt_deletion_operator_check'}};}};}
      assert.equal(key,KEY);return client;},
    Deno:{env:{get:k=>env[k]},serve:fn=>handler=fn}},{timeout:5000});
  const run=async({auth='Bearer user-token',body={user_id:'victim'}}={})=>{
    const r=await handler(new Request('http://offline.invalid/delete',{method:'POST',headers:auth?{Authorization:auth}:{},body:JSON.stringify(body)}));
    return {status:r.status,body:await r.json()};
  };
  return {calls,store,jobs,job,run,setAuthGone:()=>{authUserExists=false;},setAuthExists:()=>{authUserExists=true;}};
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
test('a stale worker whose Auth deletion is already in flight when it loses the lease: it stops; the next worker finishes (Auth gone = 404) and sets the hold',async()=>{
  // The old worker passed its last lease check and is inside deleteUser when its lease is lost (paused longer than the lease).
  // Its external request still completes. The DB cannot stop that request; the design relies on: Storage was empty before
  // (Auth refuses an owner), the old worker cannot advance the job any more, and a later worker treats "user not found" as deleted.
  let once=true;
  const s=setup({hooks:{beforeDeleteUser:(store,j)=>{if(!once)return;once=false;j.generation++;j.lease_owner='lost';j.lease_expires_at=0;}}});
  const r1=await s.run();
  assert.deepEqual([r1.body.accepted,r1.body.status],[true,'in_progress'],'old worker is fenced after its in-flight call');
  assert.equal(s.job().state,'AUTH_DELETING');assert.equal(s.job().authDeleted,undefined,'no hold from the fenced worker');
  const r2=await s.run({auth:'Bearer '+KEY,body:{job_id:s.job().id}});
  assert.deepEqual([r2.body.accepted,r2.body.status],[true,'awaiting_assurance']);
  assert.equal(s.job().authDeleted,true,'the finishing worker sets the hold');
  assert.equal(s.calls.filter(c=>c[0]==='auth').length,2,'second deleteUser saw the user already gone');
});
test('a worker that loses its lease during the last Storage check before Auth deletion does not call deleteUser',async()=>{
  let s,stolen=false;
  s=setup({hooks:{onEmptyList:()=>{const j=s.job();if(j.state==='AUTH_DELETING'&&!stolen){stolen=true;j.generation++;j.lease_owner='new-worker';}}}});
  const r=await s.run();
  assert.equal(stolen,true);
  assert.deepEqual([r.body.accepted,r.body.status],[true,'in_progress']);
  assert.equal(s.calls.some(c=>c[0]==='auth'),false,'the lease is re-checked right before deleteUser');
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
// ── Sweep v2 (operator, after the Auth deletion) ──
const SW=(id,extra={})=>({auth:'Bearer '+KEY,body:{job_id:id,sweep:true,max_objects:50,...extra}});
async function deletedJob(opts={}){const s=setup(opts);await s.run();assert.equal(s.job().state,'AWAITING_ASSURANCE');return s;}
const noRaw=(s,r,...words)=>{const all=JSON.stringify(r.body)+JSON.stringify(s.job().sweeps||[]);for(const w of words)assert.equal(all.includes(w),false,'raw error text leaked: '+w);};
test('sweep v2: removes a late object under the planned limit, records counts, releases the lease; touches nothing else',async()=>{
  const s=await deletedJob({objects:{avatars:[`${uid}/a.jpg`]}});
  s.store['post-images'].add(`${uid}/late.jpg`);
  const before=s.calls.length;
  const r=await s.run(SW(s.job().id));
  assert.deepEqual([r.status,r.body.accepted,r.body.status,r.body.step,r.body.planned,r.body.removed,r.body.remaining,r.body.error_class,r.body.recorded],
    [200,true,'awaiting_assurance','sweep',1,1,0,null,true]);
  assert.equal(s.store['post-images'].size,0);
  const after=s.calls.slice(before);
  assert.equal(after.some(c=>['auth','db','getUser','signOut'].includes(c[0])),false,'Storage only');
  assert.ok(after.some(c=>c[1]==='yt_deletion_sweep_begin'),'takes the lease');
  assert.deepEqual(s.job().sweeps,[[1,1,0,null]]);
  assert.equal(s.job().lease_owner,null,'lease released');assert.equal(s.job().state,'AWAITING_ASSURANCE','state unchanged');
  const again=await s.run(SW(s.job().id));
  assert.deepEqual([again.body.status,again.body.planned,again.body.removed,again.body.remaining],['awaiting_assurance',0,0,0],'an empty sweep is only recorded');
});
test('sweep v2: max_objects is required, an integer from 1 to 200; anything else is refused before the lease is taken',async()=>{
  const s=await deletedJob();
  for(const m of [undefined,0,201,1.5,'5',null,-1]){
    const r=await s.run({auth:'Bearer '+KEY,body:{job_id:s.job().id,sweep:true,max_objects:m}});
    assert.deepEqual([r.status,r.body.step,r.body.error_class],[400,'sweep_input','invalid_input'],String(m));
  }
  assert.equal(s.calls.some(c=>c[1]==='yt_deletion_sweep_begin'),false);
});
test('sweep v2: more files than max_objects → nothing is removed, the stop is recorded with remaining unknown',async()=>{
  const s=await deletedJob();
  for(const f of files(3,'late'))s.store.avatars.add(f);
  const r=await s.run(SW(s.job().id,{max_objects:2}));
  assert.deepEqual([r.body.status,r.body.error_class,r.body.planned,r.body.removed,r.body.remaining,r.body.recorded],['needs_operator','limit_exceeded',null,0,null,true]);
  assert.equal(s.store.avatars.size,3);assert.equal(s.calls.some(c=>c[0]==='remove'),false,'0 deletions');
  assert.deepEqual(s.job().sweeps,[[null,0,null,'limit_exceeded']]);
  // The limit counts both buckets together.
  s.store['post-images'].add(`${uid}/p.jpg`);
  const r2=await s.run(SW(s.job().id,{max_objects:3}));
  assert.deepEqual([r2.body.error_class,r2.body.removed],['limit_exceeded',0]);
  const r3=await s.run(SW(s.job().id,{max_objects:4}));
  assert.deepEqual([r3.body.status,r3.body.planned,r3.body.removed,r3.body.remaining],['awaiting_assurance',4,4,0]);
});
test('sweep v2: every page is listed and removed in batches of 100 (150 files)',async()=>{
  const s=await deletedJob();
  for(const f of files(150,'late'))s.store['post-images'].add(f);
  const r=await s.run(SW(s.job().id,{max_objects:200}));
  assert.deepEqual([r.body.status,r.body.planned,r.body.removed,r.body.remaining],['awaiting_assurance',150,150,0]);
  assert.deepEqual(s.calls.filter(c=>c[0]==='remove').map(c=>c[2]),[100,50]);
});
test('sweep v2: nested folders are found at every level; without allow_nested nothing is removed, with it everything is',async()=>{
  const s=await deletedJob();
  s.store.avatars.add(`${uid}/top.jpg`);s.store.avatars.add(`${uid}/x/deep.jpg`);s.store.avatars.add(`${uid}/x/y/deeper.jpg`);
  const r=await s.run(SW(s.job().id));
  assert.deepEqual([r.body.status,r.body.error_class,r.body.planned,r.body.removed,r.body.nested_folders],['needs_operator','unexpected_layout',3,0,2]);
  assert.equal(s.store.avatars.size,3);
  const r2=await s.run(SW(s.job().id,{allow_nested:true}));
  assert.deepEqual([r2.body.status,r2.body.planned,r2.body.removed,r2.body.remaining,r2.body.nested_folders],['awaiting_assurance',3,3,0,2]);
  assert.equal(s.store.avatars.size,0);
  assert.ok(s.calls.some(c=>c[0]==='list'&&c[3]===`${uid}/x/y`),'walked two levels down');
});
test('sweep v2: too deep a folder tree stops with 0 deletions',async()=>{
  const s=await deletedJob();
  s.store.avatars.add(`${uid}/a/b/c/d/e/f/too-deep.jpg`);s.store.avatars.add(`${uid}/ok.jpg`);
  const r=await s.run(SW(s.job().id,{allow_nested:true}));
  assert.deepEqual([r.body.error_class,r.body.removed],['unexpected_layout',0]);assert.equal(s.store.avatars.size,2);
});
test('sweep v2: refused while another worker holds the lease; and while a sweep holds it, the normal continuation does nothing',async()=>{
  const s=await deletedJob();
  s.store.avatars.add(`${uid}/late.jpg`);
  s.job().lease_owner='worker';s.job().lease_expires_at=Date.now()+60000;
  const r=await s.run(SW(s.job().id));
  assert.deepEqual([r.status,r.body.refused],[409,'busy']);assert.equal(s.store.avatars.size,1);
  // A job left in NEEDS_OPERATOR after the Auth deletion (the normal continuation could run on it).
  let during;
  const u=setup({hooks:{afterDeleteUser:st=>st.avatars.add(`${uid}/after-auth.jpg`),
    onRemove:async()=>{if(u.job().lease_owner&&u.job().lease_owner.startsWith('sweep-')&&during===undefined)during=await u.run({auth:'Bearer '+KEY,body:{job_id:u.job().id}});}}});
  await u.run();assert.equal(u.job().state,'NEEDS_OPERATOR');
  const rs=await u.run(SW(u.job().id));
  assert.equal(during&&during.body.status,'in_progress','the continuation could not take the lease during the sweep');
  assert.deepEqual([rs.body.status,rs.body.removed],['awaiting_assurance',1]);
  assert.equal(u.job().state,'NEEDS_OPERATOR','the sweep does not change the state');
});
test('sweep v2: refused when the job is not past the Auth deletion, when the Auth user exists again, or when R is missing',async()=>{
  const s=setup({fail:{deleteUser:{message:'temporary'}}});await s.run();
  const r=await s.run(SW(s.job().id));assert.deepEqual([r.status,r.body.refused],[409,'not_past_auth']);
  const a=await deletedJob();a.store.avatars.add(`${uid}/late.jpg`);a.setAuthExists();
  const ra=await a.run(SW(a.job().id));assert.deepEqual([ra.status,ra.body.refused],[409,'auth_exists']);assert.equal(a.store.avatars.size,1);
  const n=await deletedJob({noRefusal:true});
  const rn=await n.run(SW(n.job().id));assert.deepEqual([rn.status,rn.body.refused],[409,'no_refusal']);
  const rb=await (async()=>{const x=setup({fail:{sweepBegin:true}});await x.run();x.store.avatars.add(`${uid}/late.jpg`);return [await x.run(SW(x.job().id)),x];})();
  assert.deepEqual([rb[0].status,rb[0].body.step,rb[0].body.error_class],[503,'sweep_begin','begin_failed']);assert.equal(rb[1].store.avatars.size,1);
  // A user token with the sweep flag: the normal acceptance path; the flag is ignored.
  const u=setup({objects:{avatars:[`${uid}/a.jpg`]}});
  const ru=await u.run({body:{sweep:true,max_objects:5}});
  assert.equal(ru.body.status,'awaiting_assurance');assert.equal(u.job().sweeps,undefined);
});
test('sweep v2: a failed listing → list_failed, nothing removed, remaining unknown; the raw error text is not stored or returned',async()=>{
  const opts={fail:{}};const s=await deletedJob(opts);
  s.store.avatars.add(`${uid}/late.jpg`);
  opts.fail.list={'post-images':{message:'secret-detail-from-storage'}};
  const r=await s.run(SW(s.job().id));
  assert.deepEqual([r.body.status,r.body.error_class,r.body.removed,r.body.remaining,r.body.recorded],['needs_operator','list_failed',0,null,true]);
  assert.equal(s.store.avatars.size,1,'nothing removed when planning failed');
  noRaw(s,r,'secret-detail-from-storage');
});
test('sweep v2: a failed removal → remove_failed with the removed count of earlier batches; raw text not kept',async()=>{
  const opts={fail:{}};const s=await deletedJob(opts);
  for(const f of files(120,'a'))s.store.avatars.add(f);s.store['post-images'].add(`${uid}/p.jpg`);
  opts.fail.remove={'post-images':{message:'secret-remove-detail'}};
  const r=await s.run(SW(s.job().id,{max_objects:200}));
  assert.deepEqual([r.body.status,r.body.error_class,r.body.planned,r.body.removed,r.body.remaining],['needs_operator','remove_failed',121,120,null]);
  noRaw(s,r,'secret-remove-detail');
});
test('sweep v2: the time budget stops the sweep before the next outside request',async()=>{
  let n=0;
  const s=await deletedJob({env:{YT_FUNCTION_MAX_SECONDS:'60'},hooks:{onList:()=>{const t=Date.now();while(Date.now()-t<3);n++;}}});   // budget 0 s
  s.store.avatars.add(`${uid}/late.jpg`);
  const r=await s.run(SW(s.job().id));
  assert.deepEqual([r.body.error_class,r.body.removed,r.body.recorded],['time_budget',0,true]);
  assert.equal(s.store.avatars.size,1);
});
test('sweep v2: a lease lost in the middle stops further removals; the fenced sweep cannot record (recorded false)',async()=>{
  const s=await deletedJob({hooks:{onRemove:async(b,p,st,j)=>{if(j.lease_owner&&j.lease_owner.startsWith('sweep-')){j.generation++;j.lease_owner='new-worker';j.lease_expires_at=Date.now()+60000;}}}});
  for(const f of files(150,'a'))s.store.avatars.add(f);
  const r=await s.run(SW(s.job().id,{max_objects:200}));
  assert.deepEqual([r.body.status,r.body.step,r.body.error_class,r.body.removed,r.body.recorded],['needs_operator','sweep_record','lease_lost',100,false]);
  assert.equal(s.calls.filter(c=>c[0]==='remove').length,1,'no second batch after the lease was lost');
  assert.equal(s.job().sweeps,undefined,'nothing recorded by the fenced sweep');
});
for(const mode of ['error','false']){
  test(`sweep v2: a recording that returns ${mode} is needs_operator (result unknown to the job log)`,async()=>{
    const opts={fail:{}};const s=await deletedJob(opts);s.store.avatars.add(`${uid}/late.jpg`);
    opts.fail.sweepFinish=mode;
    const r=await s.run(SW(s.job().id));
    assert.deepEqual([r.body.status,r.body.step,r.body.recorded,r.body.removed],['needs_operator','sweep_record',false,1]);
  });
}
test('sweep v2 (Work 11-22): a listing with no error but no data is not an empty folder → list_failed, nothing removed, remaining unknown',async()=>{
  const opts={fail:{}};const s=await deletedJob(opts);
  s.store.avatars.add(`${uid}/late.jpg`);opts.fail.nullList='post-images';
  const r=await s.run(SW(s.job().id));
  assert.deepEqual([r.body.status,r.body.error_class,r.body.removed,r.body.remaining],['needs_operator','list_failed',0,null]);
  assert.equal(s.calls.some(c=>c[0]==='remove'),false);assert.equal(s.store.avatars.size,1);
});
test('sweep v2 (Work 11-22): an unsafe listed name (../other/file.png) is never passed to remove → unexpected_layout',async()=>{
  const opts={fail:{}};const s=await deletedJob(opts);
  s.store.avatars.add(`${uid}/late.jpg`);opts.fail.badName='avatars';
  const r=await s.run(SW(s.job().id));
  assert.deepEqual([r.body.status,r.body.error_class,r.body.removed],['needs_operator','unexpected_layout',0]);
  assert.equal(s.calls.some(c=>c[0]==='remove'),false);
});
test('sweep v2 (Work 11-22): after a removal with an unknown outcome the lease is kept (not released) so nobody else starts on the job',async()=>{
  const opts={fail:{}};const s=await deletedJob(opts);
  s.store.avatars.add(`${uid}/late.jpg`);opts.fail.remove={avatars:{message:'timeout'}};
  const r=await s.run(SW(s.job().id));
  assert.deepEqual([r.body.error_class,r.body.recorded,r.body.lease_released],['remove_failed',true,false]);
  assert.ok(s.job().lease_owner&&s.job().lease_owner.startsWith('sweep-'),'lease still held');
  const again=await s.run(SW(s.job().id));
  assert.deepEqual([again.status,again.body.refused],[409,'busy'],'a second sweep waits for the lease to expire');
  // A stop before any removal releases the lease.
  const t=await deletedJob();for(const f of files(3,'x'))t.store.avatars.add(f);
  const rt=await t.run(SW(t.job().id,{max_objects:2}));
  assert.deepEqual([rt.body.error_class,rt.body.lease_released],['limit_exceeded',true]);assert.equal(t.job().lease_owner,null);
});
test('sweep v2 (Work 11-22): the time is checked again after the lease check (a slow check does not let a request through)',async()=>{
  let first=true;
  const s=await deletedJob({env:{YT_FUNCTION_MAX_SECONDS:'61'},hooks:{onAlive:()=>{if(first){first=false;const t=Date.now();while(Date.now()-t<1100);}}}});   // budget 1 s
  s.store.avatars.add(`${uid}/late.jpg`);
  const before=s.calls.filter(c=>c[0]==='list').length;
  const r=await s.run(SW(s.job().id));
  assert.equal(r.body.error_class,'time_budget');
  assert.equal(s.calls.filter(c=>c[0]==='list').length,before,'no listing after the slow check');
});
test('sweep v2: a file that lands after planning is not removed in this call (fixed targets) and shows as remaining',async()=>{
  let once=true;
  const s=await deletedJob({hooks:{onRemove:async(b,p,st)=>{if(once){once=false;st['post-images'].add(`${uid}/arrived-later.jpg`);}}}});
  s.store.avatars.add(`${uid}/late.jpg`);
  const r=await s.run(SW(s.job().id));
  assert.deepEqual([r.body.status,r.body.planned,r.body.removed,r.body.remaining],['needs_operator',1,1,1]);
  assert.equal(s.store['post-images'].size,1);
});
// ── Operator authentication (staging 2026-11-22: v5 returned 401 step auth for a service_role token from the Dashboard test) ──
const OTHER='dashboard-minted-service-role-jwt';   // a valid service_role token that is not byte-identical to the runtime key
test('operator auth repro (no secrets): a service_role token that differs from the runtime key string, with no verified check, ends in 401 auth',async()=>{
  const s=await deletedJob();s.store.avatars.add(`${uid}/late.jpg`);
  const r=await s.run({auth:'Bearer '+OTHER,body:{job_id:s.job().id,sweep:true,max_objects:1,allow_nested:true}});
  assert.deepEqual([r.status,r.body.step,r.body.error],[401,'auth','Not authenticated']);
  assert.equal(s.store.avatars.size,1);assert.equal(s.calls.some(c=>c[1]==='yt_deletion_sweep_begin'),false,'no sweep, no deletion');
  assert.equal(s.jobs.size,1,'no new job was created for the service token');
});
test('operator auth: a token that PostgREST verifies as service_role takes the operator path (the role is not read from the token by the function)',async()=>{
  const s=await deletedJob({serviceTokens:[OTHER]});
  for(const f of files(2,'late'))s.store.avatars.add(f);
  const r=await s.run({auth:'Bearer '+OTHER,body:{job_id:s.job().id,sweep:true,max_objects:1,allow_nested:true}});
  assert.deepEqual([r.status,r.body.step,r.body.error_class,r.body.removed],[200,'sweep','limit_exceeded',0]);
  assert.ok(s.calls.some(c=>c[0]==='operatorCheck'),'asked the database');
  // The exact runtime key still works without the extra check.
  const before=s.calls.filter(c=>c[0]==='operatorCheck').length;
  const r2=await s.run({auth:'Bearer '+KEY,body:{job_id:s.job().id,sweep:true,max_objects:2}});
  assert.equal(r2.body.removed,2);assert.equal(s.calls.filter(c=>c[0]==='operatorCheck').length,before);
});
test('operator auth: a user token, an unknown token, a check error, or a missing anon key never becomes the operator (fails closed to the user path)',async()=>{
  const u=setup({objects:{avatars:[`${uid}/a.jpg`]},serviceTokens:[OTHER]});
  const ru=await u.run({body:{job_id:'00000000-0000-4000-8000-000000000000',sweep:true,max_objects:1}});   // user token: normal acceptance
  assert.equal(ru.body.status,'awaiting_assurance');assert.equal(u.job().sweeps,undefined);
  const s=await deletedJob({serviceTokens:[OTHER],fail:{operatorCheck:true}});
  const r=await s.run({auth:'Bearer '+OTHER,body:{job_id:s.job().id,sweep:true,max_objects:1}});
  assert.deepEqual([r.status,r.body.step],[401,'auth'],'check error: not operator');
  for(const mode of ['falseData','throw']){
    const m=await deletedJob({serviceTokens:[OTHER],fail:{operatorCheck:mode}});
    const rm=await m.run({auth:'Bearer '+OTHER,body:{job_id:m.job().id,sweep:true,max_objects:1}});
    assert.deepEqual([rm.status,rm.body.step],[401,'auth'],mode+': not operator');
  }
  const n=await deletedJob({env:{SUPABASE_ANON_KEY:''},serviceTokens:[OTHER]});
  const rn=await n.run({auth:'Bearer '+OTHER,body:{job_id:n.job().id,sweep:true,max_objects:1}});
  assert.deepEqual([rn.status,rn.body.step],[401,'auth'],'no anon key: no check, not operator');
  const x=await deletedJob({serviceTokens:[OTHER]});
  const rx=await x.run({auth:'Bearer some-other-token',body:{job_id:x.job().id,sweep:true,max_objects:1}});
  assert.deepEqual([rx.status,rx.body.step],[401,'auth']);
});
test('a failed session sign-out is recorded but does not stop the deletion (the job refuses writes either way)',async()=>{
  const s=setup({fail:{signOut:true}});
  assert.equal((await s.run()).body.status,'awaiting_assurance');assert.equal(s.job().log[0].sessions,'failed');
});
