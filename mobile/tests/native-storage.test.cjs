const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {JSDOM}=require('jsdom');
const {build}=require('../scripts/build-mobile.cjs');
const {fakeFilesystem,fakeSecureStorage,installNative,fire}=require('./fakes.cjs');
const mobile=path.resolve(__dirname,'..'),root=path.resolve(mobile,'..');
const KEY='sb_publishable_TESTONLY_not_a_real_key',SUPA='https://knftduojdalnawvkbelt.supabase.co';
const CALLBACK='club.yurutore.dev.placeholder://auth/callback';
const DIR='LIBRARY_NO_CLOUD',A='LIBRARY_NO_CLOUD/yt-records-a.json',B='LIBRARY_NO_CLOUD/yt-records-b.json';
const U1='yurutore-v6-android-11111111-1111-1111-1111-111111111111',U2='yurutore-v6-android-22222222-2222-2222-2222-222222222222';
const settle=(ms=120)=>new Promise(r=>setTimeout(r,ms));
let www;
function staging(){
  if(www)return www;
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'yt-store-'));
  process.on('exit',()=>fs.rmSync(dir,{recursive:true,force:true}));
  www=path.join(dir,'www');build({root,mobile,out:www,target:'staging',env:{YT_STAGING_PUBLISHABLE_KEY:KEY}});
  return www;
}
const slot=(gen,keys)=>JSON.stringify({format:1,gen,savedAt:0,keys});
function boot(t,{stored={},fsys=fakeFilesystem(),secure=fakeSecureStorage(),platform='android',native=true,config={},before}={}){
  const out=staging();
  const dom=new JSDOM('<!doctype html><head><meta name="yt-app" content="app.bundle.js"></head><body><div id="root"></div></body>',{url:'https://localhost/',runScripts:'outside-only'});
  t.after(()=>dom.window.close());
  const w=dom.window,log={open:[],close:0,minimized:0,listeners:{},fetch:[]};
  Object.defineProperty(w,'crypto',{value:require('node:crypto').webcrypto});w.TextEncoder=TextEncoder;
  for(const [k,v] of Object.entries(stored))w.localStorage.setItem(k,v);
  installNative(w,{native,platform,fsys,secure,log});
  if(before)before(w);
  w.eval(fs.readFileSync(path.join(out,'native-config.js'),'utf8'));
  w.YT_NATIVE_CONFIG=Object.freeze({...w.YT_NATIVE_CONFIG,...config});
  for(const f of ['native-bridge.js','native-storage.js'])w.eval(fs.readFileSync(path.join(out,f),'utf8'));
  const appStarted=()=>!!w.document.querySelector('script[src="app.bundle.js"]');
  const local=()=>Object.fromEntries(Object.keys(w.localStorage).map(k=>[k,w.localStorage.getItem(k)]));
  const file=name=>fsys.files.has(name)?JSON.parse(fsys.files.get(name)):null;
  return {w,log,fsys,secure,appStarted,local,file,S:()=>w.YT_NATIVE_STORAGE};
}

test('first launch: app starts, only app keys are mirrored, slots alternate',async t=>{
  const s=boot(t);await s.S().ready;
  assert.equal(s.S().status().status,'empty');assert.ok(s.appStarted());
  s.w.localStorage.setItem(U1,'{"reports":[{"aid":"walk"}]}');
  s.w.localStorage.setItem('sb-knftduojdalnawvkbelt-auth-token','secret');s.w.localStorage.setItem('other','x');
  await settle(400);
  assert.deepEqual(s.file(B).keys,{[U1]:'{"reports":[{"aid":"walk"}]}'});assert.equal(s.file(B).gen,1);
  assert.equal(s.w.localStorage.getItem('yt-native-mirror-gen'),'1');
  s.w.localStorage.setItem('yurutore_language','en');await settle(400);
  assert.equal(s.file(A).gen,2);assert.equal(s.file(A).keys.yurutore_language,'en');
  assert.equal(s.S().status().status,'saved');
  assert.ok(s.fsys.calls.every(c=>c[0]!=='write'||c[2]===DIR),'only the no-backup directory is used');
});
test('wiped storage is restored per account before the app starts',async t=>{
  const fsys=fakeFilesystem(new Map([[A,slot(4,{[U1]:'{"reports":[1]}',[U2]:'{"reports":[2,3]}',yurutore_language:'en'})],[B,slot(3,{[U1]:'old'})]]));
  const read=fsys.readFile;fsys.readFile=async o=>{await settle(80);return read(o);};
  const s=boot(t,{fsys});
  assert.equal(s.appStarted(),false,'app waits for the restore');
  await s.S().ready;
  assert.equal(s.S().status().status,'restored');assert.ok(s.appStarted());
  assert.deepEqual(s.local(),{[U1]:'{"reports":[1]}',[U2]:'{"reports":[2,3]}',yurutore_language:'en','yt-native-mirror-gen':'4'});
});
test('a damaged newest copy falls back to the other slot',async t=>{
  const fsys=fakeFilesystem(new Map([[A,slot(4,{[U1]:'good'})],[B,'{"format":1,"gen":5,"keys":{"yurutore-v6-andr']]));
  const s=boot(t,{fsys});await s.S().ready;
  assert.deepEqual(s.local()[U1],'good');
  const bad=fakeFilesystem(new Map([[A,slot(9,{'sb-x':'secret'})]]));
  const s2=boot(t,{fsys:bad});await s2.S().ready;
  // A copy with non-app keys is rejected; with no other copy that is a stop, not a new install.
  assert.equal(s2.S().status().status,'restore-failed');assert.equal(s2.local()['sb-x'],undefined);
});
test('surviving localStorage wins: keys it no longer has are not brought back',async t=>{
  const fsys=fakeFilesystem(new Map([[A,slot(6,{[U1]:'a',[U2]:'deleted account'})]]));
  const s=boot(t,{fsys,stored:{'yt-native-mirror-gen':'6',[U1]:'a'}});await s.S().ready;
  assert.equal(s.S().status().status,'intact');assert.equal(s.local()[U2],undefined);
  s.w.localStorage.setItem(U1,'b');await settle(400);
  assert.deepEqual(s.file(B).keys,{[U1]:'b'});assert.equal(s.file(B).gen,7);
});
test('removing an account\'s data is written without waiting',async t=>{
  const s=boot(t);await s.S().ready;
  s.w.localStorage.setItem(U1,'x');s.w.localStorage.setItem(U2,'y');await settle(400);
  s.w.localStorage.removeItem(U2);await settle(60);
  assert.deepEqual(s.file(A).keys,{[U1]:'x'});
});
test('a failed save is shown, not reported as saved, and retried on the next change',async t=>{
  const s=boot(t);await s.S().ready;
  s.fsys.fail.write=true;s.w.localStorage.setItem(U1,'x');await settle(400);
  assert.equal(s.S().status().status,'save-failed');assert.equal(s.w.localStorage.getItem('yt-native-mirror-gen'),'0');
  assert.match(s.w.document.getElementById('yt-native-save-error').textContent,/まだ完了していません/);
  s.fsys.fail.write=false;s.w.localStorage.setItem(U1,'y');await settle(400);
  assert.equal(s.S().status().status,'saved');assert.equal(s.w.document.getElementById('yt-native-save-error'),null);
  assert.deepEqual(s.file(B).keys,{[U1]:'y'});
});
test('a failed restore keeps the saved copy untouched and blocks further writes',async t=>{
  const fsys=fakeFilesystem(new Map([[A,slot(2,{[U1]:'big'})]]));
  const s=boot(t,{fsys,before:w=>{const orig=w.Storage.prototype.setItem;
    w.Storage.prototype.setItem=function(k,v){if(k===U1)throw new w.DOMException('quota','QuotaExceededError');return orig.call(this,k,v);};}});
  await s.S().ready;
  assert.equal(s.S().status().status,'restore-failed');assert.ok(s.S().status().blocked);
  assert.ok(s.w.document.getElementById('yt-native-restore-error'));assert.ok(s.appStarted());
  s.w.localStorage.setItem('yurutore_language','ja');await settle(400);
  assert.ok(s.fsys.calls.every(c=>c[0]!=='write'));assert.equal(JSON.parse(fsys.files.get(A)).keys[U1],'big');
});
test('a restore that never answers starts the app after the timeout without overwriting',async t=>{
  const fsys=fakeFilesystem();fsys.readFile=()=>new Promise(()=>{});
  const s=boot(t,{fsys,config:{restoreTimeoutMs:150}});
  await s.S().ready;
  assert.ok(s.appStarted());assert.equal(s.S().status().status,'restore-failed');
  s.w.localStorage.setItem(U1,'x');await settle(400);assert.ok(s.fsys.calls.every(c=>c[0]!=='write'));
});
test('a restore that finishes after the timeout changes neither the running app nor the saved copy',async t=>{
  const fsys=fakeFilesystem(new Map([[A,slot(3,{[U1]:'saved'})]]));
  const read=fsys.readFile;fsys.readFile=async o=>{await settle(250);return read(o);};
  const s=boot(t,{fsys,config:{restoreTimeoutMs:80}});
  await s.S().ready;assert.ok(s.appStarted());
  s.w.localStorage.setItem(U2,'new in app');await settle(700);
  assert.equal(s.local()[U1],undefined,'late restore did not write into the running app');
  assert.ok(s.fsys.calls.every(c=>c[0]!=='write'));assert.equal(JSON.parse(fsys.files.get(A)).keys[U1],'saved');
});
test('clear() on localStorage is ignored so other accounts are not wiped',async t=>{
  const s=boot(t,{stored:{[U1]:'a',[U2]:'b'}});await s.S().ready;
  s.w.localStorage.clear();
  assert.equal(s.local()[U1],'a');assert.equal(s.local()[U2],'b');
});
test('backgrounding the app writes immediately',async t=>{
  const s=boot(t);await s.S().ready;
  s.w.localStorage.setItem(U1,'x');fire(s.log,'appStateChange',{isActive:false});await settle(40);
  assert.deepEqual(s.file(B).keys,{[U1]:'x'});
});

/* ── Work review 699fb18: read errors, deletion leftovers, cleanup ── */
const TOMB='LIBRARY_NO_CLOUD/yt-records-removed.json';
test('read errors other than "file does not exist" stop the restore and nothing is written',async t=>{
  for(const failing of [['yt-records-a.json','yt-records-b.json'],['yt-records-a.json'],['yt-records-removed.json']]){
    const fsys=fakeFilesystem(new Map([[A,slot(3,{[U1]:'kept'})],[B,slot(2,{[U1]:'older'})]]));
    failing.forEach(p=>fsys.fail.readFor.add(p));
    const s=boot(t,{fsys});await s.S().ready;
    assert.equal(s.S().status().status,'restore-failed',failing.join(','));
    assert.ok(s.w.document.getElementById('yt-native-restore-error'));
    s.w.localStorage.setItem(U1,'new');await settle(400);
    assert.ok(fsys.calls.every(c=>c[0]!=='write'&&c[0]!=='delete'),'saved copies untouched: '+failing);
    assert.equal(JSON.parse(fsys.files.get(A)).keys[U1],'kept');
  }
});
test('with localStorage intact a read error does not matter and saving continues',async t=>{
  const fsys=fakeFilesystem();fsys.fail.read=true;
  const s=boot(t,{fsys,stored:{'yt-native-mirror-gen':'4',[U1]:'a'}});await s.S().ready;
  assert.equal(s.S().status().status,'intact');
  s.w.localStorage.setItem(U1,'b');await settle(400);assert.deepEqual(s.file(B).keys,{[U1]:'b'});
});
test('after a save only the committed copy remains and the removal is recorded',async t=>{
  const s=boot(t);await s.S().ready;
  s.w.localStorage.setItem(U1,'x');s.w.localStorage.setItem(U2,'personal');await settle(400);
  s.w.localStorage.removeItem(U2);await settle(80);
  assert.deepEqual(s.file(A).keys,{[U1]:'x'});assert.equal(s.fsys.files.has(B),false,'previous copy deleted');
  assert.equal(s.file(TOMB).keys[U2],2);
});
test('an older copy left behind cannot bring back data removed later',async t=>{
  // Newest copy damaged, previous copy still holds a deleted account, localStorage wiped.
  const fsys=fakeFilesystem(new Map([[A,slot(5,{[U1]:'keep',[U2]:'deleted account'})],[B,'{"format":1,"gen":6,"keys":{"yu'],
    [TOMB,JSON.stringify({format:1,keys:{[U2]:6}})]]));
  const s=boot(t,{fsys});await s.S().ready;
  assert.equal(s.S().status().status,'restored');
  assert.deepEqual(s.local(),{[U1]:'keep','yt-native-mirror-gen':'5'});
  // The tombstone survives the next save, so the removal is still known.
  s.w.localStorage.setItem(U1,'keep2');await settle(400);
  assert.equal(s.file(TOMB).keys[U2],6);
});
test('a key added again after removal is restored from a newer copy',async t=>{
  const fsys=fakeFilesystem(new Map([[A,slot(8,{[U2]:'signed in again'})],[TOMB,JSON.stringify({format:1,keys:{[U2]:6}})]]));
  const s=boot(t,{fsys});await s.S().ready;
  assert.equal(s.local()[U2],'signed in again');
});
test('a damaged tombstone stops the restore',async t=>{
  const fsys=fakeFilesystem(new Map([[A,slot(5,{[U1]:'a'})],[TOMB,'{"format":1,"keys":{"yur']]));
  const s=boot(t,{fsys});await s.S().ready;
  assert.equal(s.S().status().status,'restore-failed');assert.equal(s.local()[U1],undefined);
});
test('if deleting the previous copy fails the save still counts, the tombstone protects, and cleanup is retried',async t=>{
  const s=boot(t);await s.S().ready;
  s.w.localStorage.setItem(U2,'personal');await settle(400);
  s.fsys.fail.remove=true;
  const saved=s.S().whenSaved('yurutore-v6-');s.w.localStorage.removeItem(U2);
  assert.equal(await saved,true);
  assert.equal(s.S().status().status,'cleanup-failed');assert.equal(s.w.document.getElementById('yt-native-save-error'),null);
  assert.ok(s.fsys.files.has(B)&&JSON.parse(s.fsys.files.get(B)).keys[U2],'old copy still there');
  assert.equal(s.file(TOMB).keys[U2],2);
  s.fsys.fail.remove=false;s.w.localStorage.setItem(U1,'next');await settle(400);
  assert.equal(s.S().status().status,'saved');
});
test('whenSaved: true after a committed save, false after a failed one or a timeout',async t=>{
  const s=boot(t,{config:{saveWaitMs:300}});await s.S().ready;
  let p=s.S().whenSaved('yurutore-v6-');s.w.localStorage.setItem(U1,'a');assert.equal(await p,true);
  s.fsys.fail.write=true;p=s.S().whenSaved('yurutore-v6-');s.w.localStorage.setItem(U1,'b');assert.equal(await p,false);
  s.fsys.fail.write=false;
  p=s.S().whenSaved('yurutore-v6-');s.w.localStorage.setItem('yurutore_language','ja');assert.equal(await p,false,'other keys do not count');
  assert.ok(s.w.document.getElementById('yt-native-save-error'));
});

/* ── Session ── */
const jwt=sub=>{const b=o=>Buffer.from(JSON.stringify(o)).toString('base64url');return b({alg:'HS256',typ:'JWT'})+'.'+b({sub,exp:Math.floor(Date.now()/1000)+3600,aud:'authenticated',role:'authenticated'})+'.sig';};
function withSdk(s,responses){
  s.w.fetch=async(url,init)=>{s.log.fetch.push(String(url));const r=responses(String(url),init);
    return new Response(r.body===undefined?null:JSON.stringify(r.body),{status:r.status,headers:{'content-type':'application/json'}});};
  s.w.eval(fs.readFileSync(path.join(staging(),'vendor/supabase.js'),'utf8'));
  const c=s.w.supabase.createClient(SUPA,KEY,s.w.YT_NATIVE.clientOptions(SUPA));s.w.YT_NATIVE.attach(c);return c;
}
const tokens=uid=>({access_token:jwt(uid),token_type:'bearer',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,refresh_token:'r-'+uid,user:{id:uid,aud:'authenticated',email:'test@example.invalid'}});
test('iOS session storage: this-device-only Keychain, no sync, fresh install cleared once',async t=>{
  const secure=fakeSecureStorage(new Map([['yt-session_left-from-previous-install','x']]));
  const fsys=fakeFilesystem();
  const s=boot(t,{platform:'ios',secure,fsys,stored:{'sb-old-auth-token':'legacy'}});
  await s.S().sessionStorage.getItem('k');
  assert.deepEqual(secure.calls.slice(0,4),[['prefix','yt-session_'],['access',3],['sync',false],['clear']]);
  assert.equal(secure.items.size,0);assert.ok(fsys.files.has('LIBRARY_NO_CLOUD/yt-install.json'));
  assert.equal(s.local()['sb-old-auth-token'],undefined,'legacy localStorage session removed');
  const again=boot(t,{platform:'ios',secure:fakeSecureStorage(new Map([['yt-session_kept','v']])),fsys});
  await again.S().sessionStorage.getItem('k');
  assert.ok(!again.secure.calls.some(c=>c[0]==='clear'),'existing install is not cleared');
});
test('signing in stores the session only in secure storage; signing out erases it',async t=>{
  const uid='33333333-3333-3333-3333-333333333333';
  const s=boot(t);await s.S().ready;
  const c=withSdk(s,url=>url.includes('/token?grant_type=pkce')?{status:200,body:tokens(uid)}:url.includes('/logout')?{status:204}:{status:404,body:{}});
  await s.w.YT_NATIVE.oauthSignIn('google');
  assert.ok([...s.secure.items.keys()].some(k=>k.endsWith('-code-verifier')),'PKCE verifier kept in secure storage');
  fire(s.log,'appUrlOpen',{url:CALLBACK+'?code=ok'});await settle(200);
  const {data}=await c.auth.getSession();assert.equal(data.session&&data.session.user.id,uid);
  // The SDK may leave its used PKCE verifiers; they stay in secure storage and go at sign-out.
  assert.ok(s.secure.items.has('yt-session_sb-knftduojdalnawvkbelt-auth-token'));
  assert.ok([...s.secure.items.keys()].every(k=>k.startsWith('yt-session_')));
  assert.ok(Object.keys(s.local()).every(k=>!k.startsWith('sb-')),'nothing in localStorage');
  await c.auth.signOut();await settle(100);
  assert.equal(s.secure.items.size,0);assert.ok(s.secure.calls.some(x=>x[0]==='clear'));
});
test('a session that cannot be stored securely is a failed sign-in, not a fallback to localStorage',async t=>{
  const secure=fakeSecureStorage();
  const s=boot(t,{secure});await s.S().ready;
  const c=withSdk(s,url=>url.includes('/token')?{status:200,body:tokens('44444444-4444-4444-4444-444444444444')}:{status:404,body:{}});
  await s.w.YT_NATIVE.oauthSignIn('google');secure.fail.set=true;
  fire(s.log,'appUrlOpen',{url:CALLBACK+'?code=ok'});await settle(200);
  assert.match(s.w.document.getElementById('yt-native-auth-error').textContent,/ログインを完了できませんでした/);
  assert.ok(Object.keys(s.local()).every(k=>!k.startsWith('sb-')));
  assert.ok(![...secure.items.keys()].some(k=>k.endsWith('auth-token')));
  void c;
});
test('if erasing on sign-out fails the user is told',async t=>{
  const secure=fakeSecureStorage();
  const s=boot(t,{secure});await s.S().ready;
  const c=withSdk(s,url=>url.includes('/logout')?{status:204}:{status:404,body:{}});
  await s.S().sessionStorage.getItem('warm-up');secure.fail.clear=true;
  await c.auth.signOut();await settle(100);
  assert.match(s.w.document.getElementById('yt-native-auth-error').textContent,/消去できませんでした/);
});
test('only a missing install marker clears the Keychain; other stat errors stop without clearing',async t=>{
  const secure=fakeSecureStorage(new Map([['yt-session_sb-knftduojdalnawvkbelt-auth-token','session']]));
  const fsys=fakeFilesystem();fsys.fail.stat=true;
  const s=boot(t,{secure,fsys,platform:'ios'});
  await assert.rejects(()=>s.S().sessionStorage.getItem('sb-knftduojdalnawvkbelt-auth-token'),e=>e.code==='OS-PLUG-FILE-0013');
  assert.ok(!secure.calls.some(c=>c[0]==='clear'),'not cleared on an unknown error');
  assert.equal(secure.items.size,1);
  fsys.fail.stat=false;fsys.files.set('LIBRARY_NO_CLOUD/yt-install.json','{"format":1}');
  assert.equal(await s.S().sessionStorage.getItem('sb-knftduojdalnawvkbelt-auth-token'),'session');
});
test('a failed secure-storage setup is retried on the next call',async t=>{
  const secure=fakeSecureStorage();secure.fail.clear=true;
  const s=boot(t,{secure});
  await assert.rejects(()=>s.S().sessionStorage.getItem('k'),/Keychain error/);
  secure.fail.clear=false;
  assert.equal(await s.S().sessionStorage.getItem('k'),null);
});
test('outside the native shell nothing is mirrored and no secure storage is claimed',async t=>{
  const s=boot(t,{native:false});await s.S().ready;
  assert.ok(s.appStarted());assert.equal(s.S().sessionStorage,null);
  s.w.localStorage.setItem(U1,'x');await settle(400);assert.equal(s.fsys.calls.length,0);
  assert.equal(s.w.YT_NATIVE.clientOptions(SUPA).auth.storage,undefined);
});
test('the vendored plugins provide the methods and directory the shell relies on',()=>{
  const nm=p=>fs.readFileSync(path.join(mobile,'node_modules',p),'utf8');
  const ss=nm('@aparajita/capacitor-secure-storage/dist/plugin.js');
  for(const m of ['setKeyPrefix','setDefaultKeychainAccess','setSynchronize','getItem','setItem','removeItem','clear'])
    assert.match(ss,new RegExp('async '+m+'\\('),m);
  assert.match(ss,/KeychainAccess\["afterFirstUnlockThisDeviceOnly"\] = 3/);
  assert.match(nm('@aparajita/capacitor-secure-storage/ios/Sources/SecureStoragePlugin/Plugin.swift'),/case 3:\s*return KeychainSwiftAccessOptions\.accessibleAfterFirstUnlockThisDeviceOnly/);
  const kt=nm('@capacitor/filesystem/android/src/main/kotlin/com/capacitorjs/plugins/filesystem/FilesystemPlugin.kt');
  for(const m of ['readFile','writeFile','stat'])assert.match(kt,new RegExp('fun '+m+'\\('),m);
  const defs=nm('@capacitor/filesystem/dist/esm/definitions.d.ts');assert.match(defs,/LibraryNoCloud = "LIBRARY_NO_CLOUD"/);
});
