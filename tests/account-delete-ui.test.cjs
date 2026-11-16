// Account deletion screen (U1): an accepted-but-unconfirmed deletion is never shown as a failure or as "deleted";
// needs_retry is a failure the user can retry. Real app, in-memory Supabase stand-in, no network.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
const {source,compile}=require('./helpers.cjs');
const compiled=compile(source);
const ME='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const settle=(ms=250)=>new Promise(r=>setTimeout(r,ms));

async function setup(t,{lang='ja',answer}){
  const dom=new JSDOM(fs.readFileSync('index.html','utf8'),{url:'http://offline.invalid/',runScripts:'outside-only',pretendToBeVisual:true});t.after(()=>dom.window.close());
  const w=dom.window,calls=[],errors=[];
  w.localStorage.setItem('yurutore_language',lang);
  w.fetch=()=>{throw Error('No network');};w.XMLHttpRequest=function(){throw Error('No network');};w.WebSocket=function(){throw Error('No network');};
  w.matchMedia=()=>({matches:false,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){}});
  w.URL.createObjectURL=()=>'blob:x';w.URL.revokeObjectURL=()=>{};
  w.addEventListener('error',e=>errors.push(e.message));
  const q=v=>{const p=new Proxy({},{get:(_,k)=>k==='then'?(ok,ng)=>Promise.resolve(v).then(ok,ng):()=>p});return p;};
  let session={user:{id:ME,email:'synthetic@example.invalid',user_metadata:{}}};
  const row={nickname:'ゆるパンダ',avatar_url:null,is_public:true};
  let invokeImpl=async()=>answer;
  const profiles={upsert:()=>Promise.resolve({data:null,error:null}),
    select:()=>({eq:()=>({maybeSingle:()=>Promise.resolve({data:row,error:null})})})};
  w.supabase={createClient:()=>({from:tb=>tb==='profiles'?profiles:q({data:[],error:null,count:0}),
    storage:{from:()=>({download:async()=>({data:null,error:{message:'none'}})})},rpc:()=>q({data:null,error:null}),
    functions:{invoke:async(name)=>{calls.push(['invoke',name]);return invokeImpl(name);}},
    auth:{getSession:async()=>({data:{session}}),getUser:async()=>({data:{user:session&&session.user}}),
      onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),signOut:async()=>{calls.push(['signOut']);session=null;return {error:null};}}})};
  for(const [pkg,file] of [['react','react.production.min.js'],['react-dom','react-dom.production.min.js']])w.eval(fs.readFileSync(path.join(path.dirname(require.resolve(pkg+'/package.json')),'umd',file),'utf8'));
  w.eval(compiled);await settle(400);
  const doc=w.document;
  const button=label=>[...doc.querySelectorAll('button')].find(b=>b.textContent.replace(/\s+/g,'').includes(label.replace(/\s+/g,'')));
  const click=async(label,ms)=>{const b=button(label);assert.ok(b,'button '+label);b.click();await settle(ms);};
  const L=lang==='ja'?{prof:'プロフ',del:'アカウントを削除',go:'削除へ進む',confirm:'削除する'}:{prof:'Profile',del:'Delete account',go:'Continue to delete',confirm:'Delete account'};
  const runDeletion=async()=>{await click(L.prof,400);await click(L.del);await click(L.go);
    const buttons=[...doc.querySelectorAll('button')].filter(b=>b.textContent.trim()===L.confirm);assert.ok(buttons.length>=1);buttons.at(-1).click();await settle(500);};
  return {w,doc,calls,errors,runDeletion,setInvoke:fn=>{invokeImpl=fn;},text:()=>doc.getElementById('root').textContent};
}
const PENDING={ja:'退会の手続きを受け付けました。削除の確認には少し時間がかかります。',en:'We have received your deletion request. Confirming the deletion takes a little time.'};
const FAIL={ja:'アカウントを削除できませんでした',en:"We couldn't delete your account"};

const JOB='0f3c2b1a-1234-4abc-8def-0123456789ab';
const reply=(status,extra={})=>({data:{ok:false,accepted:true,contract:'yt-deletion-v1',job:JOB,status,...extra},error:null});
const deviceLeft=s=>{let n=0;for(let i=0;i<s.w.localStorage.length;i++)if(s.w.localStorage.key(i).endsWith('-'+ME))n++;return n;};
// needs_retry after acceptance is accepted too: the job already refuses writes and the operator continues it.
for(const status of ['awaiting_assurance','in_progress','needs_operator','needs_retry'])for(const lang of ['ja','en']){
  test(`${lang}: accepted reply "${status}" → signed out, local data cleared, pending notice, no failure text`,async t=>{
    const s=await setup(t,{lang,answer:reply(status,status==='needs_retry'?{step:'claim'}:{})});
    await s.runDeletion();
    assert.deepEqual(s.calls.map(c=>c[0]),['invoke','signOut']);
    assert.ok(s.text().includes(PENDING[lang]),'pending notice on the welcome screen');
    assert.equal(s.text().includes(FAIL[lang]),false);
    assert.equal(deviceLeft(s),0,'this user\'s device data cleared');
    assert.deepEqual(s.errors,[]);
  });
}
// Anything that does not match the accepted contract exactly: failure shown, still signed in, device data kept.
const notAccepted={
  'unknown status':reply('completed'),
  'status missing':reply(undefined),
  'contract missing':{data:{ok:false,accepted:true,job:JOB,status:'in_progress'},error:null},
  'other contract':reply('in_progress',{contract:'yt-deletion-v2'}),
  'accepted missing':{data:{ok:false,contract:'yt-deletion-v1',job:JOB,status:'in_progress'},error:null},
  'job not a uuid':reply('in_progress',{job:'j'}),
  'job missing':reply('in_progress',{job:undefined}),
  'old-style reply (status only)':{data:{ok:false,status:'awaiting_assurance',job:'j'},error:null},
  // ok:true no longer means anything on its own: only the accepted contract is trusted (Work found the old fallback, 2026-11-16).
  'ok:true with unexpected status':{data:{ok:true,status:'unexpected'},error:null},
  'ok:true with accepted:false':{data:{ok:true,accepted:false},error:null},
  'ok:true alone (old server reply)':{data:{ok:true,deleted:['auth.users(hard delete)']},error:null},
  'ok:true plus a valid-looking contract but unknown status':{data:{ok:true,accepted:true,contract:'yt-deletion-v1',job:JOB,status:'done'},error:null},
  'function error (401/500)':{data:null,error:{message:'500'}},
  'empty reply':{data:null,error:null},
};
for(const [name,answer] of Object.entries(notAccepted)){
  test(`not accepted (${name}) → failure, still signed in, device data kept`,async t=>{
    const s=await setup(t,{answer});
    const before=deviceLeft(s);assert.ok(before>0);
    await s.runDeletion();
    assert.ok(s.text().includes(FAIL.ja));assert.equal(s.calls.some(c=>c[0]==='signOut'),false);
    assert.equal(s.text().includes(PENDING.ja),false);assert.equal(deviceLeft(s),before,'device data untouched');
  });
}
test('network failure (invoke throws) → failure, device data kept',async t=>{
  const s=await setup(t,{answer:null});
  const before=deviceLeft(s);assert.ok(before>0);
  s.setInvoke(async()=>{throw new Error('Failed to fetch');});   // as a dropped connection would
  await s.runDeletion();
  assert.ok(s.text().includes(FAIL.ja));assert.equal(deviceLeft(s),before);
});
