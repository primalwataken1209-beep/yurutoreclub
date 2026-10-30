const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {launch,staging,settle}=require('./app-harness.cjs');
const SUPA='https://knftduojdalnawvkbelt.supabase.co',CALLBACK='club.yurutore.dev.placeholder://auth/callback';
// Code-level checks only: no Apple Developer account, Services ID, key or Supabase provider exists yet.
async function signInScreen(t,opts){
  const s=await launch(t,opts);
  await s.click(opts.lang==='en'?'Log in or sign up':'ログイン・新規登録はこちら');
  return s;
}
const appleButton=s=>s.w.document.querySelector('button.yt-apple-signin');

test('default builds have no Apple sign-in anywhere',async t=>{
  const cfg=fs.readFileSync(path.join(staging(),'native-config.js'),'utf8');
  assert.match(cfg,/"oauthProviders":\["google"\]/);
  const s=await signInScreen(t,{platform:'ios'});
  assert.ok(s.button('Googleでログイン'));assert.equal(appleButton(s),null);
  assert.match(String((await s.w.YT_NATIVE.oauthSignIn('apple')).error.message),/not enabled/);
});
test('an Apple-enabled build shows the button on iOS only',async t=>{
  assert.match(fs.readFileSync(path.join(staging({apple:true}),'native-config.js'),'utf8'),/"oauthProviders":\["google","apple"\]/);
  const android=await signInScreen(t,{platform:'android',apple:true});
  assert.equal(appleButton(android),null,'not on Android');
  const ios=await signInScreen(t,{platform:'ios',apple:true});
  assert.equal(appleButton(ios).textContent,'Appleでサインイン');
  const en=await signInScreen(t,{platform:'ios',apple:true,lang:'en'});
  assert.equal(appleButton(en).textContent,'Sign in with Apple');
});
test('Apple sign-up keeps the 13+ check, then opens the PKCE browser flow with the exact callback',async t=>{
  const s=await signInScreen(t,{platform:'ios',apple:true});
  await s.click('新規登録');
  appleButton(s).click();await settle();
  assert.match(s.w.document.getElementById('root').textContent,/13歳以上の方のみ登録できます/);
  assert.equal(s.log.open.length,0);
  const age=[...s.w.document.querySelectorAll('input[type=checkbox]')][0];age.click();await settle();
  appleButton(s).click();await settle(300);
  assert.equal(s.log.open.length,1);
  const u=new URL(s.log.open[0]);
  assert.equal(u.origin+u.pathname,SUPA+'/auth/v1/authorize');assert.equal(u.searchParams.get('provider'),'apple');
  assert.equal(u.searchParams.get('redirect_to'),CALLBACK);assert.equal(u.searchParams.get('code_challenge_method'),'s256');
  assert.deepEqual(s.remote,[]);
});
test('a failure to start Apple sign-in shows an Apple message, not the Google one',async t=>{
  const s=await signInScreen(t,{platform:'ios',apple:true});
  await s.click('ログイン');
  s.w.capacitorBrowser.Browser.open=async()=>{throw new Error('no browser');};
  appleButton(s).click();await settle(300);
  const text=s.w.document.getElementById('root').textContent;
  assert.match(text,/Appleでのサインインを開始できませんでした/);assert.doesNotMatch(text,/Googleログインの設定確認/);
});
