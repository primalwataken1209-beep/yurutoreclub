// iOS email-only build (--ios-email-only): no Google/Apple sign-in at all, email flows unchanged. jsdom, no network, no keys.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {build}=require('../scripts/build-mobile.cjs');
const {launch,staging,settle,KEY}=require('./app-harness.cjs');
const mobile=path.resolve(__dirname,'..'),root=path.resolve(mobile,'..');
const SUPA='https://knftduojdalnawvkbelt.supabase.co',CALLBACK='club.yurutore.app://auth/callback';
const EMAIL='input[placeholder="example@email.com"]';
const read=(dir,f)=>fs.readFileSync(path.join(dir,f),'utf8');
async function signInScreen(t,opts){const s=await launch(t,opts);await s.click('ログイン・新規登録はこちら');return s;}
const texts=s=>[...s.w.document.querySelectorAll('button')].map(b=>b.textContent.replace(/\s+/g,''));
// Records every request to the staging project; answers like Supabase would for these flows (no real service).
function fakeSupabase(){
  const calls=[];
  const fetch=async(url,init)=>{
    const u=new URL(String(url));calls.push({url:u,body:init&&init.body?String(init.body):''});
    const json=(o,status=200)=>new Response(JSON.stringify(o),{status,headers:{'content-type':'application/json'}});
    if(u.pathname==='/auth/v1/token')return json({error:'invalid_grant',error_description:'Invalid login credentials'},400);
    if(u.pathname==='/auth/v1/signup')return json({id:'00000000-0000-4000-8000-000000000001',email:'new@example.test',identities:[{id:'x'}],confirmation_sent_at:new Date().toISOString()});
    if(u.pathname==='/auth/v1/recover')return json({});
    return json({});
  };
  return {fetch,calls};
}

test('build: --ios-email-only empties the provider list and marks the assets; it cannot be combined with Apple; the default build is unchanged',t=>{
  const email=staging({iosEmailOnly:true}),plain=staging();
  assert.match(read(email,'native-config.js'),/"oauthProviders":\[\]/);assert.match(read(email,'native-config.js'),/"iosEmailOnly":true/);
  assert.equal(JSON.parse(read(email,'build-info.json')).iosEmailOnly,true);
  assert.equal((read(email,'app.bundle.js').match(/window\.YT_NATIVE\.oauthEnabled \? handleGoogleLogin : undefined/g)||[]).length,2,'both auth screens');
  assert.match(read(email,'app.bundle.js'),/if \(!window\.YT_NATIVE\.oauthEnabled\) return;/);
  assert.match(read(plain,'native-config.js'),/"oauthProviders":\["google"\]/);assert.doesNotMatch(read(plain,'native-config.js'),/iosEmailOnly/);
  assert.equal(JSON.parse(read(plain,'build-info.json')).iosEmailOnly,undefined);
  assert.doesNotMatch(read(plain,'app.bundle.js'),/oauthEnabled/,'default bundle is not changed');
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'yt-email-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  assert.throws(()=>build({root,mobile,out:path.join(dir,'www'),target:'staging',apple:true,iosEmailOnly:true,env:{YT_STAGING_PUBLISHABLE_KEY:KEY}}),/cannot be combined/);
  assert.equal(fs.existsSync(path.join(dir,'www')),false,'nothing written');
});

test('iOS email-only: no Google/Apple button or divider on the login and sign-up tabs, and the start path refuses every provider',async t=>{
  const s=await signInScreen(t,{platform:'ios',iosEmailOnly:true});
  assert.equal(s.w.YT_NATIVE.oauthEnabled,false);assert.equal(s.w.YT_NATIVE.appleEnabled,false);
  for(const tab of ['ログイン','新規登録']){
    await s.click(tab);
    const b=texts(s),root=s.w.document.getElementById('root').textContent;
    assert.equal(b.some(x=>/Google|Apple/.test(x)),false,tab+': no OAuth button');
    assert.equal(s.w.document.querySelector('button.yt-apple-signin'),null);
    assert.doesNotMatch(root,/Googleでログイン|Appleでサインイン/);
    assert.ok(s.w.document.querySelector(EMAIL)&&s.w.document.querySelector('input[type=password]'),tab+': email form stays');
  }
  for(const p of ['google','apple']){const r=await s.w.YT_NATIVE.oauthSignIn(p);assert.match(String(r.error&&r.error.message),/not enabled/);}
  assert.equal(s.log.open.length,0,'no browser opened');assert.deepEqual(s.remote,[]);
});

test('iOS email-only: email sign-in, sign-up and password reset still reach Supabase; the reset link comes back through the app callback',async t=>{
  const sb=fakeSupabase();
  const s=await signInScreen(t,{platform:'ios',iosEmailOnly:true,fetch:sb.fetch});
  await s.click('ログイン');
  s.fill(EMAIL,'user@example.test');s.fill('input[type=password]','not-a-real-password-1');
  await s.click('ログインする');await settle(300);
  const login=sb.calls.find(c=>c.url.pathname==='/auth/v1/token');
  assert.ok(login,'password sign-in request');assert.equal(login.url.origin,SUPA);assert.equal(login.url.searchParams.get('grant_type'),'password');
  await s.click('パスワードを忘れた方はこちら');
  s.fill(EMAIL,'user@example.test');
  await s.click('再設定メールを送る');await settle(300);
  const rec=sb.calls.find(c=>c.url.pathname==='/auth/v1/recover');
  assert.ok(rec,'password reset request');assert.equal(rec.url.searchParams.get('redirect_to'),CALLBACK,'reset link returns to the app');
  assert.match(rec.body,/"code_challenge":"[^"]+"/,'PKCE reset');
  const before=sb.calls.length;
  assert.equal(await s.w.YT_NATIVE.handleUrl(CALLBACK+'?code=reset-code-1'),true,'callback is still handled');await settle(300);
  const ex=sb.calls.slice(before).find(c=>c.url.pathname==='/auth/v1/token');
  assert.ok(ex,'code exchange');assert.equal(ex.url.searchParams.get('grant_type'),'pkce');assert.match(ex.body,/"auth_code":"reset-code-1"/);
  assert.equal(s.log.open.length,0);assert.deepEqual(s.remote,[]);
});

test('iOS email-only: sign-up sends the address to Supabase (13+ check kept); default iOS and Android builds keep Google',async t=>{
  const sb=fakeSupabase();
  const s=await signInScreen(t,{platform:'ios',iosEmailOnly:true,fetch:sb.fetch});
  await s.click('新規登録');
  s.fill(EMAIL,'new@example.test');
  for(const el of s.w.document.querySelectorAll('input[type=password]'))
    {Object.getOwnPropertyDescriptor(s.w.HTMLInputElement.prototype,'value').set.call(el,'not-a-real-password-1');el.dispatchEvent(new s.w.Event('input',{bubbles:true}));}
  const submit=()=>[...s.w.document.querySelectorAll('button')].find(b=>/無料ではじめる/.test(b.textContent));
  submit().click();await settle(300);
  assert.equal(sb.calls.some(c=>c.url.pathname==='/auth/v1/signup'),false,'not sent before the 13+ check');
  for(const c of s.w.document.querySelectorAll('input[type=checkbox]'))if(!c.checked)c.click();await settle();
  submit().click();await settle(400);
  const up=sb.calls.find(c=>c.url.pathname==='/auth/v1/signup');
  assert.ok(up,'sign-up request');assert.equal(up.url.origin,SUPA);assert.match(up.body,/"email":"new@example.test"/);
  for(const platform of ['ios','android']){
    const d=await signInScreen(t,{platform});
    assert.ok(d.button('Googleでログイン'),platform+' default build keeps Google');assert.equal(d.w.YT_NATIVE.oauthEnabled,true);
  }
});
