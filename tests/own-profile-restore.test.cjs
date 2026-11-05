const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
const {source,compile}=require('./helpers.cjs');
const compiled=compile(source);
const ME='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',OTHER='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const EMAIL='private.mailname@example.invalid';
const GOOGLE={name:'Real Person Name',full_name:'Real Person Name',picture:'https://lh3.googleusercontent.com/a/test',avatar_url:'https://lh3.googleusercontent.com/a/test'};
const settle=(ms=400)=>new Promise(r=>setTimeout(r,ms));
// Signed in on a device that has no profile yet. In-memory Supabase stand-in: no network, no project, no keys.
// rows: uid -> row (undefined = no row). read(uid) may return a promise to hold the answer back.
async function setup(t,{rows={},meta={},readError=null,failIds=[],read=null,seed=[],uid=ME}={}){
  const dom=new JSDOM(fs.readFileSync('index.html','utf8'),{url:'http://offline.invalid/',runScripts:'outside-only',pretendToBeVisual:true});t.after(()=>dom.window.close());
  const w=dom.window,upserts=[],reads=[],errors=[];let onAuth=null;w.localStorage.setItem('yurutore_language','ja');
  for(const [k,v] of seed)w.localStorage.setItem(k,v);
  w.fetch=()=>{throw Error('No network');};w.XMLHttpRequest=function(){throw Error('No network');};w.WebSocket=function(){throw Error('No network');};
  w.matchMedia=()=>({matches:false,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){}});
  w.addEventListener('error',e=>errors.push(e.message));
  const query=value=>{const q=new Proxy({},{get:(_,k)=>k==='then'?(ok,ng)=>Promise.resolve(value).then(ok,ng):()=>q});return q;};
  const profiles={upsert:(r,o)=>{upserts.push({row:JSON.parse(JSON.stringify(r)),options:o?JSON.parse(JSON.stringify(o)):null});return query({data:null,error:null});},
    select:()=>({eq:(_,id)=>({maybeSingle:()=>{reads.push(id);
      const answer=()=>(readError||failIds.includes(id))?{data:null,error:readError||{message:'read failed'}}:{data:rows[id]===undefined?null:rows[id],error:null};
      return read?Promise.resolve(read(id)).then(answer):Promise.resolve(answer());}})})};
  const mk=(id,m)=>({user:{id,email:EMAIL,user_metadata:m}});
  const session=mk(uid,meta);
  w.supabase={createClient:()=>({from:table=>table==='profiles'?profiles:query({data:[],error:null,count:0}),storage:{from:()=>query({data:null,error:null})},
    rpc:()=>query({data:null,error:null}),functions:{invoke:()=>query({data:null,error:null})},
    auth:{getSession:async()=>({data:{session}}),getUser:async()=>({data:{user:session.user}}),
      onAuthStateChange:cb=>{onAuth=cb;return{data:{subscription:{unsubscribe(){}}}};},signOut:async()=>({error:null})}})};
  for(const [pkg,file] of [['react','react.production.min.js'],['react-dom','react-dom.production.min.js']])w.eval(fs.readFileSync(path.join(path.dirname(require.resolve(pkg+'/package.json')),'umd',file),'utf8'));
  w.eval(compiled);await settle();
  const user=(id=uid)=>{for(let i=0;i<w.localStorage.length;i++){const k=w.localStorage.key(i);if(k.startsWith('yurutore-v6-')&&k.endsWith('-'+id))return JSON.parse(w.localStorage.getItem(k)).user;}return null;};
  const entries=()=>Array.from({length:w.localStorage.length},(_,i)=>{const k=w.localStorage.key(i);return [k,w.localStorage.getItem(k)];});
  const button=label=>[...w.document.querySelectorAll('button')].find(b=>b.textContent.replace(/\s+/g,'').includes(label));
  const switchTo=async(id,m={})=>{onAuth('SIGNED_IN',mk(id,m));await settle();};
  return {w,upserts,reads,errors,user,entries,button,switchTo,text:()=>w.document.body.textContent};
}
const noPersonal=(s,u)=>{const all=s.text()+JSON.stringify(u);assert.doesNotMatch(all,/private\.mailname/);assert.doesNotMatch(all,/Real Person Name|googleusercontent/);};

test('email sign-in on a new device: the chosen nickname and photo come back, and SNS saves keep them',async t=>{
  const s=await setup(t,{rows:{[ME]:{nickname:'ゆるパンダ',hitokoto:'のんびり',intro:'歩くのが好き',avatar_url:'https://x.supabase.co/storage/v1/object/public/avatars/'+ME+'/avatar.jpg',fav_acts:['walk'],pace:null,region:'東京都',is_public:false}}});
  const u=s.user();
  assert.equal(u.name,'ゆるパンダ');assert.equal(u.bio,'のんびり');assert.equal(u.intro,'歩くのが好き');assert.equal(u.region,'東京都');assert.equal(u.isPublic,false);
  assert.match(u.avatarUrl,/avatars\/.+\/avatar\.jpg$/);assert.equal(u.ytGuess,undefined,'read back, so ordinary saves may write again');
  noPersonal(s,u);
  await s.w.snsEnsureProfile(ME,u);
  const sent=s.upserts.pop();
  assert.equal(sent.row.nickname,'ゆるパンダ');assert.equal(sent.row.avatar_url,u.avatarUrl);assert.equal(sent.options,null);
  assert.deepEqual(s.errors,[]);
});
test('row read but no nickname (or no row): the default name is inserted only if the row is missing, never overwriting',async t=>{
  for(const row of [{nickname:'',hitokoto:null,intro:null,avatar_url:null,fav_acts:[],pace:null,region:null,is_public:true},undefined]){
    const s=await setup(t,{rows:{[ME]:row}});
    const u=s.user();
    assert.equal(u.name,'ゆるトレ仲間');assert.equal(u.ytGuess,'absent');noPersonal(s,u);
    const r=await s.w.snsEnsureProfile(ME,u);assert.equal(r.error,null);
    const sent=s.upserts.pop();
    assert.equal(sent.row.nickname,'ゆるトレ仲間');
    assert.deepEqual(sent.options,{onConflict:'id',ignoreDuplicates:true},'insert-only: a row created meanwhile is not overwritten');
  }
});
test('read error: nothing is created or overwritten, and the next start reads again',async t=>{
  const s=await setup(t,{readError:{message:'network down'}});
  const u=s.user();
  assert.equal(u.name,'ゆるトレ仲間');assert.equal(u.ytGuess,true);noPersonal(s,u);
  const r=await s.w.snsEnsureProfile(ME,u);
  assert.equal(r.error,null);assert.equal(s.upserts.length,0,'no write while the own row is unknown');
  const again=await setup(t,{rows:{[ME]:{nickname:'ゆるパンダ'}},seed:s.entries()});
  assert.equal(again.reads.length,1,'re-read on the next start');assert.equal(again.user().name,'ゆるパンダ');assert.equal(again.user().ytGuess,undefined);
});
test('Google sign-in on a new device: Google name and picture are not used as defaults on the device',async t=>{
  const s=await setup(t,{meta:GOOGLE,readError:{message:'offline'}});
  const u=s.user();
  assert.equal(u.name,'ゆるトレ仲間');assert.equal(u.avatarUrl,null);noPersonal(s,u);
  // The server row the sign-up trigger made is the user's server profile and is shown as it is.
  const g=await setup(t,{meta:GOOGLE,rows:{[ME]:{nickname:'ぱんだ',avatar_url:null}}});
  assert.equal(g.user().name,'ぱんだ');assert.equal(g.user().avatarUrl,null);
});
test('an explicit profile edit before the read returns is kept and written in full',async t=>{
  let release;const held=new Promise(r=>{release=r;});
  const s=await setup(t,{rows:{[ME]:{nickname:'server name'}},read:()=>held});
  s.button('プロフ').click();await settle(200);
  s.button('編集').click();await settle(200);
  const input=s.w.document.querySelector('input.field');
  Object.getOwnPropertyDescriptor(s.w.HTMLInputElement.prototype,'value').set.call(input,'自分で決めた名前');input.dispatchEvent(new s.w.Event('input',{bubbles:true}));
  s.button('保存').click();await settle(300);
  const full=s.upserts.find(x=>x.row.nickname==='自分で決めた名前'&&x.options===null);
  assert.ok(full,'the edit is written: '+JSON.stringify(s.upserts));
  release();await settle();
  assert.equal(s.user().name,'自分で決めた名前','a late read does not replace the edit');assert.equal(s.user().ytGuess,false);
  assert.deepEqual(s.errors,[]);
});
test('switching accounts while the first read is pending: the late answer never reaches the other account',async t=>{
  let release;const held=new Promise(r=>{release=r;});
  // B's own read fails, so B is still waiting for its profile when A's answer arrives.
  const s=await setup(t,{rows:{[ME]:{nickname:'Aさん'}},failIds:[OTHER],read:id=>id===ME?held:null});
  await s.switchTo(OTHER);
  assert.equal(s.user(OTHER).name,'ゆるトレ仲間');assert.equal(s.user(OTHER).ytGuess,true);
  release();await settle();
  assert.equal(s.user(OTHER).name,'ゆるトレ仲間');assert.doesNotMatch(JSON.stringify(s.user(OTHER)),/Aさん/);
  assert.equal(s.upserts.filter(x=>x.row.id===OTHER).length,0);
});
test('a device that already has a profile does not read the server profile again',async t=>{
  const first=await setup(t,{rows:{[ME]:{nickname:'server'}}});
  assert.equal(first.reads.length,1);assert.equal(first.user().name,'server');
  const again=await setup(t,{rows:{[ME]:{nickname:'changed elsewhere'}},seed:first.entries()});
  assert.equal(again.reads.length,0);assert.equal(again.user().name,'server');
});
