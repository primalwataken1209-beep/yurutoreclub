const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {JSDOM,ResourceLoader}=require('jsdom');
const {build}=require('../scripts/build-mobile.cjs');
const {installNative,fire}=require('./fakes.cjs');
const mobile=path.resolve(__dirname,'..'),root=path.resolve(mobile,'..');
const KEY='sb_publishable_TESTONLY_not_a_real_key';
const SUPA='https://knftduojdalnawvkbelt.supabase.co',CALLBACK='club.yurutore.app://auth/callback';
let www;
function staging(t){
  if(www)return www;
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'yt-shell-'));
  process.on('exit',()=>fs.rmSync(dir,{recursive:true,force:true}));
  www=path.join(dir,'www');build({root,mobile,out:www,target:'staging',env:{YT_STAGING_PUBLISHABLE_KEY:KEY}});
  return www;
}
const settle=(ms=150)=>new Promise(r=>setTimeout(r,ms));

// Bare page with stand-ins for the native plugins, plus the real vendored SDK and bridge.
function shell(t,{native=true,platform,page='<!doctype html><body></body>',secure,fsys}={}){
  const out=staging(t);
  const dom=new JSDOM(page,{url:'https://localhost/',runScripts:'outside-only'});t.after(()=>dom.window.close());
  const w=dom.window,log={open:[],close:0,fetch:[],minimized:0,listeners:{},nav:[]};
  // WebViews provide WebCrypto and TextEncoder; jsdom does not.
  Object.defineProperty(w,'crypto',{value:require('node:crypto').webcrypto});w.TextEncoder=TextEncoder;
  w.fetch=async(url,init)=>{log.fetch.push({url:String(url),body:init&&init.body});return new Response('{"error":"invalid_grant"}',{status:400,headers:{'content-type':'application/json'}});};
  const fakes=installNative(w,{native,platform,secure,fsys,log});
  for(const f of ['native-config.js','native-bridge.js','native-storage.js','vendor/supabase.js'])w.eval(fs.readFileSync(path.join(out,f),'utf8'));
  return {w,log,...fakes};
}
function client(w){return w.supabase.createClient(SUPA,KEY,w.YT_NATIVE.clientOptions(SUPA));}

test('Google sign-in opens the system browser with PKCE and the exact callback',async t=>{
  const {w,log}=shell(t);const c=client(w);w.YT_NATIVE.attach(c);
  const r=await w.YT_NATIVE.oauthSignIn('google');
  assert.equal(r.error,null);assert.equal(log.open.length,1);
  const u=new URL(log.open[0]);
  assert.equal(u.origin,SUPA);assert.equal(u.pathname,'/auth/v1/authorize');
  assert.equal(u.searchParams.get('provider'),'google');assert.equal(u.searchParams.get('redirect_to'),CALLBACK);
  assert.ok(u.searchParams.get('code_challenge'));assert.equal(u.searchParams.get('code_challenge_method'),'s256');
  assert.equal(log.fetch.length,0,'no request before the user signs in');
});
test('only the exact callback exchanges a code, through the build target only',async t=>{
  const {w,log}=shell(t);const c=client(w);w.YT_NATIVE.attach(c);
  await w.YT_NATIVE.oauthSignIn('google');
  for(const bad of ['club.yurutore.app://auth/other?code=x','club.yurutore.app://evil/callback?code=x',
                    'other.scheme://auth/callback?code=x','https://localhost/auth/callback?code=x','not a url'])
    assert.equal(await w.YT_NATIVE.handleUrl(bad),false,bad);
  assert.equal(w.document.querySelector('[role=alert]'),null,'ignored links show nothing');
  assert.equal(await w.YT_NATIVE.handleUrl(CALLBACK+'?error=access_denied'),true);
  assert.equal(log.fetch.length,0);
  assert.match(w.document.getElementById('yt-native-auth-error').textContent,/ログインを完了できませんでした/);
  w.document.getElementById('yt-native-auth-error').remove();
  assert.ok(log.listeners.appUrlOpen,'listens for app links');
  fire(log,'appUrlOpen',{url:CALLBACK+'?code=abc123'});await settle();
  assert.equal(log.fetch.length,1);
  assert.ok(log.fetch[0].url.startsWith(SUPA+'/auth/v1/token?grant_type=pkce'));
  assert.match(String(log.fetch[0].body),/"auth_code":"abc123"/);assert.match(String(log.fetch[0].body),/"code_verifier":"[^"]+"/);
  assert.ok(log.close>=1,'in-app browser closed');
  const {data}=await c.auth.getSession();assert.equal(data.session,null,'failed exchange leaves no session');
  assert.ok(w.document.getElementById('yt-native-auth-error'),'failed exchange is shown to the user');
});
test('session refresh pauses in the background and resumes when the app returns',async t=>{
  const {w,log}=shell(t);const calls=[];
  w.YT_NATIVE.attach({auth:{onAuthStateChange(){},startAutoRefresh:()=>calls.push('start'),stopAutoRefresh:()=>calls.push('stop')}});
  assert.ok(log.listeners.appStateChange);
  fire(log,'appStateChange',{isActive:false});fire(log,'appStateChange',{isActive:true});
  assert.deepEqual(calls,['stop','start']);
});
test('English sign-in failure message',async t=>{
  const {w}=shell(t);w.localStorage.setItem('yurutore_language','en');
  w.YT_NATIVE.attach({auth:{onAuthStateChange(){},startAutoRefresh(){},stopAutoRefresh(){},exchangeCodeForSession:async()=>({error:new Error('x')})}});
  await w.YT_NATIVE.handleUrl(CALLBACK+'?code=zzz');
  assert.match(w.document.getElementById('yt-native-auth-error').textContent,/Sign-in did not complete/);
});
test('Apple and other providers stay disabled until configured',async t=>{
  const {w,log}=shell(t);w.YT_NATIVE.attach(client(w));
  for(const p of ['apple','github']){const r=await w.YT_NATIVE.oauthSignIn(p);assert.match(String(r.error&&r.error.message),/not enabled/);}
  assert.equal(log.open.length,0);
});
test('a tampered authorize URL is not opened',async t=>{
  const {w,log}=shell(t);
  const fake=extra=>({auth:{onAuthStateChange(){},signInWithOAuth:async()=>({data:{url:extra},error:null})}});
  for(const url of ['https://evil.example/auth/v1/authorize?redirect_to='+encodeURIComponent(CALLBACK)+'&code_challenge=x',
                    SUPA+'/auth/v1/authorize?redirect_to=https%3A%2F%2Fevil.example&code_challenge=x',
                    SUPA+'/auth/v1/authorize?redirect_to='+encodeURIComponent(CALLBACK)]){
    w.YT_NATIVE.attach(fake(url));
    const r=await w.YT_NATIVE.oauthSignIn('google');assert.match(String(r.error&&r.error.message),/Unexpected authorize URL/);
  }
  assert.equal(log.open.length,0);
});
test('API calls outside the build target are refused',async t=>{
  const {w,log}=shell(t);const opts=w.YT_NATIVE.clientOptions(SUPA);
  await assert.rejects(()=>opts.global.fetch('https://eszheiabjwehcbrteqza.supabase.co/rest/v1/posts'),/outside the build target/);
  await assert.rejects(()=>opts.global.fetch('https://evil.example/'),/outside the build target/);
  await opts.global.fetch(SUPA+'/rest/v1/posts');assert.equal(log.fetch.length,1);
  assert.throws(()=>w.YT_NATIVE.clientOptions('https://eszheiabjwehcbrteqza.supabase.co'),/does not match/);
});
test('links: bundle pages stay inside, support mail goes to the mail app, everything else is blocked',async t=>{
  const {w,log}=shell(t);const N=w.YT_NATIVE;
  assert.equal(N.classify('https://localhost/privacy/'),'inside');
  const support=w.YT_NATIVE_CONFIG.allowedMail;assert.equal(support.length,1,'support address taken from legal/legal.js');
  assert.equal(N.classify('mailto:'+support[0]),'system');
  assert.equal(N.classify('mailto:someone@example.com'),'blocked');
  for(const u of ['https://example.com/','http://localhost:8080/','javascript:alert(1)','tel:0000','intent://x'])assert.equal(N.classify(u),'blocked',u);
  w.open('https://example.com/');assert.equal(log.open.length,0);
});
test('Android back closes the top sheet first, then screens, then leaves the app in the background',async t=>{
  const {w,log}=shell(t);
  const add=(cls,label)=>{const el=w.document.createElement('div');el.className=cls;el.addEventListener('click',()=>{log.nav.push(label);el.remove();});w.document.body.appendChild(el);};
  add('room-full-back','screen');add('overlay','sheet');
  assert.ok(log.listeners.backButton,'back listener registered');
  fire(log,'backButton',{canGoBack:false});fire(log,'backButton',{canGoBack:false});fire(log,'backButton',{canGoBack:false});
  assert.deepEqual(log.nav,['sheet','screen']);assert.equal(log.minimized,1);
});
test('outside the native shell no listeners are registered',async t=>{
  const {log}=shell(t,{native:false});
  assert.deepEqual(Object.keys(log.listeners),[]);
});
test('the bundled app starts and the trial works with the network switched off',async t=>{
  const out=staging(t),attempts=[],errors=[],remote=[];
  // Serves the built bundle as https://localhost/ (the Android shell origin); any other host is refused.
  class Bundle extends ResourceLoader{fetch(url){
    const u=new URL(url);
    if(u.origin!=='https://localhost'){remote.push(url);return null;}
    const p=path.join(out,decodeURIComponent(u.pathname));
    return Promise.resolve(fs.readFileSync(p.endsWith(path.sep)?path.join(p,'index.html'):p));
  }}
  const dom=new JSDOM(fs.readFileSync(path.join(out,'index.html')),{url:'https://localhost/',runScripts:'dangerously',
    resources:new Bundle(),pretendToBeVisual:true,
    beforeParse(w){
      Object.defineProperty(w,'crypto',{value:require('node:crypto').webcrypto});w.TextEncoder=TextEncoder;
      w.localStorage.setItem('yurutore_language','ja');
      const denied=u=>{attempts.push(String(u));return Promise.reject(new Error('offline'));};
      w.fetch=denied;w.XMLHttpRequest=function(){attempts.push('xhr');throw new Error('offline');};
      w.matchMedia=()=>({matches:false,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){}});
      w.addEventListener('error',e=>errors.push(e.message));
    }});
  t.after(()=>dom.window.close());
  const w=dom.window;
  for(let i=0;i<50&&!w.document.querySelector('#root button');i++)await settle(100);
  assert.ok(w.YT_NATIVE&&w.YT_NATIVE.target==='staging');
  const button=label=>[...w.document.querySelectorAll('button')].find(b=>b.textContent.includes(label));
  assert.ok(button('まずは体験'),'welcome rendered: '+w.document.getElementById('root').textContent.slice(0,120));
  button('まずは体験').click();await settle();
  assert.deepEqual(errors,[]);
  assert.ok(attempts.every(u=>u.startsWith('https://knftduojdalnawvkbelt.supabase.co/')),'only the staging API was attempted: '+attempts);
  assert.deepEqual(remote,[],'no remote resources requested');
});
test('without WebCrypto the plain PKCE fallback is refused',async t=>{
  const {w,log}=shell(t);
  w.YT_NATIVE.attach({auth:{onAuthStateChange(){},signInWithOAuth:async()=>({data:{url:SUPA+'/auth/v1/authorize?provider=google&redirect_to='+
    encodeURIComponent(CALLBACK)+'&code_challenge=abc&code_challenge_method=plain'},error:null})}});
  const r=await w.YT_NATIVE.oauthSignIn('google');
  assert.match(String(r.error&&r.error.message),/Unexpected authorize URL/);assert.equal(log.open.length,0);
});
