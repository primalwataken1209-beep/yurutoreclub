const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const source = fs.readFileSync('supabase/functions/delete-account/index.ts','utf8');
// Remove only the remote import. Execute the actual handler with a mock client.
const code = ts.transpileModule(source.replace(/^import .*createClient.*;\r?\n/m,''),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const uid = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
function setup({bucket, listError, removeError, invalidAuth=false, batches=0}={}) {
  let handler;
  const calls=[]; let pages=0;
  const client={
    auth:{getUser:async()=>({data:{user:invalidAuth?null:{id:uid}},error:null}),admin:{deleteUser:async id=>{calls.push(['auth',id]); return {error:null};}}},
    storage:{from(name){return {
      async list(id){assert.equal(id,uid); calls.push(['list',name]); if(name===bucket&&listError)return {error:listError};
        return {data:name==='post-images'&&pages++<batches?[{name:'photo.jpg',id:'object'}]:[],error:null};},
      async remove(paths){calls.push(['remove',name,Array.from(paths)]);return {error:name===bucket?removeError:null};}
    };}},
    from(name){return {delete(){return {eq:async(k,id)=>{calls.push(['db',name,k,id]);return {error:null};}};}}}
  };
  vm.runInNewContext(code,{Request,Response,console:{log(){},warn(){},error(){}},createClient:(url,key)=>{assert.equal(url,'http://offline.invalid');assert.equal(key,'fake-test-key');return client;},Deno:{env:{get:k=>k==='SUPABASE_URL'?'http://offline.invalid':'fake-test-key'},serve:fn=>handler=fn}},{timeout:5000});
  return {calls, async run(auth=true){const r=await handler(new Request('http://offline.invalid/delete',{method:'POST',headers:auth?{Authorization:'Bearer fake-token'}:{},body:JSON.stringify({user_id:'victim'})}));return {status:r.status,body:await r.json()};}};
}
for(const bucket of ['avatars','post-images']) {
  for(const message of ['Network error','permission denied','Internal server error']) test(`${bucket}: ${message} prevents DB/Auth deletion`,async()=>{
    const s=setup({bucket,listError:{message}});const r=await s.run();
    assert.equal(r.status,500); assert.equal(r.body.ok,false);
    assert.equal(s.calls.some(c=>['db','auth'].includes(c[0])),false);
  });
  test(`${bucket}: confirmed missing bucket may be skipped`,async()=>{
    const s=setup({bucket,listError:{message:'Bucket not found'}});assert.equal((await s.run()).body.ok,true);
  });
}
test('post-image removal failure prevents DB/Auth deletion',async()=>{
  const s=setup({bucket:'post-images',batches:1,removeError:{message:'denied'}});
  assert.equal((await s.run()).status,500);assert.equal(s.calls.some(c=>['db','auth'].includes(c[0])),false);
});
test('multiple image batches are removed before deleting authenticated user',async()=>{
  const s=setup({batches:2});assert.equal((await s.run()).body.ok,true);
  assert.equal(s.calls.filter(c=>c[0]==='remove').length,2);
  assert.deepEqual(s.calls.at(-1),['auth',uid]);
  assert.ok(s.calls.filter(c=>c[0]==='db').every(c=>c[3]===uid));
});
test('missing/invalid authentication never deletes data',async()=>{
  for(const invalidAuth of [false,true]) {const s=setup({invalidAuth});assert.equal((await s.run(invalidAuth)).status,401);assert.equal(s.calls.length,0);}
});
