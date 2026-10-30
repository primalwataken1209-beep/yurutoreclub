const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {JSDOM,ResourceLoader}=require('jsdom');
const {fakeFilesystem,installNative,installCoreStub,CORE_STUB}=require('./fakes.cjs');
const {launch,staging,settle}=require('./app-harness.cjs');
// The whole built app on a simulated Android shell, started as a trial user.
async function app(t,fsys,config){
  const s=await launch(t,{fsys,config});
  await s.click('まずは体験してみる');await s.click('まずは体験してみる');
  await s.click('🚶 ウォーキング');await s.click('週1〜2回');await s.click('次へ進む');
  s.fill('input[placeholder="例：ゆるパンダ"]','保存テスト');await s.click('はじめる');
  assert.ok(s.button('お部屋に遊びに行く'),'trial home reached');
  const record=async()=>{s.w.document.querySelector('.fab').click();await settle();await s.click('ランニング');await s.click('報告する ✓');};
  return {...s,record};
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
test('a failed device save is pending, not praised, and the automatic retry saves that one record once',async t=>{
  const fsys=fakeFilesystem();const s=await app(t,fsys,{saveRetryMs:400,saveWaitMs:1200});
  fsys.fail.write=true;
  await s.record();await settle(1500);
  assert.equal(s.w.document.querySelector('.pj-stage'),null,'no praise screen');
  const pending=s.w.document.getElementById('yt-native-save-error').textContent;
  assert.match(pending,/まだ完了していません/);assert.match(pending,/もう一度記録する必要はありません/);
  assert.equal(saved(fsys).reports.length,0,'the new record is not in the committed copy yet');
  // Storage recovers: the retry commits the pending record without the user entering it again.
  fsys.fail.write=false;
  for(let i=0;i<30&&saved(fsys).reports.length===0;i++)await settle(100);
  assert.equal(saved(fsys).reports.length,1,'exactly one record after failure and automatic retry');
  assert.equal(s.w.document.getElementById('yt-native-save-error'),null);
  assert.equal(s.w.document.getElementById('yt-native-save-ok').getAttribute('role'),'status');
  assert.match(s.w.document.getElementById('yt-native-save-ok').textContent,/保存しました/);
  assert.equal(s.w.document.querySelector('.pj-stage'),null,'the retried record is not praised a second time');
  // A new, separate record afterwards is saved and praised normally.
  await s.record();
  for(let i=0;i<30&&!s.w.document.querySelector('.pj-stage');i++)await settle(100);
  assert.ok(s.w.document.querySelector('.pj-stage'));assert.equal(saved(fsys).reports.length,2);
});
