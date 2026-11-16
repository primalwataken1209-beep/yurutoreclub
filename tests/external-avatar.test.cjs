// External (e.g. old Google) profile-image URLs are never loaded on any screen; device photos and private Storage photos still show.
// Real app, in-memory Supabase stand-in, no network. Every <img src> the app ever sets is recorded.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
const {source,compile,functions}=require('./helpers.cjs');
const compiled=compile(source);
const ME='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const REF='avatars/'+ME+'/avatar.jpg?v=1';
const G='https://lh3.googleusercontent.com/a/fictional-old-picture';
const PICKED='data:image/jpeg;base64,/9j/AA==';
const settle=(ms=250)=>new Promise(r=>setTimeout(r,ms));
const clone=x=>x===undefined?undefined:JSON.parse(JSON.stringify(x));
const external=src=>/^https?:/i.test(src||'');

async function setup(t,{rows={},lang='ja',seed=[]}={}){
  const dom=new JSDOM(fs.readFileSync('index.html','utf8'),{url:'http://offline.invalid/',runScripts:'outside-only',pretendToBeVisual:true});t.after(()=>dom.window.close());
  const w=dom.window,calls=[],errors=[],srcs=[];let blobs=0;
  w.localStorage.setItem('yurutore_language',lang);for(const [k,v] of seed)w.localStorage.setItem(k,v);
  w.fetch=()=>{throw Error('No network');};w.XMLHttpRequest=function(){throw Error('No network');};w.WebSocket=function(){throw Error('No network');};
  w.matchMedia=()=>({matches:false,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){}});
  w.URL.createObjectURL=()=>'blob:fake-'+(++blobs);w.URL.revokeObjectURL=()=>{};
  w.addEventListener('error',e=>errors.push(e.message));
  // Record every src any <img> ever gets (set as a property or attribute, at creation or later).
  const desc=Object.getOwnPropertyDescriptor(w.HTMLImageElement.prototype,'src');
  Object.defineProperty(w.HTMLImageElement.prototype,'src',{configurable:true,get(){return desc.get.call(this);},set(v){srcs.push(String(v));desc.set.call(this,v);}});
  const setAttr=w.Element.prototype.setAttribute;
  w.Element.prototype.setAttribute=function(n,v){if(this.tagName==='IMG'&&String(n).toLowerCase()==='src')srcs.push(String(v));return setAttr.call(this,n,v);};
  const q=v=>{const p=new Proxy({},{get:(_,k)=>k==='then'?(ok,ng)=>Promise.resolve(v).then(ok,ng):()=>p});return p;};
  const kind=(r,o)=>o&&o.ignoreDuplicates?(Object.keys(r).length===1?'prep':'insertOnly'):('is_public' in r?'full':'ensure');
  const profiles={
    upsert:(r,o)=>{calls.push([kind(r,o),clone(r)]);return Promise.resolve({data:null,error:null});},
    select:()=>({eq:(_,id)=>({maybeSingle:()=>Promise.resolve({data:rows[id]===undefined?null:clone(rows[id]),error:null})})})};
  const bucket=b=>({
    upload:p=>{calls.push(['upload',b,p]);return Promise.resolve({data:{path:p},error:null});},
    remove:ps=>{calls.push(['remove',b,...ps]);return Promise.resolve({data:[],error:null});},
    download:p=>{calls.push(['download',b,p]);return Promise.resolve({data:new w.Blob(['x'],{type:'image/jpeg'}),error:null});},
    createSignedUrls:()=>Promise.resolve({data:[],error:null})});
  const session={user:{id:ME,email:'synthetic@example.invalid',user_metadata:{}}};
  w.supabase={createClient:()=>({from:tb=>tb==='profiles'?profiles:q({data:[],error:null,count:0}),
    storage:{from:bucket},rpc:()=>q({data:null,error:null}),functions:{invoke:()=>q({data:null,error:null})},
    auth:{getSession:async()=>({data:{session}}),getUser:async()=>({data:{user:session.user}}),
      onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),signOut:async()=>({error:null})}})};
  for(const [pkg,file] of [['react','react.production.min.js'],['react-dom','react-dom.production.min.js']])w.eval(fs.readFileSync(path.join(path.dirname(require.resolve(pkg+'/package.json')),'umd',file),'utf8'));
  w.eval(compiled);
  w.readAvatarFile=async()=>PICKED;   // jsdom has no canvas: a picked file becomes a fixed fictional JPEG
  await settle(400);
  const doc=w.document;
  const button=label=>[...doc.querySelectorAll('button')].find(b=>b.textContent.replace(/\s+/g,'')===label.replace(/\s+/g,''))
    ||[...doc.querySelectorAll('button')].find(b=>b.textContent.replace(/\s+/g,'').includes(label.replace(/\s+/g,'')));
  const click=async(label,ms)=>{const b=button(label);assert.ok(b,'button '+label);b.click();await settle(ms);};
  const type=(el,v)=>{Object.getOwnPropertyDescriptor(w.HTMLInputElement.prototype,'value').set.call(el,v);el.dispatchEvent(new w.Event('input',{bubbles:true}));};
  const user=()=>{for(let i=0;i<w.localStorage.length;i++){const k=w.localStorage.key(i);if(k.startsWith('yurutore-v6-')&&k.endsWith('-'+ME))return JSON.parse(w.localStorage.getItem(k)).user;}return null;};
  const entries=()=>Array.from({length:w.localStorage.length},(_,i)=>{const k=w.localStorage.key(i);return [k,w.localStorage.getItem(k)];});
  const nameInput=()=>doc.querySelector('.pf-avatar-wrap')&&doc.querySelector('input.field');
  const pickPhoto=async()=>{const input=doc.querySelector('.pf-avatar-wrap input[type=file]');Object.defineProperty(input,'files',{value:[{name:'fictional.jpg'}],configurable:true});
    input.dispatchEvent(new w.Event('change',{bubbles:true}));await settle();};
  const imgs=()=>[...doc.querySelectorAll('img')].map(i=>i.getAttribute('src'));
  const writes=()=>calls.filter(c=>['prep','full','ensure','insertOnly','upload','remove'].includes(c[0]));
  return {w,doc,calls,errors,srcs,button,click,type,user,entries,nameInput,pickPhoto,imgs,writes,
    text:()=>doc.getElementById('root').textContent,toast:()=>(doc.querySelector('.toast')||{}).textContent||''};
}
// A device left by an older version: the server row and the device copy both hold the external URL.
async function legacy(t,lang='ja'){
  const first=await setup(t,{rows:{[ME]:{nickname:'ゆるパンダ',avatar_url:G,is_public:true}}});
  assert.equal(first.user().avatarUrl,G);
  const seed=first.entries().filter(([k])=>k!=='yurutore_language').map(([k,v])=>{if(!k.startsWith('yurutore-v6-'))return [k,v];const s=JSON.parse(v);s.user={...s.user,avatar:G};return [k,JSON.stringify(s)];});
  const s=await setup(t,{rows:{[ME]:{nickname:'ゆるパンダ',avatar_url:G,is_public:true}},lang,seed});
  assert.equal(s.user().avatar,G,'old device value present');assert.equal(s.user().avatarUrl,G);
  return s;
}
const L={ja:{prof:'プロフ',edit:'編集',save:'保存',saved:/プロフィールを保存しました/},en:{prof:'Profile',edit:'Edit',save:'Save',saved:/Profile saved|saved/i}};

test('helpers: only device data:image / blob: values pass as a local picture; external URLs never do',()=>{
  const c=functions(['ytSafeLocalImg','selfAvatarLocal']);
  for(const v of [G,'http://lh3.googleusercontent.com/a/x','https://knftduojdalnawvkbelt.supabase.co/storage/v1/object/sign/x','javascript:alert(1)','data:text/html,x',REF,'',null,undefined,{}])
    assert.equal(c.ytSafeLocalImg(v),null,String(v));
  assert.equal(c.ytSafeLocalImg(PICKED),PICKED);assert.equal(c.ytSafeLocalImg('blob:fake-1'),'blob:fake-1');
  assert.equal(c.selfAvatarLocal({avatar:G,avatarUrl:G}),null);assert.equal(c.selfAvatarLocal({avatarUrl:G}),null);
  assert.equal(c.selfAvatarLocal({avatar:PICKED,avatarUrl:REF}),PICKED);assert.equal(c.selfAvatarLocal(null),null);
});
for(const lang of ['ja','en']){
  test(`${lang}: an old external picture is not loaded on the Profile tab, the editor, own posts or the own community profile`,async t=>{
    const s=await legacy(t,lang);const l=L[lang];
    await s.click(l.prof,500);
    assert.equal(s.imgs().filter(external).length,0);
    await s.click(l.edit);
    assert.equal(s.doc.querySelector('.pf-avatar'),null,'editor shows the default icon');assert.ok(s.doc.querySelector('.pf-avatar-fallback'));
    // Own post (isMine) and own community profile (isMe) use exactly this hook call; render it with the real app functions.
    const {React,ReactDOM}=s.w,box=s.doc.createElement('div');s.doc.body.appendChild(box);
    function Probe(){const a=s.w.useAvatarSrc(G,s.w.selfAvatarLocal(s.user()));return a?React.createElement('img',{src:a,id:'probe'}):React.createElement('i',{id:'probe-fallback'});}
    ReactDOM.createRoot(box).render(React.createElement(Probe));await settle(300);
    assert.equal(s.doc.getElementById('probe'),null);assert.ok(s.doc.getElementById('probe-fallback'));
    assert.deepEqual(s.srcs.filter(external),[],'no external src was ever set');
    assert.equal(s.calls.filter(c=>c[0]==='download').length,0,'an external URL is not a Storage reference');
    assert.deepEqual(s.errors,[]);
  });
}
test('legacy: a name-only edit deletes and rewrites nothing (the stored values stay as they were)',async t=>{
  const s=await legacy(t);await s.click('プロフ');await s.click('編集');
  s.type(s.nameInput(),'名前だけ変更');await s.click('保存',400);
  assert.deepEqual(s.writes().map(c=>c[0]),['prep','full'],'no Storage upload or remove');
  assert.equal(s.writes()[1][1].avatar_url,G,'the server value is passed through unchanged, not rewritten');
  assert.equal(s.user().avatar,G);assert.equal(s.user().avatarUrl,G);assert.equal(s.user().name,'名前だけ変更');
  assert.match(s.toast(),/プロフィールを保存しました/);
  assert.deepEqual(s.srcs.filter(external),[]);assert.deepEqual(s.errors,[]);
});
test('legacy: choosing a new photo replaces the old picture with a private Storage photo',async t=>{
  const s=await legacy(t);await s.click('プロフ');await s.click('編集');
  await s.pickPhoto();
  assert.equal(s.doc.querySelector('.pf-avatar').getAttribute('src'),PICKED,'the picked photo is previewed');
  await s.click('保存',400);
  assert.deepEqual(s.writes().map(c=>c[0]),['prep','upload','full']);
  assert.match(s.writes()[2][1].avatar_url,new RegExp('^avatars/'+ME+'/avatar\\.jpg\\?v=\\d+$'));
  assert.equal(s.user().avatar,PICKED);assert.match(s.user().avatarUrl,/^avatars\//);
  assert.ok(s.imgs().includes(PICKED),'the new photo is shown on the Profile tab');
  assert.deepEqual(s.srcs.filter(external),[]);
});
test('first photo: no photo yet, then a picked photo is saved and shown',async t=>{
  const s=await setup(t,{rows:{[ME]:{nickname:'はじめて',avatar_url:null,is_public:true}}});
  await s.click('プロフ');await s.click('編集');assert.equal(s.doc.querySelector('.pf-avatar'),null);
  await s.pickPhoto();await s.click('保存',400);
  assert.deepEqual(s.writes().map(c=>c[0]),['prep','upload','full']);assert.equal(s.user().avatar,PICKED);
  assert.ok(s.imgs().includes(PICKED));assert.deepEqual(s.srcs.filter(external),[]);
});
for(const lang of ['ja','en']){
  test(`${lang}: an existing private Storage photo is still shown through the private read, and a name-only edit keeps it`,async t=>{
    const s=await setup(t,{rows:{[ME]:{nickname:'ゆるパンダ',avatar_url:REF,is_public:true}},lang});const l=L[lang];
    await s.click(l.prof,500);
    assert.ok(s.imgs().some(v=>/^blob:fake-/.test(v)),'own Storage photo shown');
    assert.ok(s.calls.some(c=>c[0]==='download'&&c[2]===ME+'/avatar.jpg'));
    await s.click(l.edit);assert.match(s.doc.querySelector('.pf-avatar').getAttribute('src'),/^blob:fake-/);
    s.type(s.nameInput(),'Renamed');await s.click(l.save,400);
    assert.deepEqual(s.writes().map(c=>c[0]),['prep','full']);assert.equal(s.writes()[1][1].avatar_url,REF);
    assert.deepEqual(s.srcs.filter(external),[]);assert.deepEqual(s.errors,[]);
  });
}
