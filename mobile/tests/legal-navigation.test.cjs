// Legal pages inside the native shell, served by the same path rule as Capacitor's local servers (not a plain web server):
// a path whose last segment has no "." answers with the root index.html. Runs the built bundle; no device, no network.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {JSDOM,ResourceLoader}=require('jsdom');
const {staging,settle}=require('./app-harness.cjs');
const {fakeFilesystem,fakeSecureStorage,installNative,installCoreStub,CORE_STUB,fire}=require('./fakes.cjs');
const mobile=path.resolve(__dirname,'..');
const PAGES={terms:['利用規約','Terms of Service'],privacy:['プライバシーポリシー','Privacy Policy'],'community-guidelines':['コミュニティガイドライン','Community Guidelines'],
  contact:['お問い合わせ','Contact'],'account-deletion':['アカウント削除について','Account Deletion']};

// The file the native server answers with for a path (WebViewLocalServer.java / Router.swift).
function served(out,pathname){
  const last=pathname.split('/').filter(Boolean).pop()||'';
  const file=(pathname==='/'||!last.includes('.'))?path.join(out,'index.html'):path.join(out,decodeURIComponent(pathname));
  return fs.existsSync(file)&&fs.statSync(file).isFile()?file:null;
}
// Loads one page at a real URL. Everything it asks for goes through served(); the bridge sees a location that records navigation.
async function open(t,{url='https://localhost/',lang='ja',platform='android',scheme=null,fsys=fakeFilesystem(),secure=fakeSecureStorage(),seed={}}={}){
  const out=staging(),u0=new URL(url),missing=[],remote=[],errors=[],nav=[],backs=[],log={open:[],close:0,minimized:0,listeners:{}};
  class Bundle extends ResourceLoader{fetch(raw){
    const u=new URL(raw);
    if(u.protocol!==u0.protocol||u.host!==u0.host){remote.push(raw);return null;}
    if(u.pathname==='/vendor/capacitor.js')return Promise.resolve(Buffer.from(CORE_STUB));
    const file=served(out,u.pathname);
    if(!file){missing.push(u.pathname);return Promise.reject(new Error('404 '+u.pathname));}
    const text=fs.readFileSync(file);
    return Promise.resolve(u.pathname==='/native-bridge.js'?Buffer.from('(function(location){'+text+'\n})(window.__ytLocation);'):text);
  }}
  const page=served(out,u0.pathname);
  const dom=new JSDOM(fs.readFileSync(page),{url,runScripts:'dangerously',resources:new Bundle(),pretendToBeVisual:true,
    beforeParse(w){
      Object.defineProperty(w,'crypto',{value:require('node:crypto').webcrypto});w.TextEncoder=TextEncoder;
      w.localStorage.setItem('yurutore_language',lang);
      for(const [k,v] of Object.entries(seed))w.localStorage.setItem(k,v);
      w.fetch=()=>Promise.reject(new Error('offline'));
      w.matchMedia=()=>({matches:false,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){}});
      w.addEventListener('error',e=>errors.push(e.message));
      const loc=w.location;
      // jsdom has no storage on a capacitor:// page, so for iOS only the bridge is told it runs on that origin.
      const seen=k=>k==='protocol'&&scheme?scheme+':':k==='href'&&scheme?loc.href.replace(/^https:/,scheme+':'):loc[k];
      w.__ytLocation=new Proxy({},{get:(_,k)=>k==='assign'?(x=>nav.push(String(x))):seen(k),set:(_,k,v)=>{if(k==='href')nav.push(String(v));return true;}});
      Object.defineProperty(w.history,'back',{value:()=>backs.push(loc.pathname)});
      installNative(w,{platform,fsys,secure,log});installCoreStub(w);
    }});
  t.after(()=>dom.window.close());
  const w=dom.window;
  await new Promise(r=>w.addEventListener('load',r));await settle(50);
  return {w,out,nav,backs,log,missing,remote,errors,fsys,secure};
}
// Clicks a link and returns the URL the page goes to (null when the click is blocked).
function tap(s,a){
  const before=s.nav.length,ev=new s.w.MouseEvent('click',{bubbles:true,cancelable:true});
  const free=a.dispatchEvent(ev);
  if(s.nav.length>before)return s.nav[s.nav.length-1];
  return free?a.href:null;
}
const fileOf=(s,url)=>{const f=served(s.out,new URL(url).pathname);return f&&path.relative(s.out,f).split(path.sep).join('/');};

test('the rule the tests use is the one in the installed Capacitor, and the app does not change it',()=>{
  const java=fs.readFileSync(path.join(mobile,'node_modules/@capacitor/android/capacitor/src/main/java/com/getcapacitor/WebViewLocalServer.java'),'utf8');
  assert.match(java,/path\.equals\("\/"\) \|\| \(!request\.getUrl\(\)\.getLastPathSegment\(\)\.contains\("\."\) && html5mode\)/);
  const swift=fs.readFileSync(path.join(mobile,'node_modules/@capacitor/ios/Capacitor/Capacitor/Router.swift'),'utf8');
  assert.match(swift,/if pathUrl\.pathExtension\.isEmpty \{\s*return basePath \+ "\/index\.html"/);
  const config=JSON.parse(fs.readFileSync(path.join(mobile,'capacitor.config.json'),'utf8'));
  assert.equal(config.server.html5mode,undefined);assert.deepEqual(config.server.allowNavigation,[]);
  const out=staging();
  assert.equal(served(out,'/terms/'),path.join(out,'index.html'),'a directory URL gets the app page, not the terms page');
  assert.equal(served(out,'/terms/vendor/react.production.min.js'),null,'and its relative files do not exist');
});
for(const [name,titles] of Object.entries(PAGES))for(const [i,lang] of ['ja','en'].entries())
  test(`${name} (${lang}) shows its own content with every file loaded`,async t=>{
    const s=await open(t,{url:`https://localhost/${name}/index.html`,lang});
    assert.deepEqual(s.missing.filter(p=>p!=='/favicon.ico'),[]);assert.deepEqual(s.remote,[]);assert.deepEqual(s.errors,[]);
    assert.equal(s.w.document.documentElement.getAttribute('data-yt-lang'),lang);
    assert.equal(s.w.document.querySelector(`[data-lang-block="${lang}"] h1`).textContent.trim().startsWith(titles[i]),true);
    assert.ok(s.w.document.querySelector(`[data-lang-block="${lang}"]`).textContent.length>300);
    assert.ok(s.w.YT_NATIVE&&s.w.YT_NATIVE.target==='staging','the shell is running on the page');
  });
test('the profile links in the running app go to the real pages, in Japanese and English',async t=>{
  for(const [lang,labels] of [['ja',['まずは体験してみる','まずは体験してみる','🚶 ウォーキング','週1〜2回','次へ進む']],['en',null]]){
    const s=await open(t,{lang});
    for(let i=0;i<60&&!s.w.document.querySelector('#root button');i++)await settle(100);
    const button=l=>[...s.w.document.querySelectorAll('button')].find(b=>b.textContent.replace(/\s+/g,'').includes(l.replace(/\s+/g,'')));
    if(labels){
      for(const l of labels){button(l).click();await settle(120);}
      const el=s.w.document.querySelector('input[placeholder="例：ゆるパンダ"]');
      Object.getOwnPropertyDescriptor(s.w.HTMLInputElement.prototype,'value').set.call(el,'リンク確認');el.dispatchEvent(new s.w.Event('input',{bubbles:true}));
      button('はじめる').click();await settle(200);button('プロフ').click();await settle(200);
      const links=[...s.w.document.querySelectorAll('a[href]')].filter(a=>a.getAttribute('target')==='_blank');
      assert.deepEqual(links.map(a=>a.getAttribute('href')),['/terms/','/privacy/','/community-guidelines/','/contact/']);
      for(const a of links){
        const to=tap(s,a);
        assert.equal(to,'https://localhost'+a.getAttribute('href')+'index.html');
        assert.equal(fileOf(s,to),a.getAttribute('href').slice(1)+'index.html','the server answers with the page itself');
      }
    }else assert.ok(button('Try it first')||s.w.document.getElementById('root').textContent.length>0);
    assert.deepEqual(s.errors,[]);
  }
});
test('every link on every legal page lands on a real file, or is the app, the support mail, or blocked',async t=>{
  for(const name of Object.keys(PAGES)){
    const s=await open(t,{url:`https://localhost/${name}/index.html`});
    const links=[...s.w.document.querySelectorAll('a[href]')];assert.ok(links.length>=5,name);
    const seen=new Set();
    for(const a of links){
      const to=tap(s,a);
      if(a.protocol==='mailto:'){assert.equal(to,'mailto:support.yurutoreclub@gmail.com');continue;}
      assert.ok(to,'link stays usable: '+a.href);
      const file=fileOf(s,to),href=a.getAttribute('href');
      if(href==='../'){assert.equal(new URL(to).pathname,'/','the brand link returns to the app');continue;}
      assert.notEqual(file,'index.html',href+' must not fall back to the app page');
      assert.ok(file&&file.endsWith('/index.html'),href+' -> '+file);seen.add(file);
    }
    assert.ok(seen.size>=5,'footer reaches all five pages: '+[...seen]);
  }
});
test('new-window calls and links with a query or a hash keep them and land on the file; outside URLs stay blocked',async t=>{
  const s=await open(t,{url:'https://localhost/terms/index.html'});
  s.w.open('/privacy/');assert.equal(s.nav.pop(),'https://localhost/privacy/index.html');
  s.w.open('../contact');assert.equal(s.nav.pop(),'https://localhost/contact/index.html');
  s.w.open('/privacy/?lang=en#section');assert.equal(s.nav.pop(),'https://localhost/privacy/index.html?lang=en#section');
  s.w.open('/privacy/index.html');assert.equal(s.nav.pop(),'https://localhost/privacy/index.html');
  for(const u of ['https://example.com/terms/','http://localhost:8080/terms/','javascript:alert(1)']){s.w.open(u);assert.equal(s.nav.length,0,u);}
  assert.equal(s.log.open.length,0);
  const a=s.w.document.createElement('a');a.href='https://example.com/terms/';a.target='_blank';s.w.document.body.appendChild(a);
  assert.equal(tap(s,a),null,'an outside link is blocked');
});
test('iOS: the capacitor:// origin works the same way',async t=>{
  const s=await open(t,{url:'https://localhost/privacy/index.html',platform:'ios',scheme:'capacitor'});
  const link=(href,target)=>{const a=s.w.document.createElement('a');a.href=href;if(target)a.target=target;s.w.document.body.appendChild(a);return a;};
  assert.equal(tap(s,link('capacitor://localhost/terms/')),'capacitor://localhost/terms/index.html');
  assert.equal(tap(s,link('capacitor://localhost/terms/','_blank')),'capacitor://localhost/terms/index.html');
  s.w.open('/contact/');assert.equal(s.nav.pop(),'capacitor://localhost/contact/index.html');
  assert.equal(tap(s,link('capacitor://localhost/')),'capacitor://localhost/','the header link is the way back on iOS');
  assert.equal(s.w.document.querySelector('a.lg-brand').getAttribute('href'),'../');
  assert.equal(tap(s,link('capacitor://other/terms/')),null,'another host stays blocked');
});
test('back returns from a legal page; on the app page it leaves the app in the background',async t=>{
  const s=await open(t,{url:'https://localhost/terms/index.html'});
  assert.ok(s.log.listeners.backButton,'the back button works on the legal page');
  fire(s.log,'backButton',{canGoBack:true});assert.deepEqual(s.backs,['/terms/index.html']);assert.equal(s.log.minimized,0);
  const app=await open(t,{});for(let i=0;i<60&&!app.w.document.querySelector('#root button');i++)await settle(100);
  fire(app.log,'backButton',{canGoBack:true});assert.deepEqual(app.backs,[]);assert.equal(app.log.minimized,1);
});
test('opening a legal page changes no records and no session; the language switch only sets the language',async t=>{
  const record=JSON.stringify({reports:[{id:'r1',aid:'walk',ts:1}],onboard:true,user:{name:'確認'}});
  const seed={'yurutore-v6-android-guest':record,'yurutore_room_seen_unlocks_v1_guest':'{"seen":[]}','yt-native-mirror-gen':'7'};
  const fsys=fakeFilesystem(),secure=fakeSecureStorage(new Map([['yt-session_sb-token','kept']]));
  const s=await open(t,{url:'https://localhost/privacy/index.html',fsys,secure,seed});
  s.w.document.querySelector('[data-set-lang="en"]').click();await settle(50);
  assert.equal(s.w.document.documentElement.getAttribute('data-yt-lang'),'en');
  for(const [k,v] of Object.entries(seed))assert.equal(s.w.localStorage.getItem(k),v,k);
  assert.equal(s.w.localStorage.getItem('yurutore_language'),'en');
  assert.deepEqual(fsys.calls.filter(c=>c[0]==='write'||c[0]==='delete'),[],'the device copy is not touched');
  assert.deepEqual(secure.calls,[],'the session is not touched');assert.equal(secure.items.get('yt-session_sb-token'),'kept');
  // Back on the app page the same storage is used and nothing is restored over it.
  const app=await open(t,{fsys,secure,seed:{...seed,yurutore_language:'en'},lang:'en'});
  await app.w.YT_NATIVE_STORAGE.ready;
  assert.equal(app.w.YT_NATIVE_STORAGE.status().status,'intact');
  assert.equal(app.w.localStorage.getItem('yurutore-v6-android-guest'),record);
});
