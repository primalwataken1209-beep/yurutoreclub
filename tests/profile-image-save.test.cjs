// Profile photo and profile save, run on the real app with an in-memory Supabase stand-in (no network, no project, no keys).
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
const {source,compile}=require('./helpers.cjs');
const compiled=compile(source);
const ME='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',OTHER='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const REF='avatars/'+ME+'/avatar.jpg?v=1';
const settle=(ms=250)=>new Promise(r=>setTimeout(r,ms));
const clone=x=>x===undefined?undefined:JSON.parse(JSON.stringify(x));

// rows: server profiles by id. fail: {prep, full, ensure, insertOnly, upload, remove, post} → that call returns an error.
// hold: {name: promise} → that call waits for the promise before answering.
async function setup(t,{rows={},signedIn=true,lang='ja',readError=false}={}){
  const dom=new JSDOM(fs.readFileSync('index.html','utf8'),{url:'http://offline.invalid/',runScripts:'outside-only',pretendToBeVisual:true});t.after(()=>dom.window.close());
  const w=dom.window,calls=[],errors=[],ctl={rows,fail:{},hold:{},readError};let onAuth=null,blobs=0;
  w.localStorage.setItem('yurutore_language',lang);
  w.fetch=()=>{throw Error('No network');};w.XMLHttpRequest=function(){throw Error('No network');};w.WebSocket=function(){throw Error('No network');};
  w.matchMedia=()=>({matches:false,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){}});
  w.URL.createObjectURL=()=>'blob:fake-'+(++blobs);w.URL.revokeObjectURL=()=>{};
  w.addEventListener('error',e=>errors.push(e.message));
  const q=v=>{const p=new Proxy({},{get:(_,k)=>k==='then'?(ok,ng)=>Promise.resolve(v).then(ok,ng):()=>p});return p;};
  const answer=async(name,ok)=>{if(ctl.hold[name])await ctl.hold[name];return ctl.fail[name]?{data:null,error:{message:name+' failed'}}:ok;};
  const kind=(r,o)=>o&&o.ignoreDuplicates?(Object.keys(r).length===1?'prep':'insertOnly'):('is_public' in r?'full':'ensure');
  const profiles={
    upsert:(r,o)=>{const k=kind(r,o);calls.push([k,clone(r)]);return answer(k,{data:null,error:null});},
    select:()=>({eq:(_,id)=>({maybeSingle:()=>{calls.push(['read',id]);
      return Promise.resolve(ctl.readError?{data:null,error:{message:'offline'}}:{data:ctl.rows[id]===undefined?null:clone(ctl.rows[id]),error:null});}})})};
  const bucket=b=>({
    upload:(p,blob,o)=>{calls.push(['upload',b,p]);return answer('upload',{data:{path:p},error:null});},
    remove:ps=>{calls.push(['remove',b,...ps]);return answer('remove',{data:[],error:null});},
    download:p=>{calls.push(['download',b,p]);return Promise.resolve({data:new w.Blob(['x'],{type:'image/jpeg'}),error:null});},
    createSignedUrls:()=>Promise.resolve({data:[],error:null})});
  const posts={insert:r=>{calls.push(['post',clone(r)]);return {select:()=>({single:()=>answer('post',{data:{id:'p1',...r},error:null})})};}};
  const mk=id=>({user:{id,email:'synthetic@example.invalid',user_metadata:{}}});
  const session=signedIn?mk(ME):null;
  w.supabase={createClient:()=>({from:tb=>tb==='profiles'?profiles:tb==='posts'?posts:q({data:[],error:null,count:0}),
    storage:{from:bucket},rpc:()=>q({data:null,error:null}),functions:{invoke:()=>q({data:null,error:null})},
    auth:{getSession:async()=>({data:{session:w.__session===undefined?session:w.__session}}),getUser:async()=>({data:{user:session&&session.user}}),
      onAuthStateChange:cb=>{onAuth=cb;return{data:{subscription:{unsubscribe(){}}}};},signOut:async()=>({error:null})}})};
  for(const [pkg,file] of [['react','react.production.min.js'],['react-dom','react-dom.production.min.js']])w.eval(fs.readFileSync(path.join(path.dirname(require.resolve(pkg+'/package.json')),'umd',file),'utf8'));
  w.eval(compiled);
  // The photo picker resizes through a canvas; jsdom has none, so the picked file becomes a fixed fictional JPEG.
  w.readAvatarFile=async()=>'data:image/jpeg;base64,/9j/AA==';
  await settle(400);
  const doc=w.document;
  const button=label=>[...doc.querySelectorAll('button')].find(b=>b.textContent.replace(/\s+/g,'')===label.replace(/\s+/g,''))
    ||[...doc.querySelectorAll('button')].find(b=>b.textContent.replace(/\s+/g,'').includes(label.replace(/\s+/g,'')));
  const click=async(label,ms)=>{const b=button(label);assert.ok(b,'button '+label+': '+doc.body.textContent.slice(0,160));b.click();await settle(ms);};
  const type=(el,v)=>{Object.getOwnPropertyDescriptor(w.HTMLInputElement.prototype,'value').set.call(el,v);el.dispatchEvent(new w.Event('input',{bubbles:true}));};
  const user=(id=ME)=>{for(let i=0;i<w.localStorage.length;i++){const k=w.localStorage.key(i);if(k.startsWith('yurutore-v6-')&&k.endsWith('-'+id))return JSON.parse(w.localStorage.getItem(k)).user;}return null;};
  const nameInput=()=>doc.querySelector('.pf-avatar-wrap')&&doc.querySelector('input.field');
  const pickPhoto=async()=>{const input=doc.querySelector('.pf-avatar-wrap input[type=file]');Object.defineProperty(input,'files',{value:[{name:'fictional.jpg'}],configurable:true});
    input.dispatchEvent(new w.Event('change',{bubbles:true}));await settle();};
  const openEditor=async(nav='プロフ',edit='編集')=>{await click(nav);await click(edit);};
  const writes=()=>calls.filter(c=>['prep','full','ensure','insertOnly','upload','remove','post'].includes(c[0]));
  const switchTo=async id=>{w.__session=mk(id);onAuth('SIGNED_IN',mk(id));await settle(400);};
  return {w,doc,ctl,calls,errors,button,click,type,user,nameInput,pickPhoto,openEditor,writes,switchTo,
    text:()=>doc.body.textContent,toast:()=>(doc.querySelector('.toast')||{}).textContent||''};
}
const SERVER={nickname:'ゆるパンダ',hitokoto:'のんびり',intro:'歩くのが好き',avatar_url:REF,fav_acts:['walk'],pace:null,region:'東京都',is_public:true};

test('a photo that exists only on the server is shown, and a name-only edit keeps it (no Storage write or delete)',async t=>{
  const s=await setup(t,{rows:{[ME]:SERVER}});
  assert.equal(s.user().avatar,null);assert.equal(s.user().avatarUrl,REF);
  await s.click('プロフ');
  assert.ok(s.doc.querySelector('img[alt]')&&/^blob:fake-/.test(s.doc.querySelector('.fade-up img').getAttribute('src')),'own server photo is shown through the private read');
  assert.ok(s.calls.some(c=>c[0]==='download'&&c[2]===ME+'/avatar.jpg'));
  await s.click('編集');
  assert.match(s.doc.querySelector('.pf-avatar').getAttribute('src'),/^blob:fake-/,'the editor shows it too');
  s.type(s.nameInput(),'新しい名前');await s.click('保存',400);
  assert.deepEqual(s.writes().map(c=>c[0]),['prep','full']);
  const full=s.writes()[1][1];
  assert.equal(full.avatar_url,REF);assert.equal(full.nickname,'新しい名前');assert.equal(full.intro,'歩くのが好き');assert.equal(full.is_public,true);
  assert.equal(s.user().avatarUrl,REF);assert.equal(s.user().name,'新しい名前');
  assert.match(s.toast(),/プロフィールを保存しました/);assert.deepEqual(s.errors,[]);
});
test('an explicit remove is recognised even when the device has no photo of its own',async t=>{
  const s=await setup(t,{rows:{[ME]:SERVER}});await s.openEditor();
  await s.click('画像を削除する');assert.equal(s.doc.querySelector('.pf-avatar'),null,'preview cleared');
  await s.click('保存',400);
  assert.deepEqual(s.writes().map(c=>c.slice(0,3)),[['prep',{id:ME}],['remove','avatars',ME+'/avatar.jpg'],['full',s.writes()[2][1]]]);
  assert.equal(s.writes()[2][1].avatar_url,null);assert.equal(s.user().avatarUrl,null);assert.equal(s.user().avatar,null);
});
test('a replaced photo is sent once, after the profile row is ready, and its reference is saved',async t=>{
  const s=await setup(t,{rows:{[ME]:SERVER}});await s.openEditor();
  await s.pickPhoto();await s.click('保存',400);
  assert.deepEqual(s.writes().map(c=>c[0]),['prep','upload','full']);
  assert.equal(s.writes()[1][2],ME+'/avatar.jpg');
  assert.match(s.writes()[2][1].avatar_url,new RegExp('^avatars/'+ME+'/avatar\\.jpg\\?v=\\d+$'));
  assert.equal(s.user().avatar,'data:image/jpeg;base64,/9j/AA==');
});
test('a failed upload shows no success, keeps the form and the old reference, and can be retried',async t=>{
  const s=await setup(t,{rows:{[ME]:SERVER}});await s.openEditor();
  s.ctl.fail.upload=true;
  s.type(s.nameInput(),'入力したまま');await s.pickPhoto();await s.click('保存',400);
  assert.deepEqual(s.writes().map(c=>c[0]),['prep','upload'],'no profile write after a failed upload');
  assert.match(s.text(),/画像を保存できなかったよ/);assert.equal(s.toast(),'');
  assert.equal(s.nameInput().value,'入力したまま','the form stays open with the input');
  assert.equal(s.user().avatarUrl,REF);assert.equal(s.user().name,'ゆるパンダ','the device profile is unchanged');
  s.ctl.fail.upload=false;await s.click('保存',400);
  assert.deepEqual(s.writes().map(c=>c[0]),['prep','upload','prep','upload','full']);
  assert.equal(s.user().name,'入力したまま');assert.match(s.toast(),/プロフィールを保存しました/);
});
test('when the profile row cannot be prepared, no photo is sent',async t=>{
  const s=await setup(t,{rows:{[ME]:SERVER}});await s.openEditor();
  s.ctl.fail.prep=true;await s.pickPhoto();await s.click('保存',400);
  assert.deepEqual(s.writes().map(c=>c[0]),['prep']);assert.match(s.text(),/プロフィールを保存できなかったよ/);assert.equal(s.user().avatarUrl,REF);
});
test('photo sent but profile not saved: reported as a partial result, never as saved; a retry completes it',async t=>{
  const s=await setup(t,{rows:{[ME]:SERVER}});await s.openEditor();
  s.ctl.fail.full=true;await s.pickPhoto();await s.click('保存',400);
  assert.deepEqual(s.writes().map(c=>c[0]),['prep','upload','full']);
  assert.match(s.text(),/画像は送れたけど、プロフィールを保存できなかったよ/);assert.equal(s.toast(),'');
  assert.equal(s.user().avatar,null,'the device keeps its previous profile');
  s.ctl.fail.full=false;await s.click('保存',400);assert.match(s.toast(),/プロフィールを保存しました/);
});
test('a failed photo removal stops the save; a removal followed by a failed profile save is reported as partial',async t=>{
  const a=await setup(t,{rows:{[ME]:SERVER}});await a.openEditor();
  a.ctl.fail.remove=true;await a.click('画像を削除する');await a.click('保存',400);
  assert.deepEqual(a.writes().map(c=>c[0]),['prep','remove']);assert.match(a.text(),/保存でつまずいたみたい/);assert.equal(a.user().avatarUrl,REF);
  const b=await setup(t,{rows:{[ME]:SERVER}});await b.openEditor();
  b.ctl.fail.full=true;await b.click('画像を削除する');await b.click('保存',400);
  assert.match(b.text(),/画像は削除したけど、プロフィールを保存できなかったよ/);assert.equal(b.toast(),'');
  assert.equal(b.user().avatarUrl,REF,'the device still shows the old reference: not claimed as restored, the file is gone');
});
test('an unread server profile is never overwritten with defaults; loading it again allows the save',async t=>{
  const s=await setup(t,{rows:{[ME]:SERVER},readError:true});
  assert.equal(s.user().ytGuess,true);await s.openEditor();
  s.type(s.nameInput(),'既定値の上書き');await s.click('保存',400);
  assert.deepEqual(s.writes(),[],'nothing is written');assert.match(s.text(),/サーバーのプロフィールをまだ読み込めていないよ/);
  s.ctl.readError=false;await s.click('もう一度読み込む',400);
  assert.equal(s.user().name,'ゆるパンダ');assert.equal(s.user().intro,'歩くのが好き');assert.equal(s.user().ytGuess,undefined);
  await s.click('編集');assert.equal(s.nameInput().value,'ゆるパンダ','the editor now holds the server values');
  await s.click('保存',400);assert.equal(s.writes().find(c=>c[0]==='full')[1].intro,'歩くのが好き');
});
test('a private profile stays private; English messages',async t=>{
  const s=await setup(t,{rows:{[ME]:{...SERVER,is_public:false}},lang:'en'});await s.openEditor('Profile','Edit');
  s.type(s.nameInput(),'Private one');await s.click('Save',400);
  assert.equal(s.writes().find(c=>c[0]==='full')[1].is_public,false);
  await s.click('Edit');s.ctl.fail.upload=true;await s.pickPhoto();await s.click('Save',400);
  assert.match(s.text(),/Couldn't save the photo\. Your changes are still here/);
});
test('a double tap sends the photo once',async t=>{
  const s=await setup(t,{rows:{[ME]:SERVER}});await s.openEditor();
  let release;s.ctl.hold.upload=new Promise(r=>{release=r;});
  await s.pickPhoto();const save=s.button('保存');save.click();save.click();await settle(100);s.button('保存')&&s.button('保存').click();
  release();await settle(400);
  assert.equal(s.writes().filter(c=>c[0]==='upload').length,1);assert.equal(s.writes().filter(c=>c[0]==='full').length,1);
});
test('a save finishing after an account switch does not change the other account',async t=>{
  const s=await setup(t,{rows:{[ME]:SERVER,[OTHER]:{...SERVER,nickname:'Bさん',avatar_url:null}}});await s.openEditor();
  let release;s.ctl.hold.full=new Promise(r=>{release=r;});
  s.type(s.nameInput(),'Aの新しい名前');s.button('保存').click();await settle(100);
  await s.switchTo(OTHER);release();await settle(400);
  assert.equal(s.user(OTHER).name,'Bさん');assert.doesNotMatch(JSON.stringify(s.user(OTHER)),/Aの新しい名前/);
});
test('trial (guest): the photo and profile stay on the device; nothing is sent',async t=>{
  const s=await setup(t,{signedIn:false});
  for(const l of ['まずは体験してみる','まずは体験してみる','🚶 ウォーキング','週1〜2回','次へ進む'])await s.click(l,150);
  s.type(s.doc.querySelector('input[placeholder="例：ゆるパンダ"]'),'体験の人');await s.click('はじめる',300);
  await s.openEditor();await s.pickPhoto();s.type(s.nameInput(),'体験の人2');await s.click('保存',400);
  assert.deepEqual(s.writes(),[]);assert.equal(s.user('guest').avatar,'data:image/jpeg;base64,/9j/AA==');assert.equal(s.user('guest').name,'体験の人2');
  assert.match(s.toast(),/プロフィールを保存しました/);
  await s.click('編集');await s.click('画像を削除する');await s.click('保存',400);assert.equal(s.user('guest').avatar,null);assert.deepEqual(s.writes(),[]);
});
test('SNS post: a failed profile preparation stops before the photo is sent; success sends photo then post',async t=>{
  const s=await setup(t,{rows:{[ME]:SERVER}});
  const blob=new s.w.Blob(['x'],{type:'image/jpeg'});
  s.ctl.fail.ensure=true;
  const bad=await s.w.snsCreatePost(ME,{body:'架空の投稿',imageBlob:blob},s.user());
  assert.equal(bad.error,'プロフィールの準備でつまずいたみたい🐼');assert.deepEqual(s.writes().map(c=>c[0]),['ensure']);
  s.ctl.fail.ensure=false;
  const ok=await s.w.snsCreatePost(ME,{body:'架空の投稿',imageBlob:blob},s.user());
  assert.equal(ok.error,null);assert.deepEqual(s.writes().map(c=>c[0]),['ensure','ensure','upload','post']);
  s.ctl.fail.post=true;const third=await s.w.snsCreatePost(ME,{body:'架空の投稿',imageBlob:blob},s.user());
  assert.ok(third.error);assert.deepEqual(s.writes().slice(-3).map(c=>c[0]),['upload','post','remove'],'a failed post removes the photo it sent');
});
