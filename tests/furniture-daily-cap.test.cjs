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
/* Save failures (Work review furniture-work-review-20261103.txt). While the furniture memo cannot be saved, no new
   piece is shown or counted; records still save. The session keeps what it knows, so failures never re-run the
   migration. Records made by this version carry fc:1 and never count as legacy. When saving works again, that
   day's one piece arrives. */
const failSaves=s=>{const orig=s.w.Storage.prototype.setItem;
  s.w.Storage.prototype.setItem=function(k,v){if(String(k).startsWith('yurutore_room_seen_unlocks_v1_'))throw new Error('quota');return orig.call(this,k,v);};
  return ()=>{s.w.Storage.prototype.setItem=orig;};};
const shown=(s,st)=>plain(s.w.room30Items(st,0).filter(i=>i.ok&&!i.always).map(i=>i.id));
const app=(n,ts)=>many(n,ts).map(r=>({...r,fc:1}));   // records made by this version
test('a failed save is not counted: nothing new is shown while saving fails, one piece once it works',async t=>{
  const s=setup(t);s.commit(state([]));
  const restore=failSaves(s);
  const st=state(app(20,D1));
  s.commit(st);s.commit(st);
  assert.deepEqual(s.ownedIds(),[],'nothing was stored');
  assert.deepEqual(shown(s,st),[],'nothing new is shown while the save fails');
  restore();s.commit(st);
  assert.deepEqual(s.ownedIds(),['plant_large']);assert.deepEqual(shown(s,st),['plant_large']);
});
test('Work review: a failed FIRST save does not turn later earnings into legacy furniture (same session)',async t=>{
  const s=setup(t);failSaves(s);
  s.commit(state([]));
  for(const st of [state(many(20,D1)),state(app(20,D1))]){
    s.commit(st);s.commit(st);
    assert.ok(shown(s,st).length<=1,'cap exceeded: '+shown(s,st).join(','));
    assert.deepEqual(shown(s,st),[]);
  }
});
test('Work review: after a restart with saves still failing, records made by this version are not legacy',async t=>{
  const a=setup(t);failSaves(a);a.commit(state([]));a.commit(state(app(20,D1)));
  const b=setup(t,{stored:a.snapshot(),now:D1+3600000});   // memo was never stored
  const restore=failSaves(b);
  const st=state(app(25,D1));
  b.commit(st);assert.deepEqual(shown(b,st),[],'no migration from records made by this version');
  restore();b.commit(st);
  assert.deepEqual(b.ownedIds(),['plant_large'],'one piece once saving works');
});
test('Work review: a legacy user whose saves fail keeps what the old version showed, and gains nothing more',async t=>{
  const s=setup(t);const restore=failSaves(s);
  const legacy=many(12,D1-20*DAY);
  const old=plain(s.w.room30Eligibility(state(legacy),0).filter(i=>i.ok&&!i.always&&i.id!=='storagebox').map(i=>i.id));
  s.commit(state(legacy));
  assert.deepEqual(shown(s,state(legacy)).filter(id=>id!=='storagebox'),old,'old display kept');
  const more=state([...legacy,...app(30,D1)]);
  for(let i=0;i<5;i++)s.commit(more);
  const kept=shown(s,state(legacy));
  assert.deepEqual(shown(s,more),kept,'new records add nothing while saves fail');
  restore();s.commit(more);
  assert.equal(s.ownedIds().length,kept.length+1,'legacy set plus one piece for today');
  for(const id of kept)assert.ok(s.ownedIds().includes(id),'kept '+id);
});
test('a stale saved day and a same-day restart give exactly one piece for today',async t=>{
  const s=setup(t);s.commit(state([]));s.commit(state(app(20,D1)));
  s.clock.now=D2;const restore=failSaves(s);s.commit(state(app(20,D1)));restore();
  const b=setup(t,{stored:s.snapshot(),now:D2+3600000});   // stored lastGrantDay is still yesterday
  b.commit(state(app(20,D1)));b.commit(state(app(20,D1)));
  assert.deepEqual(b.ownedIds(),['plant_large','cushion']);
  const c=setup(t,{stored:b.snapshot(),now:D2+7200000});c.commit(state(app(20,D1)));
  assert.deepEqual(c.ownedIds(),['plant_large','cushion'],'no second piece after another restart');
});
test('Work review addendum: seen and everOk written by the room survive the next day\'s grant',async t=>{
  const s=setup(t);s.commit(state([]));const st=state(app(20,D1));s.commit(st);
  const m=s.memo();m.seen.push('plant_large');m.everOk.push('crown');s.w.saveRoomUnlockMemo('guest',m);  // closing the modal, a memory
  s.clock.now=D2;s.commit(st);
  assert.ok(s.memo().seen.includes('plant_large'),'acknowledged piece stays seen');
  assert.ok(!s.memo().seen.includes('cushion'),'the new piece is still to be shown');
  assert.ok(s.memo().everOk.includes('crown'),'non-furniture entries survive');
  assert.deepEqual(s.ownedIds(),['plant_large','cushion']);
});
test('while saves fail, entries the room managed to save are merged, not overwritten',async t=>{
  const s=setup(t);s.commit(state([]));const st=state(app(20,D1));s.commit(st);
  const restore=failSaves(s);s.clock.now=D2;s.commit(st);   // today's grant cannot be saved
  restore();
  const m=s.memo();m.seen.push('plant_large');m.everOk.push('crown');s.w.saveRoomUnlockMemo('guest',m);
  s.commit(st);
  const after=s.memo();
  assert.ok(after.seen.includes('plant_large')&&after.everOk.includes('crown'));
  assert.deepEqual(plain(after.owned.map(o=>o.id)),['plant_large','cushion'],'today\'s one piece once saving works');
});
/* The home room and the full room each keep an unlock queue, so a piece can be announced once per room view.
   That duplication already exists in 5289aba (it announced 5 dialogs for 3 pieces); this test checks which pieces
   are announced and that seen survives the next day's grant. */
test('closing the unlock modal in the room, then the next day\'s piece: only the new piece is announced, seen kept',async t=>{
  const s=setup(t);const w=s.w;const settle=()=>new Promise(r=>setTimeout(r,150));await settle();
  const button=label=>[...w.document.querySelectorAll('button')].find(b=>b.textContent.replace(/\s+/g,'').includes(label.replace(/\s+/g,'')));
  const click=async label=>{const b=button(label);assert.ok(b,'button '+label);b.click();await settle();};
  const fill=(sel,v)=>{const el=w.document.querySelector(sel);Object.getOwnPropertyDescriptor(w.HTMLInputElement.prototype,'value').set.call(el,v);el.dispatchEvent(new w.Event('input',{bubbles:true}));};
  const record=async()=>{s.clock.now+=60000;w.document.querySelector('.fab').click();await settle();await click('ウォーキング');await click('報告する ✓');
    w.document.querySelector('.pj-stage').click();await settle();await click('ホームへ戻る');};
  const names={plant_large:'観葉植物(大)',cushion:'ドット柄クッション',pawmat:'肉球ラグ'};
  // Closes every unlock dialog on screen and returns which pieces they announced.
  const closeAll=async()=>{const seen=new Set();for(let i=0;i<10;i++){const b=w.document.querySelector('.room-modal-btn');if(!b)break;
    const text=b.closest('[role=dialog]').textContent;for(const [id,n] of Object.entries(names))if(text.includes(n))seen.add(id);
    assert.doesNotMatch(text,/まるいラグ|ローテーブル|まるい座布団/,'pieces present from the start are not announced');b.click();await settle();}
    return [...seen].sort();};
  await click('まずは体験してみる');await click('まずは体験してみる');
  await click('🚶 ウォーキング');await click('週1〜2回');await click('次へ進む');
  fill('input[placeholder="例：ゆるパンダ"]','演出テスト');await click('はじめる');
  for(let i=0;i<3;i++)await record();                                   // day 1: three records, one piece
  const day1=await closeAll();await click('お部屋に遊びに行く');day1.push(...await closeAll());
  assert.deepEqual([...new Set(day1)],['plant_large'],'day 1 announces only the first piece');
  assert.ok(s.memo().seen.includes('plant_large'));
  await click('ホームへ戻る');await closeAll();
  s.clock.now=D2;await record();                                        // day 2: the next waiting piece
  assert.ok(s.memo().seen.includes('plant_large'),'seen kept after the next day\'s grant');
  const day2=await closeAll();await click('お部屋に遊びに行く');day2.push(...await closeAll());
  assert.deepEqual([...new Set(day2)],['cushion'],'day 2 announces only the new piece');
  const after=s.memo();
  assert.ok(after.seen.includes('plant_large')&&after.seen.includes('cushion'));
  assert.deepEqual(s.ownedIds(),['plant_large','cushion']);assert.deepEqual(s.errors,[]);
});
test('starting a fresh trial clears the furniture kept for the previous trial in this session',async t=>{
  const s=setup(t);s.commit(state([]));s.commit(state(app(3,D1)));
  assert.deepEqual(shown(s,state(app(3,D1))),['plant_large']);
  s.w.ytResetGuestRoomIfFresh(state([]));
  s.commit(state([]));
  assert.deepEqual(shown(s,state([])),[]);assert.deepEqual(s.ownedIds(),[]);
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
  const saved=JSON.parse(w.localStorage.getItem(key)).reports;
  assert.equal(saved.length,4,'all four records kept');
  assert.ok(saved.every(r=>r.fc===1),'records made by this version are marked and never count as legacy');
  assert.deepEqual(s.ownedIds(),['plant_large'],'stored state matches what was announced');
  assert.deepEqual(s.errors,[]);
});
