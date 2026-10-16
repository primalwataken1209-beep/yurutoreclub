const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const { source, compile } = require('./helpers.cjs');
test('welcome screen renders and trial entry responds without network access',async t=>{
  // outside-only never loads remote scripts, images, CSS, or Supabase SDK.
  const dom=new JSDOM(fs.readFileSync('index.html','utf8'),{url:'http://offline.invalid/',runScripts:'outside-only',pretendToBeVisual:true});
  t.after(()=>dom.window.close());
  const w=dom.window; const attempts=[]; const errors=[];
  const denied=(url)=>{attempts.push(String(url));throw new Error('Network disabled in smoke test');};
  w.fetch=denied;w.XMLHttpRequest=function(){denied('XMLHttpRequest');};w.WebSocket=function(){denied('WebSocket');};
  w.addEventListener('error',e=>errors.push(e.error));
  w.matchMedia=()=>({matches:false,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){}});
  for(const [pkg,file] of [['react','react.production.min.js'],['react-dom','react-dom.production.min.js']]) {
    w.eval(fs.readFileSync(path.join(path.dirname(require.resolve(pkg+'/package.json')),'umd',file),'utf8'));
  }
  w.eval(compile(source));
  const settle=()=>new Promise(r=>setTimeout(r,150));await settle();
  assert.equal(w.document.querySelectorAll('.frame-ios,.frame-android').length,1);
  const buttons=()=>[...w.document.querySelectorAll('button')];
  buttons().find(b=>b.textContent==='日本語')?.click();await settle();
  const trial=buttons().find(b=>b.textContent.includes('まずは体験'));
  assert.ok(trial,'trial button visible: '+w.document.getElementById('root').textContent);
  const before=w.document.getElementById('root').textContent;
  trial.click();await settle();
  assert.notEqual(w.document.getElementById('root').textContent,before);
  assert.deepEqual(errors,[]);assert.deepEqual(attempts,[]);
});
