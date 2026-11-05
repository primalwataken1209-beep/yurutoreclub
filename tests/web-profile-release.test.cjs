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
  assert.match(ja,/ニックネームの初期値として保存され、他の利用者に表示されます/);assert.match(en,/is saved as the initial nickname on our servers and is shown/);
  assert.equal(/保存されることがあり|may be saved/.test(privacy),false);
});
test('privacy names what the signed-in sync carries and what it leaves out, in both languages',()=>{
  const ja=block(privacy,'ja'),en=block(privacy,'en');
  assert.match(ja,/気分の選択、パンジローとの会話の文、タイムカプセルのメッセージなどの控え/);
  assert.match(ja,/運動記録とタイムカプセルに添付した写真の中身は送信せず/);assert.match(ja,/パンジローの返事は端末内で作られ/);
  assert.match(en,/the moods you choose, your chat text with Panjiro and your time capsule messages/);
  assert.match(en,/photos attached to activity logs and time capsules are not sent/);assert.match(en,/Panjiro's replies are generated on your device/);
  assert.match(ja,/パンダルームの状態、気分、パンジローとの会話、タイムカプセル<\/td><td>ご自身のみ/);
  assert.match(en,/Panda Room state, moods, chats with Panjiro, time capsules<\/td><td>You only/);
});
// The sync the policy describes: guests send nothing; signed-in state goes out with photo contents stripped.
test('the code matches: mood, chats and time capsules are part of the synced state, photo contents are stripped',()=>{
  const {functions}=require('./helpers.cjs');
  const c=functions(['ytStripLocalPhotos']);
  const s={mood:'sleepy',pandaChats:[{text:'hi'}],timeCapsules:[{message:'m',photo:{w:2,h:3,data:'data:image/jpeg;base64,AAAA'}}],reports:[{note:'n',photo:{w:1,h:1,data:'x'}}]};
  const out=JSON.parse(JSON.stringify(c.ytStripLocalPhotos(s)));
  assert.equal(out.mood,'sleepy');assert.deepEqual(out.pandaChats,[{text:'hi'}]);assert.equal(out.timeCapsules[0].message,'m');
  assert.deepEqual(out.timeCapsules[0].photo,{w:2,h:3,localOnly:true});assert.deepEqual(out.reports[0].photo,{w:1,h:1,localOnly:true});
  assert.match(app,/if\(!userId\|\|userId==='guest'\)return; \/\/ 体験版（未ログイン）は同期しない/);
  assert.match(app,/function pandaChatReply\(text,type\)\{\n  const cat=pandaChatCategory\(text,type\);\n  return pickPandaChatReply\(cat\);/);
});
// External (Google) images: other members' screens never load them; only the owner's own screen does.
test('the code matches: an external Google image is shown only to its owner, never loaded for other members',()=>{
  const {functions}=require('./helpers.cjs');
  const c=functions(['avatarRefFromValue','selfAvatarLocal'],{SUPABASE_URL:'https://eszheiabjwehcbrteqza.supabase.co',
    AVATAR_REF_RE:/^avatars\/([0-9a-f-]{36})\/avatar\.jpg(?:\?v=([0-9]{1,16}))?$/});
  const g='https://lh3.googleusercontent.com/a/example';
  assert.equal(c.avatarRefFromValue(g),null,'not a Storage avatar, so other members get the default icon');
  assert.equal(c.selfAvatarLocal({avatarUrl:g}),g,'the owner sees it on their own screen');
  assert.match(app,/isMine\?selfAvatarLocal\(state\.user\):null/);assert.match(app,/isMe\?selfAvatarLocal\(state\.user\):null/);
  const ja=block(privacy,'ja'),en=block(privacy,'en');
  assert.match(ja,/ご自身の画面でだけ表示され/);assert.match(ja,/他の利用者の画面では、この画像は読み込まれず/);
  assert.match(en,/shown only on your own screen/);assert.match(en,/Other members' screens do not load this image/);
});
test('account deletion: post photos are listed and the revision date is shown in both languages',()=>{
  const ja=block(deletion,'ja'),en=block(deletion,'en');
  assert.match(ja,/SNS投稿に添付した写真/);assert.match(en,/photos attached to your community posts/);
  assert.match(ja,/2026年11月5日 改定/);assert.match(en,/Updated: November 5, 2026/);
});
