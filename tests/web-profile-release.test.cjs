// Web release of the profile protection: production configuration only, and legal pages that match the code.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const app=fs.readFileSync('app.js','utf8'),html=fs.readFileSync('index.html','utf8');
const privacy=fs.readFileSync('privacy/index.html','utf8'),deletion=fs.readFileSync('account-deletion/index.html','utf8');
const block=(page,lang)=>{const m=new RegExp(`<section data-lang-block="${lang}">([\\s\\S]*?)</section>`).exec(page);assert.ok(m,lang);return m[1];};
// The code and the policy text are each in one of two states, checked strictly:
//   code OLD (web, current main): the owner's own screens load an external (Google) picture URL.
//   code NEW (Android 1.0.7): no screen loads external picture URLs (ytSafeLocalImg).
//   text LEGACY: owner-load wording only; revised 2026-11-05.
//   text VERSIONED: Android 1.0.7+ does not load, Android 1.0.6 and earlier and the web version do; session identifier and
//     infrastructure connection records; revised 2026-11-16.
// Accepted pairs: OLD+LEGACY, OLD+VERSIONED (the versioned text describes the web version as loading, which is what OLD does),
// NEW+VERSIONED. NEW+LEGACY is rejected.
const NEW=/\nfunction ytSafeLocalImg\(v\)\{/.test(app);
const VERSIONED=/Android アプリのバージョン 1\.0\.7 以降|Android app version 1\.0\.7 and later/.test(privacy);
const REVISED=VERSIONED?{ja:'2026年11月16日',en:'November 16, 2026'}:{ja:'2026年11月5日',en:'November 5, 2026'};
test('privacy text state fits the code: new code needs the version-specific policy',()=>{assert.ok(VERSIONED||!NEW,'NEW code with LEGACY policy text');});

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
  assert.ok(ja.includes('最終改定日：'+REVISED.ja),'ja revision date for this code');assert.ok(en.includes('Last updated: '+REVISED.en),'en revision date for this code');
  const jd=/最終改定日：(\d{4})年(\d{1,2})月(\d{1,2})日/.exec(ja),ed=/Last updated: ([A-Z][a-z]+) (\d{1,2}), (\d{4})/.exec(en);
  const months=['January','February','March','April','May','June','July','August','September','October','November','December'];
  assert.ok(jd&&ed);assert.deepEqual([+jd[1],+jd[2],+jd[3]],[+ed[3],months.indexOf(ed[1])+1,+ed[2]],'Japanese and English revision dates are the same day');
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
  assert.match(ja,/運動記録とタイムカプセルに添付した写真の中身は送信せず/);
  // Replies: no outside AI service is used to make them; the text itself is still stored in Supabase while signed in.
  assert.match(ja,/返事を作るために会話の文を外部の AI サービスなどへ送ることはありません（ログイン中の保存先は、上記の Supabase です）/);
  assert.match(en,/not sent to an outside AI or similar service to produce them \(while you are signed in, it is stored in Supabase as described above\)/);
  assert.equal(/会話の文を外部のサービスへ送ることはありません|not sent to any outside service/.test(privacy),false,'no absolute no-send claim');
  assert.match(en,/the moods you choose, your chat text with Panjiro and your time capsule messages/);
  assert.match(en,/photos attached to activity logs and time capsules are not sent/);
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
// External (Google) images: other members' screens never load them. OLD code: the owner's own screens do. NEW code: nobody's screen does.
// The policy part checks the text state (VERSIONED or LEGACY); which pairs are allowed is checked by the first privacy test.
test('the code matches: an external Google image is never loaded for other members, and the owner case matches the policy',()=>{
  const {functions}=require('./helpers.cjs');
  const c=functions(['avatarRefFromValue','selfAvatarLocal',...(NEW?['ytSafeLocalImg']:[])],{SUPABASE_URL:'https://eszheiabjwehcbrteqza.supabase.co',
    AVATAR_REF_RE:/^avatars\/([0-9a-f-]{36})\/avatar\.jpg(?:\?v=([0-9]{1,16}))?$/});
  const g='https://lh3.googleusercontent.com/a/example',pic='data:image/jpeg;base64,/9j/AA==';
  assert.equal(c.avatarRefFromValue(g),null,'not a Storage avatar, so other members get the default icon');
  if(NEW){
    assert.equal(c.selfAvatarLocal({avatarUrl:g}),null,'the owner gets the default icon too');
    assert.equal(c.selfAvatarLocal({avatar:g}),null,'even when an old device copy holds the URL');
    assert.equal(c.selfAvatarLocal({avatar:pic,avatarUrl:g}),pic,'a device photo still shows');
    for(const v of [g,'http://x.test/a.jpg','javascript:alert(1)','data:text/html,x','avatars/x/avatar.jpg',null])assert.equal(c.ytSafeLocalImg(v),null,String(v));
    assert.equal(c.ytSafeLocalImg('blob:x'),'blob:x');
    assert.match(app,/function useAvatarSrc\(value,local\)\{\n  local=ytSafeLocalImg\(local\);/,'every local picture passes the filter');
  }else{
    assert.equal(c.selfAvatarLocal({avatarUrl:g}),g,'the owner sees it, from the device copy of their own profile');
  }
  assert.equal(c.selfAvatarLocal({avatarUrl:'http://lh3.googleusercontent.com/a/example'}),null,'only https');
  // Only two places pass the owner's own image: their own posts (isMine) and their own profile screen (isMe).
  assert.equal((app.match(/selfAvatarLocal\(state\.user\)/g)||[]).length,2);
  assert.match(app,/isMine\?selfAvatarLocal\(state\.user\):null/);assert.match(app,/isMe\?selfAvatarLocal\(state\.user\):null/);
  assert.match(app,/<SnsAvatar value=\{p&&p\.avatar_url\} className="avatar"/,'lists pass no local image');
  const ja=block(privacy,'ja'),en=block(privacy,'en');
  const oldJa=/端末内のご自身のプロフィールに Google のプロフィール画像の URL が設定されている場合/,oldEn=/If the copy of your own profile on a device holds the URL of your Google profile picture/;
  const newJa=/Android アプリのバージョン 1\.0\.7 以降は、この URL の画像を読み込まず、既定のアイコンを表示します（URL の値は削除しません。新しい写真を選ぶと置き換わります）/;
  const newEn=/Android app version 1\.0\.7 and later does not load an image from that URL and shows the default icon instead \(the URL value is not deleted; choosing a new photo replaces it\)/;
  if(VERSIONED){
    // Valid for the web code (OLD: it loads, as the web sentence says) and for Android 1.0.7 (NEW: it does not, as the 1.0.7 sentence says).
    assert.match(ja,newJa);assert.match(en,newEn);
    assert.equal(/Web 版[^。]*読み込みません|Web 版[^。]*読み込まず/.test(ja),false,'the web version is not described as not loading');
    assert.equal(/web version[^.]*(does not|doesn't|never) load/i.test(en),false,'the web version is not described as not loading');
    assert.match(ja,/Android アプリのバージョン 1\.0\.6 以前と Web 版では、その端末でご自身の投稿やご自身の SNS プロフィール画面を表示するときに、端末が Google のサーバーから画像を読み込みます/);
    assert.match(en,/In Android app version 1\.0\.6 and earlier and in the web version, the device loads that image from Google's servers when it shows your own posts or your own community profile screen/);
    assert.match(ja,/他の利用者の画面では、どのバージョンでも外部の URL の画像は読み込まれず/);assert.match(en,/In every version, other members' screens do not load images from outside URLs/);
    assert.match(ja,/ログイン状態（セッション）の識別子/);assert.match(en,/sign-in session identifier/);
    assert.match(ja,/IP アドレスから推定される国・都市などのおおよその地域が含まれる場合があります。端末の GPS 位置情報は取得しません。/);
    assert.match(en,/an approximate country or city inferred from it\. We do not access your device's GPS location\./);
    assert.equal(oldJa.test(privacy)||oldEn.test(privacy),false,'the old owner-load wording is gone');
  }else{
    assert.match(ja,oldJa);assert.match(en,oldEn);
    assert.match(ja,/ご自身の投稿やご自身の SNS プロフィール画面を表示するときに/);assert.match(ja,/他の利用者の画面では、外部の URL の画像は読み込まれず/);
    assert.match(en,/when it shows your own posts or your own community profile screen/);assert.match(en,/Other members' screens do not load images from outside URLs/);
    assert.equal(newJa.test(privacy)||newEn.test(privacy),false,'legacy text has no version-specific wording');
  }
  assert.equal(/ご自身の画面でだけ表示され|shown only on your own screen/.test(privacy),false);
});
test('account deletion: post photos are listed and the revision date is shown in both languages',()=>{
  const ja=block(deletion,'ja'),en=block(deletion,'en');
  assert.match(ja,/SNS投稿に添付した写真/);assert.match(en,/photos attached to your community posts/);
  assert.match(ja,/2026年11月5日 改定/);assert.match(en,/Updated: November 5, 2026/);
});
