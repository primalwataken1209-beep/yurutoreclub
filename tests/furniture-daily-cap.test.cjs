const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
const {source,compile}=require('./helpers.cjs');
const compiled=compile(source);
/* Furniture daily cap (furniture-daily-cap-20261103.txt):
   - exercise records are unlimited; NEW furniture is at most one per local day across all routes
   - the pick is the first eligible, not-yet-owned item in the existing order; eligible items wait for later days
   - owned furniture and its day are stored (memo.owned) and never removed; legacy data is migrated once
   - no grant on a day earlier than the last grant (clock moved back) */
const DAY=86400000;
const at=(y,m,d,h=10)=>new Date(y,m-1,d,h,0,0).getTime();
const D1=at(2026,11,3),D2=at(2026,11,4),D3=at(2026,11,5),D4=at(2026,11,6);
function setup(t,{stored={},now=D1}={}){
  const dom=new JSDOM(fs.readFileSync('index.html','utf8'),{url:'http://offline.invalid/',runScripts:'outside-only',pretendToBeVisual:true});
  t.after(()=>dom.window.close());
  const w=dom.window,errors=[];
  for(const [k,v] of Object.entries({yurutore_language:'ja',...stored}))w.localStorage.setItem(k,v);
  const clock={now};const Real=w.Date;
  class FakeDate extends Real{constructor(...a){if(a.length)super(...a);else super(clock.now);}static now(){return clock.now;}}
  w.Date=FakeDate;
  const denied=()=>{throw Error('No network');};
  w.fetch=denied;w.XMLHttpRequest=function(){denied();};w.WebSocket=function(){denied();};
  w.matchMedia=()=>({matches:false,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){}});
  w.addEventListener('error',e=>errors.push(e.message));
  for(const [pkg,file] of [['react','react.production.min.js'],['react-dom','react-dom.production.min.js']])
    w.eval(fs.readFileSync(path.join(path.dirname(require.resolve(pkg+'/package.json')),'umd',file),'utf8'));
  w.eval(compiled);
  const memo=uid=>JSON.parse(w.localStorage.getItem('yurutore_room_seen_unlocks_v1_'+(uid||'guest'))||'null');
  const ownedIds=uid=>(memo(uid)?.owned||[]).map(o=>o.id);
  const commit=st=>w.room30Furniture(st,w.calcStreak(st.reports||[]),true);
  const snapshot=()=>Object.fromEntries(Object.keys(w.localStorage).map(k=>[k,w.localStorage.getItem(k)]));
  return {w,clock,memo,ownedIds,commit,snapshot,errors};
}
// jsdom arrays are from another realm: compare plain copies.
const plain=x=>JSON.parse(JSON.stringify(x));
const rec=(ts,aid='walk',extra={})=>({id:'r'+ts+Math.random(),aid,note:'',photo:null,ts,...extra});
const state=(reports,auth='guest',extra={})=>({auth,reports,completedMissions:{},missionHistory:[],pandaPoints:0,pandaChats:[],timeCapsules:[],...extra});
const many=(n,ts,aid='walk')=>Array.from({length:n},(_,i)=>rec(ts+i*60000,aid));

test('records are unlimited on one day but only one new piece of furniture arrives',async t=>{
  const s=setup(t);
  s.commit(state([]));                                   // first start with no records: nothing owned yet
  assert.deepEqual(s.ownedIds(),[]);
  for(const n of [1,2,20]){
    s.commit(state(many(n,D1)));
    assert.deepEqual(s.ownedIds(),['plant_large'],'after '+n+' records');
  }
  const items=s.w.room30Items(state(many(20,D1)),0);
  assert.deepEqual(plain(items.filter(i=>i.ok&&!i.always).map(i=>i.id)),['plant_large'],'list and room show only owned');
  assert.ok(items.find(i=>i.id==='cushion').waiting,'eligible but capped items are marked as waiting');
  assert.equal(items.find(i=>i.id==='wall_garland').waiting,false,'unmet conditions are not waiting');
});
test('waiting items arrive one per day in the existing order, without new records',async t=>{
  const s=setup(t);s.commit(state([]));
  const st=state(many(20,D1));s.commit(st);
  s.clock.now=D2;s.commit(st);assert.deepEqual(s.ownedIds(),['plant_large','cushion']);
  s.commit(st);s.commit(st);assert.equal(s.ownedIds().length,2,'repeated evaluation on the same day');
  s.clock.now=D3;s.commit(st);assert.deepEqual(s.ownedIds(),['plant_large','cushion','pawmat']);
  assert.deepEqual(s.memo().owned.map(o=>o.day),[20261103,20261104,20261105]);
});
test('several conditions met by one record still give one piece',async t=>{
  const s=setup(t);s.commit(state([]));
  const night=at(2026,11,3,22);
  s.commit(state([rec(night,'walk',{note:'ラーメン 旅行',photo:{w:10,h:10}})]));
  assert.equal(s.ownedIds().length,1);
});
test('restarting the app on the same day does not give another piece',async t=>{
  const a=setup(t);a.commit(state([]));a.commit(state(many(5,D1)));
  const b=setup(t,{stored:a.snapshot(),now:D1+3600000});
  b.commit(state(many(5,D1)));b.commit(state(many(6,D1)));
  assert.deepEqual(b.ownedIds(),['plant_large']);
  const c=setup(t,{stored:b.snapshot(),now:D2});   // restart across midnight
  c.commit(state(many(6,D1)));
  assert.deepEqual(c.ownedIds(),['plant_large','cushion']);
});
test('moving the clock back gives nothing until the day after the last grant',async t=>{
  const s=setup(t);s.commit(state([]));const st=state(many(20,D1));
  s.clock.now=D3;s.commit(st);assert.equal(s.ownedIds().length,1);
  s.clock.now=D2;s.commit(st);s.clock.now=D1;s.commit(st);assert.equal(s.ownedIds().length,1,'earlier days give nothing');
  s.clock.now=D3+3600000;s.commit(st);assert.equal(s.ownedIds().length,1,'same day as last grant');
  s.clock.now=D4;s.commit(st);assert.equal(s.ownedIds().length,2);
});
test('legacy data keeps everything it showed as unlocked, once, and migration is idempotent',async t=>{
  // Old memo (no owned) with old IDs, and 30 records: the old version showed every eligible item as unlocked.
  const old={seen:['plant_large'],everOk:['plant_large','mat','sofa']};
  const s=setup(t,{stored:{yurutore_room_seen_unlocks_v1_guest:JSON.stringify(old)}});
  const st=state(many(30,D1-40*DAY));
  const before=s.w.room30Eligibility(st,0).filter(i=>i.ok&&!i.always).map(i=>i.id);
  s.commit(st);
  const kept=s.ownedIds();
  for(const id of [...before.filter(id=>id!=='storagebox'),'pawmat','sofa'])assert.ok(kept.includes(id),'kept '+id);
  assert.ok(s.memo().owned.filter(o=>before.includes(o.id)||o.id==='pawmat'||o.id==='sofa').every(o=>o.day===0),'migrated items do not use the daily cap');
  assert.deepEqual(s.memo().seen,['plant_large'],'seen is preserved (no modal flood decision changed)');
  assert.ok(s.memo().owned.filter(o=>o.day!==0).length<=1,'at most one new piece on the migration day');
  s.commit(st);s.commit(st);
  assert.deepEqual(plain(s.ownedIds()),plain(kept),'repeat migration/commit changes nothing the same day');
});
test('legacy data without any memo keeps what the old version displayed',async t=>{
  const s=setup(t);
  const st=state(many(12,D1-20*DAY));
  const shown=s.w.room30Eligibility(st,0).filter(i=>i.ok&&!i.always&&i.id!=='storagebox').map(i=>i.id);
  s.commit(st);
  for(const id of shown)assert.ok(s.ownedIds().includes(id),id);
});
test('deleting or editing records never removes owned furniture',async t=>{
  const s=setup(t);s.commit(state([]));
  s.commit(state(many(3,D1)));s.clock.now=D2;s.commit(state(many(3,D1)));
  const owned=s.ownedIds();
  s.commit(state([]));
  assert.deepEqual(plain(s.ownedIds()),plain(owned));
  assert.deepEqual(plain(s.w.room30Items(state([]),0).filter(i=>i.ok&&!i.always).map(i=>i.id)),plain(owned));
});
test('accounts and the trial keep separate furniture and separate daily caps',async t=>{
  const s=setup(t);
  s.commit(state([],'guest'));s.commit(state([],'user-a'));s.commit(state([],'user-b'));
  s.commit(state(many(5,D1),'guest'));s.commit(state(many(5,D1),'user-a'));
  assert.deepEqual(s.ownedIds('guest'),['plant_large']);assert.deepEqual(s.ownedIds('user-a'),['plant_large']);
  assert.deepEqual(s.ownedIds('user-b'),[]);
});
test('a failed save is not counted: the same piece is offered again and still at most one per day',async t=>{
  const s=setup(t);s.commit(state([]));
  const orig=s.w.Storage.prototype.setItem;
  s.w.Storage.prototype.setItem=function(k,v){if(String(k).startsWith('yurutore_room_seen_unlocks_v1_'))throw new Error('quota');return orig.call(this,k,v);};
  const st=state(many(20,D1));
  s.commit(st);s.commit(st);
  assert.deepEqual(s.ownedIds(),[],'nothing was stored');
  assert.deepEqual(plain(s.w.room30Items(st,0).filter(i=>i.ok&&!i.always).map(i=>i.id)),['plant_large'],'display offers the same single piece');
  s.w.Storage.prototype.setItem=orig;s.commit(st);
  assert.deepEqual(s.ownedIds(),['plant_large']);
});
test('the storage box needs five owned pieces, not five eligible ones',async t=>{
  const s=setup(t);s.commit(state([]));
  const st=state(many(30,D1));s.commit(st);
  assert.ok(!s.ownedIds().includes('storagebox'));
  const sb=s.w.room30Items(st,0).find(i=>i.id==='storagebox');assert.equal(sb.ok,false);assert.equal(sb.waiting,false);
});
test('with five owned pieces the storage box becomes eligible and arrives as that day\'s piece',async t=>{
  const owned=['plant_large','cushion','pawmat','floorlamp','photoframe'].map(id=>({id,day:20261101}));
  const memo={seen:owned.map(o=>o.id),everOk:owned.map(o=>o.id),owned,lastGrantDay:20261101};
  const s=setup(t,{stored:{yurutore_room_seen_unlocks_v1_guest:JSON.stringify(memo)}});
  const st=state([]);
  assert.equal(s.w.room30Items(st,0).find(i=>i.id==='storagebox').ok,true,'offered today');
  s.commit(st);
  assert.deepEqual(plain(s.ownedIds().slice(-1)),['storagebox']);assert.equal(s.ownedIds().length,6);
});
test('the praise screen announces new furniture only once on a day with several records',async t=>{
  const s=setup(t);const w=s.w;const settle=()=>new Promise(r=>setTimeout(r,150));await settle();
  const button=label=>[...w.document.querySelectorAll('button')].find(b=>b.textContent.replace(/\s+/g,'').includes(label.replace(/\s+/g,'')));
  const click=async label=>{const b=button(label);assert.ok(b,'button '+label);b.click();await settle();};
  const fill=(sel,v)=>{const el=w.document.querySelector(sel);Object.getOwnPropertyDescriptor(w.HTMLInputElement.prototype,'value').set.call(el,v);el.dispatchEvent(new w.Event('input',{bubbles:true}));};
  await click('まずは体験してみる');await click('まずは体験してみる');
  await click('🚶 ウォーキング');await click('週1〜2回');await click('次へ進む');
  fill('input[placeholder="例：ゆるパンダ"]','家具テスト');await click('はじめる');
  const announced=[];
  for(let i=0;i<4;i++){
    s.clock.now+=60000;
    w.document.querySelector('.fab').click();await settle();await click('ウォーキング');await click('報告する ✓');
    w.document.querySelector('.pj-stage').click();await settle();   // the furniture note appears once the praise advances
    const room=w.document.querySelector('.pj-room-t');announced.push(room?room.textContent:'');
    await click('ホームへ戻る');
  }
  assert.equal(announced.filter(Boolean).length,1,JSON.stringify(announced));
  assert.match(announced[0],/観葉植物\(大\)/);
  const key=Object.keys(w.localStorage).find(k=>k.startsWith('yurutore-v6-')&&k.endsWith('-guest'));
  assert.equal(JSON.parse(w.localStorage.getItem(key)).reports.length,4,'all four records kept');
  assert.deepEqual(s.ownedIds(),['plant_large'],'stored state matches what was announced');
  assert.deepEqual(s.errors,[]);
});
