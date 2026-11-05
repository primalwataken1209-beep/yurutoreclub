// Web release of the profile protection: production configuration only, and legal pages that match the code.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const app=fs.readFileSync('app.js','utf8'),html=fs.readFileSync('index.html','utf8');
const privacy=fs.readFileSync('privacy/index.html','utf8'),deletion=fs.readFileSync('account-deletion/index.html','utf8');
const block=(page,lang)=>{const m=new RegExp(`<section data-lang-block="${lang}">([\\s\\S]*?)</section>`).exec(page);assert.ok(m,lang);return m[1];};

test('production project only: no staging project, no mobile build hooks in the web source',()=>{
  for(const text of [app,html]){
    assert.ok(text.includes("const SUPABASE_URL='https://eszheiabjwehcbrteqza.supabase.co';"));
    assert.equal(text.includes('knftduojdalnawvkbelt'),false);
    assert.equal(/YT_NATIVE|YT_STAGING/.test(text),false);
  }
});
test('the profile protection is present and the email is never turned into a name',()=>{
  assert.match(app,/async function ytLoadOwnProfile\(/);assert.match(app,/function ytMergeOwnProfile\(/);
  assert.match(app,/YT_PROFILE_READ/);assert.match(app,/ignoreDuplicates:true/);
  assert.equal(/split\(['"]@['"]\)\[0\]/.test(app),false);
  assert.equal(/meta\.picture|meta\.avatar_url/.test(app),false,'no Google picture as a default');
});
test('privacy: Japanese and English carry the same revision date, describe the Android app only, and match the profile behaviour',()=>{
  const ja=block(privacy,'ja'),en=block(privacy,'en');
  assert.match(ja,/最終改定日：2026年11月5日/);assert.match(en,/Last updated: November 5, 2026/);
  assert.match(ja,/制定日：2026年9月8日/);assert.match(en,/Effective date: September 8, 2026/);
  assert.match(ja,/Android アプリ版では/);assert.match(en,/In the Android app/);
  assert.equal(/iOS|キーチェーン|Keychain/.test(privacy),false);
  assert.match(ja,/メールアドレスや Google のプロフィール画像を、ニックネームやプロフィール画像の初期値に使うことはありません/);
  assert.match(en,/Your email address and Google profile picture are never used as your initial nickname or profile photo/);
  assert.match(ja,/保存されることがあり/);assert.match(en,/may be saved as the initial nickname/);
});
test('account deletion: post photos are listed and the revision date is shown in both languages',()=>{
  const ja=block(deletion,'ja'),en=block(deletion,'en');
  assert.match(ja,/SNS投稿に添付した写真/);assert.match(en,/photos attached to your community posts/);
  assert.match(ja,/2026年11月5日 改定/);assert.match(en,/Updated: November 5, 2026/);
});
