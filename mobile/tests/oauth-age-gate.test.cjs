// The bundled native app must not open the OAuth browser from either auth tab until "13 or older" is ticked.
// Runs the built staging bundle offline (fake Capacitor plugins; any non-local URL is recorded, never fetched).
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {launch,settle}=require('./app-harness.cjs');
const SUPA='https://knftduojdalnawvkbelt.supabase.co';
const L={ja:{cta:'ログイン・新規登録はこちら',reg:'新規登録',login:'ログイン',google:'Googleでログイン',need:/13歳以上の方のみ登録できます/},
         en:{cta:'Log in or sign up',reg:'Sign up',login:'Log in',google:'Continue with Google',need:/You need to be 13 or older to sign up/}};
const boxes=s=>[...s.w.document.querySelectorAll('input[type=checkbox]')];
for(const [platform,apple] of [['android',false],['ios',true]])for(const lang of ['ja','en'])for(const tab of ['reg','login']){
  test(`${platform}/${lang}/${tab}: no OAuth browser until the age box is ticked`,async t=>{
    const s=await launch(t,{platform,apple,lang});const l=L[lang];
    await s.click(l.cta);await s.click(l[tab]);
    assert.equal(boxes(s).length,1,'one age box');
    const buttons=[()=>s.button(l.google)];
    if(apple)buttons.push(()=>s.w.document.querySelector('button.yt-apple-signin'));
    for(const b of buttons){b().click();await settle(300);}
    assert.equal(s.log.open.length,0,'no browser opened unticked');
    assert.match(s.w.document.getElementById('root').textContent,l.need);
    boxes(s)[0].click();await settle();
    s.button(l.google).click();await settle(300);
    assert.equal(s.log.open.length,1,'Google opens once after ticking');
    const u=new URL(s.log.open[0]);
    assert.equal(u.origin+u.pathname,SUPA+'/auth/v1/authorize');assert.equal(u.searchParams.get('provider'),'google');
    assert.deepEqual(s.remote,[]);
  });
}
