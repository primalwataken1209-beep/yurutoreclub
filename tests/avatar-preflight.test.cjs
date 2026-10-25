const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
function setup(options={}){
  const calls=[], revoked=[];let viewer='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const sdk={auth:{getSession:async()=>({data:{session:viewer?{user:{id:viewer}}:null}})},storage:{from:bucket=>({
    download:async p=>{calls.push(['download',bucket,p]);return options.download?options.download():{data:{fake:true},error:null};},
    upload:async(p,b,o)=>{calls.push(['upload',bucket,p]);return {error:null};},
    remove:async p=>{calls.push(['remove',bucket,p]);return {error:options.removeError||null};}
  })}};
  const start=source.indexOf("const AVATAR_BUCKET=");
  const end=source.indexOf('function SnsAvatar(',start);
  assert.ok(start>0&&end>start);
  const restStart=source.indexOf('async function uploadAvatarToSupabase(',end);
  const restEnd=source.indexOf('// プロフィールをSupabaseのprofilesテーブルへ保存',restStart);
  const ctx=vm.createContext({supabaseClient:sdk,SUPABASE_URL:'https://eszheiabjwehcbrteqza.supabase.co',
    Date,Set,Promise,setTimeout,clearTimeout,dataUrlToBlob:()=>({fake:true}),URL:{createObjectURL:()=> 'blob:test-'+calls.length,revokeObjectURL:u=>revoked.push(u)}});
  vm.runInContext(source.slice(start,end)+source.slice(restStart,restEnd)+';globalThis.api={avatarRefFromValue,loadAvatarEntry,avatarResetCache,uploadAvatarToSupabase,removeAvatarFromSupabase,selfAvatarLocal};',ctx);
  return {api:ctx.api,calls,revoked,setViewer:v=>{viewer=v;}};
}
const uid='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ref='avatars/'+uid+'/avatar.jpg?v=123';
test('only strict references and same-project legacy avatar URLs are accepted',()=>{
  const {api}=setup();assert.equal(api.avatarRefFromValue(ref).path,uid+'/avatar.jpg');
  assert.ok(api.avatarRefFromValue('https://eszheiabjwehcbrteqza.supabase.co/storage/v1/object/public/'+ref));
  for(const v of ['https://evil.test/avatar.jpg','avatars/'+uid+'/../avatar.jpg',ref+'&evil=1','javascript:alert(1)'])assert.equal(api.avatarRefFromValue(v),null);
});
test('anonymous viewers do not download',async()=>{const x=setup();x.setViewer(null);assert.equal((await x.api.loadAvatarEntry(ref)).url,null);assert.equal(x.calls.length,0);});
test('repeated authenticated reads share the cached result',async()=>{const x=setup();const a=await x.api.loadAvatarEntry(ref);assert.equal((await x.api.loadAvatarEntry(ref)).url,a.url);assert.equal(x.calls.length,1);});
test('logout revokes blobs and another viewer downloads independently',async()=>{const x=setup();await x.api.loadAvatarEntry(ref);x.api.avatarResetCache(null);assert.equal(x.revoked.length,1);x.setViewer('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');await x.api.loadAvatarEntry(ref);assert.equal(x.calls.length,2);});
test('a response from the previous viewer is discarded',async()=>{let finish;const x=setup({download:()=>new Promise(r=>{finish=r;})});const pending=x.api.loadAvatarEntry(ref);await new Promise(r=>setImmediate(r));x.api.avatarResetCache(null);finish({data:{fake:true},error:null});assert.equal((await pending).url,null);});
test('failed downloads are cached to avoid repeated requests',async()=>{const x=setup({download:async()=>({error:new Error('denied'),data:null})});assert.equal((await x.api.loadAvatarEntry(ref)).url,null);await x.api.loadAvatarEntry(ref);assert.equal(x.calls.length,1);});
test('uploads return private references instead of public URLs',async()=>{const x=setup();const value=await x.api.uploadAvatarToSupabase(uid,'data:image/jpeg;base64,eA==');assert.ok(value.startsWith('avatars/'+uid+'/avatar.jpg?v='));assert.ok(!value.includes('https:'));});
test('deletion failures are surfaced; successful removal clears cached blobs',async()=>{const bad=setup({removeError:new Error('offline')});assert.equal(await bad.api.removeAvatarFromSupabase(uid),false);const x=setup();await x.api.loadAvatarEntry(ref);assert.equal(await x.api.removeAvatarFromSupabase(uid),true);assert.equal(x.revoked.length,1);});
test('external avatars are local-only and staging configuration was not transplanted',()=>{const x=setup();assert.equal(x.api.selfAvatarLocal({avatarUrl:'https://external.test/photo.jpg'}),'https://external.test/photo.jpg');assert.equal(x.api.avatarRefFromValue('https://external.test/photo.jpg'),null);assert.ok(!source.includes('knftduojdalnawvkbelt'));assert.ok(!source.includes('STAGING_GOOGLE_ENABLED'));});
test('the app stays below Babel auto-compact threshold',()=>{assert.ok(source.length<500000,'Babel reports its large-input note above 500000 characters');});

