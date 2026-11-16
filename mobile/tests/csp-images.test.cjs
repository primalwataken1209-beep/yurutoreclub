// The bundled app may show images only from itself, data:/blob: and the build's own Supabase project (private Storage reads).
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {staging}=require('./app-harness.cjs');
test('mobile CSP: no external image hosts (no googleusercontent)',()=>{
  for(const apple of [false,true]){
    const html=fs.readFileSync(path.join(staging({apple}),'index.html'),'utf8');
    const csp=(html.match(/http-equiv="Content-Security-Policy"\s+content="([^"]+)"/)||[])[1];
    assert.ok(csp,'CSP present');
    const img=csp.split(';').map(s=>s.trim()).find(s=>s.startsWith('img-src '));
    assert.equal(img,"img-src 'self' data: blob: https://knftduojdalnawvkbelt.supabase.co");
    assert.doesNotMatch(html,/googleusercontent/);
  }
});
