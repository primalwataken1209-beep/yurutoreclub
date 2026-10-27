const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
const {source,compile}=require('./helpers.cjs');
const compiled=compile(source);
async function setup(t,{session=null,hash='',stored=null}={}){
  const dom=new JSDOM(fs.readFileSync('index.html','utf8'),{url:'http://offline.invalid/'+hash,runScripts:'outside-only',pretendToBeVisual:true});t.after(()=>dom.window.close());
  const w=dom.window,calls=[],errors=[];w.localStorage.setItem('yurutore_language','ja');let callback,fail=false;
  w.fetch=()=>{throw Error('No network');};w.XMLHttpRequest=function(){throw Error('No network');};w.WebSocket=function(){throw Error('No network');};
  w.matchMedia=()=>({matches:false,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){}});
  w.addEventListener('error',e=>errors.push(e.message));
  if(stored)w.sessionStorage.setItem('yt-password-recovery-user',stored);
  const query=new Proxy({},{get:(_,key)=>key==='then'?(resolve)=>resolve({data:null,error:null}):()=>query});
  w.supabase={createClient:()=>({from:()=>query,auth:{getSession:async()=>({data:{session}}),onAuthStateChange:cb=>{callback=cb;return{data:{subscription:{unsubscribe(){}}}};},updateUser:async p=>{calls.push(p);return{error:fail?{message:'rejected'}:null};}}})};
  for(const [pkg,file] of [['react','react.production.min.js'],['react-dom','react-dom.production.min.js']])w.eval(fs.readFileSync(path.join(path.dirname(require.resolve(pkg+'/package.json')),'umd',file),'utf8'));
  w.eval(compiled);const settle=()=>new Promise(r=>setTimeout(r,150));await settle();
  const fill=(id,value)=>{const el=w.document.getElementById(id);assert.ok(el,id);Object.getOwnPropertyDescriptor(w.HTMLInputElement.prototype,'value').set.call(el,value);el.dispatchEvent(new w.Event('input',{bubbles:true}));};
  return{w,calls,errors,settle,fill,fail:()=>{fail=true;},emit:async(event,next)=>{callback(event,next);await settle();},submit:async()=>{w.document.querySelector('form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await settle();}};
}
const session={user:{id:'recovery-user',email:'synthetic@example.invalid',user_metadata:{}}};
test('recovery event gates home; mismatch/failure do not report success; successful save clears fields',async t=>{
  const s=await setup(t);await s.emit('PASSWORD_RECOVERY',session);
  assert.ok(s.w.document.getElementById('recovery-password'));
  s.fill('recovery-password','new-test-password');s.fill('recovery-confirm','different-password');await s.submit();assert.equal(s.calls.length,0);
  s.fill('recovery-confirm','new-test-password');await s.submit();assert.equal(s.calls.length,1);assert.equal(s.calls[0].password,'new-test-password');assert.match(s.w.document.getElementById('root').textContent,/新しいパスワードを保存しました/);assert.equal(s.w.document.querySelectorAll('input[type=password]').length,0);assert.equal(s.w.sessionStorage.getItem('yt-password-recovery-user'),null);assert.deepEqual(s.errors,[]);
});
test('API failure retains recovery form and never displays success',async t=>{const s=await setup(t);await s.emit('PASSWORD_RECOVERY',session);s.fail();s.fill('recovery-password','new-test-password');s.fill('recovery-confirm','new-test-password');await s.submit();assert.match(s.w.document.getElementById('root').textContent,/保存できませんでした/);assert.doesNotMatch(s.w.document.getElementById('root').textContent,/新しいパスワードを保存しました/);assert.ok(s.w.document.getElementById('recovery-password'));});
test('invalid recovery URL cannot submit a password',async t=>{const s=await setup(t,{hash:'#type=recovery'});assert.match(s.w.document.getElementById('root').textContent,/リンクが無効か期限切れ/);assert.equal(s.w.document.querySelectorAll('input[type=password]').length,0);assert.equal(s.calls.length,0);});
test('reload restores recovery only for the same authenticated user',async t=>{const a=await setup(t,{session,stored:session.user.id});assert.ok(a.w.document.getElementById('recovery-password'));const b=await setup(t,{session:null,stored:'another-user'});assert.equal(b.w.document.getElementById('recovery-password'),null);});

test('an invalid recovery link cannot reuse an unrelated existing session',async t=>{const s=await setup(t,{session,hash:'#type=recovery'});assert.equal(s.w.document.getElementById('recovery-password'),null);assert.equal(s.calls.length,0);});
