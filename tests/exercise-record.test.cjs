const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
const {source,compile}=require('./helpers.cjs');
const compiled=compile(source);
// Offline guest trial only: no Supabase SDK, no network, no real account.
async function setup(t,stored={}){
  const dom=new JSDOM(fs.readFileSync('index.html','utf8'),{url:'http://offline.invalid/',runScripts:'outside-only',pretendToBeVisual:true});t.after(()=>dom.window.close());
  const w=dom.window,attempts=[],errors=[];
  for(const [k,v] of Object.entries({yurutore_language:'ja',...stored}))w.localStorage.setItem(k,v);
  const denied=url=>{attempts.push(String(url));throw Error('No network');};
  w.fetch=denied;w.XMLHttpRequest=function(){denied('XMLHttpRequest');};w.WebSocket=function(){denied('WebSocket');};
  w.matchMedia=()=>({matches:false,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){}});
  w.addEventListener('error',e=>errors.push(e.message));
  for(const [pkg,file] of [['react','react.production.min.js'],['react-dom','react-dom.production.min.js']])w.eval(fs.readFileSync(path.join(path.dirname(require.resolve(pkg+'/package.json')),'umd',file),'utf8'));
  w.eval(compiled);const settle=()=>new Promise(r=>setTimeout(r,150));await settle();
  const text=()=>w.document.getElementById('root').textContent;
  const button=label=>[...w.document.querySelectorAll('button')].find(b=>b.textContent.replace(/\s+/g,'').includes(label.replace(/\s+/g,'')));
  const click=async label=>{const b=button(label);assert.ok(b,'button '+label+' in: '+text().slice(0,300));b.click();await settle();};
  const fill=(selector,value)=>{const el=w.document.querySelector(selector);assert.ok(el,selector);const proto=el.tagName==='TEXTAREA'?w.HTMLTextAreaElement.prototype:w.HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(el,value);el.dispatchEvent(new w.Event('input',{bubbles:true}));};
  const saved=()=>{const keys=Object.keys(w.localStorage).filter(k=>k.startsWith('yurutore-v6-')&&k.endsWith('-guest'));assert.equal(keys.length,1,'one guest state: '+keys);return{key:keys[0],state:JSON.parse(w.localStorage.getItem(keys[0]))};};
  const snapshot=()=>Object.fromEntries(Object.keys(w.localStorage).map(k=>[k,w.localStorage.getItem(k)]));
  return{w,attempts,errors,settle,text,button,click,fill,saved,snapshot};
}
async function startTrial(s){
  await s.click('まずは体験してみる');await s.click('まずは体験してみる');
  await s.click('🚶 ウォーキング');await s.click('週1〜2回');await s.click('次へ進む');
  s.fill('input[placeholder="例：ゆるパンダ"]','記録テスト');await s.click('はじめる');
  assert.ok(s.button('お部屋に遊びに行く'),'trial home reached');
}
async function record(s,{act,note}){
  s.w.document.querySelector('.fab').click();await s.settle();
  const submit=s.button('報告する ✓');assert.ok(submit);assert.equal(submit.disabled,true,'activity is required');
  await s.click(act);if(note)s.fill('textarea.field',note);
  assert.equal(s.button('報告する ✓').disabled,false);await s.click('報告する ✓');
  const stage=s.w.document.querySelector('.pj-stage');assert.ok(stage,'praise screen shown');
  stage.click();await s.settle();
}
test('trial exercise record is saved with activity and note, then praised',async t=>{
  const s=await setup(t);await startTrial(s);
  assert.deepEqual(s.saved().state.reports,[]);
  await record(s,{act:'ランニング',note:'  公園を一周  '});
  const {reports}=s.saved().state;
  assert.equal(reports.length,1);
  assert.equal(reports[0].aid,'run');assert.equal(reports[0].note,'公園を一周');assert.equal(reports[0].photo,null);
  assert.ok(Math.abs(Date.now()-reports[0].ts)<60000);
  assert.match(s.text(),/記録できたね/);
  await s.click('ホームへ戻る');
  assert.ok(s.button('お部屋に遊びに行く'));
  assert.deepEqual(s.errors,[]);assert.deepEqual(s.attempts,[]);
});
test('cancelling the record sheet saves nothing',async t=>{
  const s=await setup(t);await startTrial(s);
  s.w.document.querySelector('.fab').click();await s.settle();
  await s.click('ストレッチ');s.fill('textarea.field','保存しない');
  await s.click('やめる');
  assert.equal(s.w.document.querySelector('.sheet'),null);
  assert.deepEqual(s.saved().state.reports,[]);
});
test('records survive reload and accumulate in order',async t=>{
  const first=await setup(t);await startTrial(first);
  await record(first,{act:'ウォーキング',note:'朝の散歩'});await first.click('ホームへ戻る');
  const second=await setup(t,first.snapshot());
  assert.ok(second.button('お部屋に遊びに行く'),'trial kept after reload');
  assert.equal(second.saved().state.reports.length,1);
  await record(second,{act:'ジム'});await second.click('ホームへ戻る');
  const {state}=second.saved();
  assert.deepEqual(state.reports.map(r=>r.aid),['walk','gym']);
  assert.equal(state.reports[1].note,'');
  assert.deepEqual(second.errors,[]);assert.deepEqual(second.attempts,[]);
});

