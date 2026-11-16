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
  assert.match(ja,/最終改定日：2026年11月16日/);assert.match(en,/Last updated: November 16, 2026/);
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
// External (Google) images: no screen loads them any more (other members never did; the owner's own screens now show the default icon).
test('the code matches: an external Google image is not loaded for anyone, including its owner',()=>{
  const {functions}=require('./helpers.cjs');
  const c=functions(['avatarRefFromValue','ytSafeLocalImg','selfAvatarLocal'],{SUPABASE_URL:'https://eszheiabjwehcbrteqza.supabase.co',
    AVATAR_REF_RE:/^avatars\/([0-9a-f-]{36})\/avatar\.jpg(?:\?v=([0-9]{1,16}))?$/});
  const g='https://lh3.googleusercontent.com/a/example';
  assert.equal(c.avatarRefFromValue(g),null,'not a Storage avatar, so other members get the default icon');
  assert.equal(c.selfAvatarLocal({avatarUrl:g}),null,'the owner gets the default icon too');
  assert.equal(c.selfAvatarLocal({avatar:g}),null,'even when an old device copy holds the URL');
  assert.equal(c.selfAvatarLocal({avatarUrl:'http://lh3.googleusercontent.com/a/example'}),null,'only https');
  // Only two places pass the owner's own image: their own posts (isMine) and their own profile screen (isMe).
  assert.equal((app.match(/selfAvatarLocal\(state\.user\)/g)||[]).length,2);
  assert.match(app,/isMine\?selfAvatarLocal\(state\.user\):null/);assert.match(app,/isMe\?selfAvatarLocal\(state\.user\):null/);
  assert.match(app,/<SnsAvatar value=\{p&&p\.avatar_url\} className="avatar"/,'lists pass no local image');
  // The privacy text separates Android 1.0.7+ (no load) from Android 1.0.6 and earlier and the web version (owner's own screens load it).
  const ja=block(privacy,'ja'),en=block(privacy,'en');
  assert.match(ja,/Android アプリのバージョン 1\.0\.7 以降は、この URL の画像を読み込まず、既定のアイコンを表示します（URL の値は削除しません。新しい写真を選ぶと置き換わります）/);
  assert.match(ja,/Android アプリのバージョン 1\.0\.6 以前と Web 版では、その端末でご自身の投稿やご自身の SNS プロフィール画面を表示するときに、端末が Google のサーバーから画像を読み込みます/);
  assert.match(ja,/他の利用者の画面では、どのバージョンでも外部の URL の画像は読み込まれず/);
  assert.match(en,/Android app version 1\.0\.7 and later does not load an image from that URL and shows the default icon instead/);
  assert.match(en,/In Android app version 1\.0\.6 and earlier and in the web version, the device loads that image from Google's servers when it shows your own posts or your own community profile screen/);
  assert.match(en,/In every version, other members' screens do not load images from outside URLs/);
  assert.equal(/ご自身の画面でだけ表示され|shown only on your own screen/.test(privacy),false);
});
test('privacy: session identifier and infrastructure connection records (approximate area from IP, no GPS) in both languages',()=>{
  const ja=block(privacy,'ja'),en=block(privacy,'en');
  assert.match(ja,/ログイン状態（セッション）の識別子/);assert.match(en,/sign-in session identifier/);
  assert.match(ja,/IP アドレスから推定される国・都市などのおおよその地域が含まれる場合があります。端末の GPS 位置情報は取得しません。/);
  assert.match(en,/an approximate country or city inferred from it\. We do not access your device's GPS location\./);
});
test('account deletion: post photos are listed and the revision date is shown in both languages',()=>{
  const ja=block(deletion,'ja'),en=block(deletion,'en');
  assert.match(ja,/SNS投稿に添付した写真/);assert.match(en,/photos attached to your community posts/);
  assert.match(ja,/2026年11月5日 改定/);assert.match(en,/Updated: November 5, 2026/);
});
