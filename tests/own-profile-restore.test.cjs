const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
const {source,compile}=require('./helpers.cjs');
const compiled=compile(source);
const ME='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const EMAIL='private.mailname@example.invalid';
// Signed in on a device that has no profile yet. In-memory Supabase stand-in: no network, no project, no keys.
async function setup(t,{row=null,meta={},loadError=null,seed=[]}={}){
  const dom=new JSDOM(fs.readFileSync('index.html','utf8'),{url:'http://offline.invalid/',runScripts:'outside-only',pretendToBeVisual:true});t.after(()=>dom.window.close());
  const w=dom.window,upserts=[],reads=[],errors=[];w.localStorage.setItem('yurutore_language','ja');
  for(const [k,v] of seed)w.localStorage.setItem(k,v);
  w.fetch=()=>{throw Error('No network');};w.XMLHttpRequest=function(){throw Error('No network');};w.WebSocket=function(){throw Error('No network');};
  w.matchMedia=()=>({matches:false,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){}});
  w.addEventListener('error',e=>errors.push(e.message));
  const query=value=>{const q=new Proxy({},{get:(_,k)=>k==='then'?(ok,ng)=>Promise.resolve(value).then(ok,ng):()=>q});return q;};
  const profiles={upsert:r=>{upserts.push(JSON.parse(JSON.stringify(r)));return query({data:null,error:null});},
    select:cols=>{reads.push(cols);return query(loadError?{data:null,error:loadError}:{data:row,error:null});}};
  const session={user:{id:ME,email:EMAIL,user_metadata:meta}};
  w.supabase={createClient:()=>({from:table=>table==='profiles'?profiles:query({data:[],error:null,count:0}),storage:{from:()=>query({data:null,error:null})},
    rpc:()=>query({data:null,error:null}),functions:{invoke:()=>query({data:null,error:null})},
    auth:{getSession:async()=>({data:{session}}),getUser:async()=>({data:{user:session.user}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})}})};
  for(const [pkg,file] of [['react','react.production.min.js'],['react-dom','react-dom.production.min.js']])w.eval(fs.readFileSync(path.join(path.dirname(require.resolve(pkg+'/package.json')),'umd',file),'utf8'));
  w.eval(compiled);await new Promise(r=>setTimeout(r,400));
  const user=()=>{for(let i=0;i<w.localStorage.length;i++){const k=w.localStorage.key(i);if(k.startsWith('yurutore-v6-')&&k.endsWith('-'+ME))return JSON.parse(w.localStorage.getItem(k)).user;}return null;};
  const entries=()=>Array.from({length:w.localStorage.length},(_,i)=>{const k=w.localStorage.key(i);return [k,w.localStorage.getItem(k)];});
  return {w,upserts,reads,errors,user,entries,text:()=>w.document.body.textContent};
}
test('email sign-in on a new device: the server nickname and profile come back, the email is never a name',async t=>{
  const s=await setup(t,{row:{nickname:'ゆるパンダ',hitokoto:'のんびり',intro:'歩くのが好き',avatar_url:null,fav_acts:['walk'],pace:null,region:'東京都',is_public:false}});
  const u=s.user();
  assert.equal(u.name,'ゆるパンダ');assert.equal(u.bio,'のんびり');assert.equal(u.intro,'歩くのが好き');assert.equal(u.region,'東京都');assert.equal(u.isPublic,false);
  assert.equal(u.ytGuess,undefined,'restored from the server, so it may be written again');
  assert.equal(s.reads.length,1);
  assert.doesNotMatch(s.text()+JSON.stringify(u),/private\.mailname/);
  assert.deepEqual(s.errors,[]);
});
test('no server nickname: the default is ゆるトレ仲間, and SNS use does not write it over the server profile',async t=>{
  const s=await setup(t,{row:{nickname:'',hitokoto:null,intro:null,avatar_url:null,fav_acts:[],pace:null,region:null,is_public:true}});
  const u=s.user();
  assert.equal(u.name,'ゆるトレ仲間');assert.equal(u.ytGuess,true);
  assert.doesNotMatch(s.text()+JSON.stringify(u),/private\.mailname/);
  const r=await s.w.snsEnsureProfile(ME,u);
  assert.equal(r.error,null);
  const sent=s.upserts.pop();
  assert.equal('nickname' in sent,false,'guessed nickname not sent');assert.equal('avatar_url' in sent,false);
  assert.equal(sent.id,ME);
});
test('Google sign-in on a new device: when the profile cannot be read, Google defaults are kept off the server',async t=>{
  const s=await setup(t,{meta:{name:'Google Name',picture:'https://lh3.googleusercontent.com/a/test'},loadError:{message:'offline'}});
  const u=s.user();
  assert.equal(u.name,'Google Name');assert.equal(u.avatarUrl,'https://lh3.googleusercontent.com/a/test');assert.equal(u.ytGuess,true);
  await s.w.snsEnsureProfile(ME,u);
  const sent=s.upserts.pop();
  assert.equal('nickname' in sent,false);assert.equal('avatar_url' in sent,false);
  // Saving the profile screen is the user's own choice: full mode writes what they see.
  await s.w.snsEnsureProfile(ME,{...u,ytGuess:false},{full:true});
  const saved=s.upserts.pop();
  assert.equal(saved.nickname,'Google Name');assert.equal(saved.avatar_url,'https://lh3.googleusercontent.com/a/test');
});
test('a device that already has a profile does not read the server profile again',async t=>{
  const first=await setup(t,{row:{nickname:'server'}});
  assert.equal(first.reads.length,1);assert.equal(first.user().name,'server');
  // Restart on the same device storage, with a different server value: the device profile stays and nothing is read.
  const again=await setup(t,{row:{nickname:'changed elsewhere'},seed:first.entries()});
  assert.equal(again.reads.length,0);assert.equal(again.user().name,'server');
});
