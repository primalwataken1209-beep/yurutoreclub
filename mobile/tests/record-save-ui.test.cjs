const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {JSDOM,ResourceLoader}=require('jsdom');
const {build}=require('../scripts/build-mobile.cjs');
const {fakeFilesystem,installNative,installCoreStub,CORE_STUB}=require('./fakes.cjs');
const mobile=path.resolve(__dirname,'..'),root=path.resolve(mobile,'..');
const settle=(ms=150)=>new Promise(r=>setTimeout(r,ms));
let www;
function staging(){
  if(www)return www;
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'yt-record-'));
  process.on('exit',()=>fs.rmSync(dir,{recursive:true,force:true}));
  www=path.join(dir,'www');build({root,mobile,out:www,target:'staging',env:{YT_STAGING_PUBLISHABLE_KEY:'sb_publishable_TESTONLY_not_a_real_key'}});
  return www;
}
// The whole built app on a simulated Android shell (in-memory plugins, no network).
async function app(t,fsys){
  const out=staging(),remote=[],errors=[],log={open:[],close:0,minimized:0,listeners:{}};
  class Bundle extends ResourceLoader{fetch(url){
    const u=new URL(url);if(u.origin!=='https://localhost'){remote.push(url);return null;}
    if(u.pathname==='/vendor/capacitor.js')return Promise.resolve(Buffer.from(CORE_STUB));
    const p=path.join(out,decodeURIComponent(u.pathname));
    return Promise.resolve(fs.readFileSync(p.endsWith(path.sep)?path.join(p,'index.html'):p));
  }}
  const dom=new JSDOM(fs.readFileSync(path.join(out,'index.html')),{url:'https://localhost/',runScripts:'dangerously',resources:new Bundle(),pretendToBeVisual:true,
    beforeParse(w){
      Object.defineProperty(w,'crypto',{value:require('node:crypto').webcrypto});w.TextEncoder=TextEncoder;
      w.localStorage.setItem('yurutore_language','ja');
      w.fetch=()=>Promise.reject(new Error('offline'));
      w.matchMedia=()=>({matches:false,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){}});
      w.addEventListener('error',e=>errors.push(e.message));
      installNative(w,{platform:'android',fsys,log});installCoreStub(w);
    }});
  t.after(()=>dom.window.close());
  const w=dom.window;
  for(let i=0;i<60&&!w.document.querySelector('#root button');i++)await settle(100);
  const button=label=>[...w.document.querySelectorAll('button')].find(b=>b.textContent.replace(/\s+/g,'').includes(label.replace(/\s+/g,'')));
  const click=async label=>{const b=button(label);assert.ok(b,'button '+label+': '+w.document.getElementById('root').textContent.slice(0,200));b.click();await settle();};
  const fill=(sel,v)=>{const el=w.document.querySelector(sel);Object.getOwnPropertyDescriptor(w.HTMLInputElement.prototype,'value').set.call(el,v);el.dispatchEvent(new w.Event('input',{bubbles:true}));};
  await click('まずは体験してみる');await click('まずは体験してみる');
  await click('🚶 ウォーキング');await click('週1〜2回');await click('次へ進む');
  fill('input[placeholder="例：ゆるパンダ"]','保存テスト');await click('はじめる');
  assert.ok(button('お部屋に遊びに行く'),'trial home reached');
  const record=async()=>{w.document.querySelector('.fab').click();await settle();await click('ランニング');await click('報告する ✓');};
  return {w,record,errors,remote};
}
const saved=fsys=>{const f=[...fsys.files.entries()].filter(([k])=>/yt-records-[ab]\.json$/.test(k)).map(([,v])=>JSON.parse(v)).sort((a,b)=>b.gen-a.gen)[0];
  const key=f&&Object.keys(f.keys).find(k=>k.startsWith('yurutore-v6-')&&k.endsWith('-guest'));return key?JSON.parse(f.keys[key]):null;};

test('the app starts when head scripts run before the body exists, as in a WebView',async t=>{
  // jsdom loads external scripts after parsing, which hid a bug once: inline them so they run in <head>.
  const out=staging(),fsys=fakeFilesystem(),log={open:[],close:0,minimized:0,listeners:{}};
  let html=fs.readFileSync(path.join(out,'index.html'),'utf8');
  html=html.replace(/<script src="([^"]+)"><\/script>/g,(m,src)=>{
    const code=src==='vendor/capacitor.js'?CORE_STUB:fs.readFileSync(path.join(out,src),'utf8');
    assert.ok(!/<\/script/i.test(code),src);return '<script>'+code+'</script>';});
  class Bundle extends ResourceLoader{fetch(url){const u=new URL(url);
    return u.origin==='https://localhost'?Promise.resolve(fs.readFileSync(path.join(out,u.pathname))):null;}}
  let rootAtStorage;
  const dom=new JSDOM(html,{url:'https://localhost/',runScripts:'dangerously',resources:new Bundle(),pretendToBeVisual:true,
    beforeParse(w){
      Object.defineProperty(w,'crypto',{value:require('node:crypto').webcrypto});w.TextEncoder=TextEncoder;
      w.localStorage.setItem('yurutore_language','ja');w.fetch=()=>Promise.reject(new Error('offline'));
      w.matchMedia=()=>({matches:false,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){}});
      installNative(w,{platform:'android',fsys,log});installCoreStub(w);
      const reg=w.Capacitor.registerPlugin;w.Capacitor.registerPlugin=n=>{rootAtStorage=!!w.document.getElementById('root');return reg(n);};
    }});
  t.after(()=>dom.window.close());
  for(let i=0;i<60&&!dom.window.document.querySelector('#root button');i++)await settle(100);
  assert.equal(rootAtStorage,false,'storage ran before #root existed');
  assert.ok([...dom.window.document.querySelectorAll('button')].some(b=>b.textContent.includes('まずは体験')),'app started');
  assert.ok(fsys.calls.some(c=>c[0]==='read'),'native storage active');
});
test('the praise screen appears only after the record is committed to the device file',async t=>{
  const fsys=fakeFilesystem();const s=await app(t,fsys);
  await s.record();
  for(let i=0;i<30&&!s.w.document.querySelector('.pj-stage');i++)await settle(100);
  assert.ok(s.w.document.querySelector('.pj-stage'),'praised');
  const st=saved(fsys);assert.equal(st.reports.length,1);assert.equal(st.reports[0].aid,'run');
  assert.deepEqual(s.errors,[]);assert.deepEqual(s.remote,[]);
});
test('a failed device save is not praised and the user is told',async t=>{
  const fsys=fakeFilesystem();const s=await app(t,fsys);
  fsys.fail.write=true;
  await s.record();await settle(1500);
  assert.equal(s.w.document.querySelector('.pj-stage'),null,'no praise screen');
  assert.match(s.w.document.getElementById('yt-native-save-error').textContent,/保存できませんでした/);
  assert.equal(saved(fsys).reports.length,0,'the new record is not in the committed copy');
  // The next save succeeds and clears the message; the record kept in the app is included.
  fsys.fail.write=false;await s.record();
  for(let i=0;i<30&&!s.w.document.querySelector('.pj-stage');i++)await settle(100);
  assert.ok(s.w.document.querySelector('.pj-stage'));assert.equal(saved(fsys).reports.length,2);
  assert.equal(s.w.document.getElementById('yt-native-save-error'),null);
});
