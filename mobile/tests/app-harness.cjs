// Runs the whole built app in jsdom on a simulated native shell: the real vendored plugin wrappers
// register against in-memory native fakes (fakes.cjs). No device, no network, no keys.
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {JSDOM,ResourceLoader}=require('jsdom');
const {build}=require('../scripts/build-mobile.cjs');
const {fakeFilesystem,installNative,installCoreStub,CORE_STUB}=require('./fakes.cjs');
const mobile=path.resolve(__dirname,'..'),root=path.resolve(mobile,'..');
const KEY='sb_publishable_TESTONLY_not_a_real_key';
const settle=(ms=150)=>new Promise(r=>setTimeout(r,ms));
const builds={};
function staging({apple=false}={}){
  const id=apple?'apple':'plain';
  if(builds[id])return builds[id];
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'yt-app-'));
  process.on('exit',()=>fs.rmSync(dir,{recursive:true,force:true}));
  builds[id]=path.join(dir,'www');
  build({root,mobile,out:builds[id],target:'staging',apple,env:{YT_STAGING_PUBLISHABLE_KEY:KEY}});
  return builds[id];
}
async function launch(t,{fsys=fakeFilesystem(),platform='android',apple=false,lang='ja',fetch}={}){
  const out=staging({apple}),remote=[],errors=[],log={open:[],close:0,minimized:0,listeners:{}};
  class Bundle extends ResourceLoader{fetch(url){
    const u=new URL(url);if(u.origin!=='https://localhost'){remote.push(url);return null;}
    if(u.pathname==='/vendor/capacitor.js')return Promise.resolve(Buffer.from(CORE_STUB));
    const p=path.join(out,decodeURIComponent(u.pathname));
    return Promise.resolve(fs.readFileSync(p.endsWith(path.sep)?path.join(p,'index.html'):p));
  }}
  const dom=new JSDOM(fs.readFileSync(path.join(out,'index.html')),{url:'https://localhost/',runScripts:'dangerously',resources:new Bundle(),pretendToBeVisual:true,
    beforeParse(w){
      Object.defineProperty(w,'crypto',{value:require('node:crypto').webcrypto});w.TextEncoder=TextEncoder;
      w.localStorage.setItem('yurutore_language',lang);
      w.fetch=fetch||(()=>Promise.reject(new Error('offline')));
      w.matchMedia=()=>({matches:false,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){}});
      w.addEventListener('error',e=>errors.push(e.message));
      installNative(w,{platform,fsys,log});installCoreStub(w);
    }});
  t.after(()=>dom.window.close());
  const w=dom.window;
  for(let i=0;i<60&&!w.document.querySelector('#root button');i++)await settle(100);
  const button=label=>[...w.document.querySelectorAll('button')].find(b=>b.textContent.replace(/\s+/g,'').includes(label.replace(/\s+/g,'')));
  const click=async label=>{const b=button(label);assert.ok(b,'button '+label+': '+w.document.getElementById('root').textContent.slice(0,200));b.click();await settle();};
  const fill=(sel,v)=>{const el=w.document.querySelector(sel);Object.getOwnPropertyDescriptor(w.HTMLInputElement.prototype,'value').set.call(el,v);el.dispatchEvent(new w.Event('input',{bubbles:true}));};
  return {w,log,fsys,button,click,fill,errors,remote};
}
module.exports={launch,staging,settle,KEY};
