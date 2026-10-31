const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
const {source,compile}=require('./helpers.cjs');
const compiled=compile(source);
const ME='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',OTHER='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
// In-memory stand-in for the Supabase SDK: no network, no project, no keys.
function fakeSupabase(inserts,insertError){
  const chain=value=>{const p=new Proxy(function(){},{get:(_,k)=>k==='then'?(ok,ng)=>Promise.resolve(value).then(ok,ng):p,apply:()=>p});return p;};
  const auth=new Proxy({},{get:(_,k)=>k==='onAuthStateChange'?()=>({data:{subscription:{unsubscribe(){}}}}):()=>Promise.resolve({data:{session:null,user:null},error:null})});
  return {createClient:()=>({auth,storage:chain({data:null,error:null}),rpc:()=>chain({data:null,error:null}),
    from:table=>table==='reports'
      ?{insert:row=>{inserts.push(row);return Promise.resolve({data:null,error:insertError||null});}}
      :chain({data:[],error:null,count:0})})};
}
async function setup(t,lang='ja',insertError){
  const dom=new JSDOM(fs.readFileSync('index.html','utf8'),{url:'http://offline.invalid/',runScripts:'outside-only',pretendToBeVisual:true});t.after(()=>dom.window.close());
  const w=dom.window,inserts=[],toasts=[],errors=[],attempts=[];
  w.localStorage.setItem('yurutore_language',lang);
  const denied=url=>{attempts.push(String(url));throw Error('No network');};
  w.fetch=denied;w.XMLHttpRequest=function(){denied('XMLHttpRequest');};w.WebSocket=function(){denied('WebSocket');};
  w.matchMedia=()=>({matches:false,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){}});
  w.addEventListener('error',e=>errors.push(e.message));
  w.supabase=fakeSupabase(inserts,insertError);
  for(const [pkg,file] of [['react','react.production.min.js'],['react-dom','react-dom.production.min.js']])w.eval(fs.readFileSync(path.join(path.dirname(require.resolve(pkg+'/package.json')),'umd',file),'utf8'));
  w.eval(compiled);
  const settle=()=>new Promise(r=>setTimeout(r,150));await settle();
  w.__toast=m=>toasts.push(m);
  w.eval(`window.__show=(userId,auth)=>{const el=document.createElement('div');el.id='screen';document.body.appendChild(el);
    ReactDOM.createRoot(el).render(React.createElement(SnsUserScreen,{userId,state:{auth,user:{name:'me'}},onClose(){},onOpenUser(){},showToast:window.__toast}));};`);
  const screen=()=>w.document.getElementById('screen');
  const button=label=>[...screen().querySelectorAll('button')].find(b=>b.textContent.includes(label));
  const show=async(userId,auth)=>{w.__show(userId,auth);await settle();};
  return {w,inserts,toasts,errors,attempts,settle,screen,button,show};
}
test('another user can be reported from their profile in Japanese',async t=>{
  const s=await setup(t);await s.show(OTHER,ME);
  assert.ok(s.button('このユーザーをブロック'),'profile ready: '+s.screen().textContent.slice(0,200));
  s.button('このユーザーを通報').click();await s.settle();
  s.button('通報する').click();await s.settle();
  assert.match(s.screen().textContent,/理由をひとつ選んでね/);assert.equal(s.inserts.length,0);
  s.button('スパム').click();await s.settle();
  [...s.screen().querySelectorAll('button')].filter(b=>b.textContent==='通報する').pop().click();await s.settle();
  assert.deepEqual(JSON.parse(JSON.stringify(s.inserts)),[{reporter_user_id:ME,target_type:'user',target_id:OTHER,reason:'spam',note:null}]);
  assert.deepEqual(s.toasts,['通報を受け付けたよ。ありがとう🐼']);
  assert.equal(s.screen().querySelector('.sheet'),null);
  assert.deepEqual(s.errors,[]);assert.deepEqual(s.attempts,[]);
});
test('English labels and duplicate message for user reports',async t=>{
  const s=await setup(t,'en',{code:'23505',message:'duplicate key value'});await s.show(OTHER,ME);
  s.button('Report user').click();await s.settle();
  s.button('Spam').click();await s.settle();
  s.button('Send report').click();await s.settle();
  assert.equal(s.inserts.length,1);
  assert.match(s.screen().textContent,/You have already reported this user/);
  assert.deepEqual(s.toasts,[]);
});
test('database rejection keeps the sheet open with the failure message',async t=>{
  const s=await setup(t,'ja',{code:'23514',message:'violates check constraint'});await s.show(OTHER,ME);
  s.button('このユーザーを通報').click();await s.settle();
  s.button('嫌がらせ').click();await s.settle();
  [...s.screen().querySelectorAll('button')].filter(b=>b.textContent==='通報する').pop().click();await s.settle();
  assert.match(s.screen().textContent,/通報を送れなかったみたい/);
  assert.ok(s.screen().querySelector('.sheet'));
});
test('own profile and trial users get no user report button',async t=>{
  const own=await setup(t);await own.show(ME,ME);
  assert.equal(own.button('このユーザーを通報'),undefined);
  const guest=await setup(t);await guest.show(OTHER,'guest');
  assert.equal(guest.button('このユーザーを通報'),undefined);
});
test('snsCreateReport refuses self reports and unknown types before contacting the database',async t=>{
  const s=await setup(t);
  for(const args of [[ME,{targetType:'user',targetId:ME,reason:'spam'}],[ME,{targetType:'profile',targetId:OTHER,reason:'spam'}],
                     ['guest',{targetType:'user',targetId:OTHER,reason:'spam'}],[ME,{targetType:'user',targetId:OTHER,reason:'nope'}]]){
    const r=await s.w.snsCreateReport(...args);
    assert.ok(r.error,JSON.stringify(args));
  }
  assert.equal(s.inserts.length,0);
});
