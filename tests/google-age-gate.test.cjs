// Offline UI checks: Google OAuth must not start until "13 or older" is ticked, on both auth screens and both tabs.
// No network: fetch/XHR/WebSocket throw, and the Supabase client is a local stub that only records calls.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
const {source,compile}=require('./helpers.cjs');
const compiled=compile(source);
const L={
  ja:{cta:'ログイン・新規登録はこちら',toAuth:'登録画面へ',reg:'新規登録',login:'ログイン',google:'Googleでログイン',submitLogin:'ログインする',
      trial:'メール設定はあとで、体験版で始める',age:'私は13歳以上です',need:'13歳以上の方のみ登録できます。チェックを入れてね🐼',fail:'Googleログインの設定確認が必要です'},
  en:{cta:'Log in or sign up',toAuth:'Go to sign up',reg:'Sign up',login:'Log in',google:'Continue with Google',submitLogin:'Log in',
      trial:'Skip email, just try it out',age:'I am 13 years of age or older.',need:'You need to be 13 or older to sign up. Please tick the box 🐼',fail:'Google sign-in needs to be configured.'}
};
async function setup(t,{lang='ja',gateSeen=false,oauthError=null}={}){
  const dom=new JSDOM(fs.readFileSync('index.html','utf8'),{url:'http://offline.invalid/',runScripts:'outside-only',pretendToBeVisual:true});t.after(()=>dom.window.close());
  const w=dom.window,calls={oauth:[],password:[],signUp:[]},errors=[];
  w.localStorage.setItem('yurutore_language',lang);
  if(gateSeen)w.sessionStorage.setItem('yurutore_welcome_seen_v13','1');
  w.fetch=()=>{throw Error('No network');};w.XMLHttpRequest=function(){throw Error('No network');};w.WebSocket=function(){throw Error('No network');};
  w.matchMedia=()=>({matches:false,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){}});
  w.addEventListener('error',e=>errors.push(e.message));
  const query=new Proxy({},{get:(_,key)=>key==='then'?(resolve)=>resolve({data:null,error:null}):()=>query});
  w.supabase={createClient:()=>({from:()=>query,auth:{
    getSession:async()=>({data:{session:null}}),
    onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),
    signInWithOAuth:async p=>{calls.oauth.push(p);return{error:oauthError};},
    signInWithPassword:async p=>{calls.password.push(p.email);return{data:{session:null,user:null},error:{message:'Invalid login credentials'}};},
    signUp:async p=>{calls.signUp.push(p.email);return{data:{session:null,user:null},error:{message:'rejected'}};},
    signOut:async()=>({error:null})
  }})};
  for(const [pkg,file] of [['react','react.production.min.js'],['react-dom','react-dom.production.min.js']])w.eval(fs.readFileSync(path.join(path.dirname(require.resolve(pkg+'/package.json')),'umd',file),'utf8'));
  w.eval(compiled);
  const settle=()=>new Promise(r=>setTimeout(r,120));await settle();
  const root=()=>w.document.getElementById('root');
  const btn=label=>{const b=[...root().querySelectorAll('button')].filter(x=>x.textContent.trim()===label);assert.equal(b.length,1,'button '+label+' x'+b.length);return b[0];};
  const click=async el=>{el.click();await settle();};
  const boxes=()=>[...root().querySelectorAll('input[type=checkbox]')];
  const fill=(el,value)=>{Object.getOwnPropertyDescriptor(w.HTMLInputElement.prototype,'value').set.call(el,value);el.dispatchEvent(new w.Event('input',{bubbles:true}));};
  return{w,calls,errors,settle,root,btn,click,boxes,fill,text:()=>root().textContent};
}
// Opens the email/Google auth form on the chosen screen: 'gate' = WelcomeGate, 'register' = RegisterScreen.
async function openAuth(t,screen,lang,opts={}){
  const s=await setup(t,{lang,gateSeen:screen==='register',...opts});const l=L[lang];
  await s.click(s.btn(screen==='gate'?l.cta:l.toAuth));
  assert.ok(s.btn(l.google),'auth form shown');
  return{s,l};
}
for(const screen of ['gate','register'])for(const lang of ['ja','en'])for(const mode of ['register','login']){
  test(`${screen}/${lang}/${mode}: unticked Google never calls OAuth; ticked Google calls it once`,async t=>{
    const {s,l}=await openAuth(t,screen,lang);
    await s.click(s.btn(mode==='register'?l.reg:l.login));
    assert.equal(s.boxes().length,1,'exactly one age checkbox');
    assert.ok(s.text().includes(l.age));
    await s.click(s.btn(l.google));
    assert.equal(s.calls.oauth.length,0,'OAuth must not start unticked');
    assert.ok(s.text().includes(l.need),'age message shown');
    await s.click(s.boxes()[0]);
    assert.equal(s.boxes()[0].checked,true);
    assert.ok(!s.text().includes(l.need),'message cleared after ticking');
    await s.click(s.btn(l.google));
    assert.equal(s.calls.oauth.length,1);
    assert.equal(s.calls.oauth[0].provider,'google');
    assert.deepEqual(s.calls.password,[]);assert.deepEqual(s.calls.signUp,[]);
    assert.deepEqual(s.errors,[]);
  });
}
for(const screen of ['gate','register']){
  test(`${screen}: email login still works without the age box; email sign-up still requires it`,async t=>{
    const {s,l}=await openAuth(t,screen,'ja');
    const [email,pass]=[...s.root().querySelectorAll('input.field')];
    s.fill(email,'synthetic@example.invalid');s.fill(pass,'test-password-1');await s.settle();
    await s.click(s.btn(l.reg));
    await s.click(s.btn('✨無料ではじめる✨'));
    assert.deepEqual(s.calls.signUp,[],'sign-up blocked unticked');
    assert.ok(s.text().includes(l.need));
    await s.click(s.btn(l.login));
    await s.click(s.btn(l.submitLogin));
    assert.deepEqual(s.calls.password,['synthetic@example.invalid'],'email login is not gated by age');
    assert.equal(s.calls.oauth.length,0);
    assert.deepEqual(s.errors,[]);
  });
  test(`${screen}: the trial button still works without the age box`,async t=>{
    const {s,l}=await openAuth(t,screen,'ja');
    await s.click(s.btn(l.login));
    await s.click(s.btn(l.trial));
    assert.equal([...s.root().querySelectorAll('button')].some(b=>b.textContent.trim()===l.google),false,'left the auth form');
    assert.equal(s.calls.oauth.length+s.calls.password.length+s.calls.signUp.length,0);
    assert.deepEqual(s.errors,[]);
  });
  test(`${screen}: a failed or cancelled OAuth start shows an error and can be retried`,async t=>{
    const {s,l}=await openAuth(t,screen,'en',{oauthError:{message:'cancelled'}});
    await s.click(s.btn(l.login));
    await s.click(s.boxes()[0]);
    await s.click(s.btn(l.google));
    assert.equal(s.calls.oauth.length,1);
    assert.ok(s.text().includes(l.fail),'failure is reported, not success');
    assert.equal(s.btn(l.google).disabled,false,'button usable again');
    await s.click(s.btn(l.google));
    assert.equal(s.calls.oauth.length,2);
    assert.deepEqual(s.errors,[]);
  });
}
test('switching tabs keeps the same age state; unticking blocks OAuth again',async t=>{
  const {s,l}=await openAuth(t,'gate','ja');
  await s.click(s.boxes()[0]);
  await s.click(s.btn(l.login));
  assert.equal(s.boxes()[0].checked,true);
  await s.click(s.boxes()[0]);
  await s.click(s.btn(l.google));
  assert.equal(s.calls.oauth.length,0);
});
