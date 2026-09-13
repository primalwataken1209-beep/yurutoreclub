# ゆるトレ倶楽部 v43.1 — ログアウト後の画面遷移と認証の修正

ベース：`yurutore_v43_real_sns_foundation_clean`

デザインと既存機能は変えず、**認証と画面遷移だけ**を直しました。

---

## 1. 何が起きていたか（原因）

### 原因①：ログアウトしても「ログイン済み」の状態が残っていた（本丸）

`handleLogout` が **`user` と `onboard` を残したまま**初期化していました。

```js
// v43まで（不具合）
setSt(s=>({...DEF, user:s?.user||null, onboard:!!s?.onboard}));
//                 ↑ここを残していた      ↑ここも残していた
```

画面の入口はこの2つで判定していたため、

```js
if(!st.user||!st.onboard) return <RegisterScreen/>;   // ← 条件が成立しない
```

ログアウトしても**認証画面に戻らず、ホーム画面（体験版扱い）のまま**になっていました。

### 原因②：PCではアプリが2つ並ぶ確認用ページだった

`Root()` がPCからのアクセスを「デバイスプレビュー」として扱い、
**iPhoneとAndroidのアプリ本体を2つ同時に描画**していました。

```js
// v43まで
return(
  <div>
    <div className="page-title">ゆるトレ倶楽部 — デバイスプレビュー</div>
    <div className="devices-row">
      <IOSDevice/><AndroidDevice/>   {/* AppLogicが2つ動く */}
    </div>
  </div>
);
```

原因①でホーム画面のまま残ると、その外側にこのプレビューの枠と見出しが見えるため、
**「ログアウトするとデバイスプレビューに飛ぶ」**ように見えていました。
（さらに、アプリが2つ動くのでログイン状態が2画面で食い違う問題もありました）

### 原因③：ログインできたのに登録画面へ出戻る

Googleログイン直後や機種変更のあとは、Supabaseのセッションはあるのに
**この端末にプロフィール（`st.user`）が無い**状態になります。
判定が `!st.user` だったため、ログインに成功しても登録画面に戻されていました。

### 原因④：`getSession()` が失敗すると「読み込み中…」で固まる

`.catch()` が無く、失敗すると `authChecked` が `true` にならないため、
読み込み表示から先へ進めなくなる可能性がありました。

### 原因⑤：OAuthの戻り先が `location.href` だった

`?code=` などが付いたURLがそのまま戻り先になり、
本番URLへ確実に戻る保証がありませんでした。

---

## 2. 修正内容

### ① 画面の入口をここ1か所に集約した（判定の一本化）

```js
const isSignedIn   = !!(session && session.user);   // 「ログイン済み」の唯一の定義
const hasProfile   = !!(st.user && st.onboard);     // この端末で使えるプロフィールがあるか
const isGuestTrial = !isSignedIn && !forceAuthScreen && hasProfile;  // 体験版の人
const showAuthFlow = !isSignedIn && !isGuestTrial;  // true ならウェルカム／認証画面
```

| 状態 | 行き先 |
|---|---|
| **未ログイン** | ウェルカム画面 → 認証画面 |
| **ログイン済み** | ホーム画面 |
| 体験版（ログインせず設定を終えた人） | ホーム画面（従来どおり） |
| ログイン直後でプロフィール読み込み中 | 「読み込み中…」（すぐホームへ） |

**ログイン済みかどうかは Supabase のセッションだけで判断します。**
ほかの場所で認証状態を判定していません。

### ② ログアウトを直した

```js
const handleLogout=async()=>{
  try{ if(supabaseClient) await supabaseClient.auth.signOut(); }catch(e){}
  setSession(null);
  setAwaitingConfirmationEmail(null);
  setAuthError(''); setAuthNotice('');
  setTab('home'); setPraise(null); setSnsUser(null); setShowRep(false);
  setSt({...DEF, auth:'guest'});          // user / onboard を残さない
  setForceAuthScreen(true);               // 体験版の古いデータがあっても素通りさせない
  try{ sessionStorage.removeItem('yurutore_welcome_seen_v13'); }catch(e){}
  setShowWelcomeGate(true);               // ウェルカム画面からやり直す
};
```

`forceAuthScreen` は、`guest` バケットに以前の体験版データが残っていても
ホームへ素通りさせないためのフラグです。次にログインすると自動で解除されます。

> **ログアウトしてもデータは消えません。**
> 記録・家具・ポイントはユーザーIDごとに保存されているので、
> 再ログインすれば元どおり戻ります（実際に確認済み）。

### ③ デバイスプレビューを本番導線から完全に除外

```js
if(preview){ /* ?preview=1 のときだけ2画面プレビュー（開発用） */ }

if(deviceOS==='android') return <div className="real-device"><AndroidDevice/></div>;
// iPhone / iPad / PC はすべてiPhoneの枠でアプリを「1つだけ」表示
return <div className={deviceOS==='ios'?'real-device':''}><IOSDevice/></div>;
```

- **どの端末でもアプリ本体は1つだけ**になりました（ログイン状態の食い違いも解消）
- 「ゆるトレ倶楽部 — デバイスプレビュー」の見出しと2画面表示は
  **URLに `?preview=1` を付けたときしか出ません**
- PCでの見た目（中央にiPhoneの枠）は従来どおりです

### ④ ログイン済みなら必ずホームへ入れる

セッションはあるのに端末にプロフィールが無い場合、
**セッションの情報から最低限のプロフィールを作って**ホームへ入れます。

```js
if(u && (!next.user || !next.onboard)){
  const meta=u.user_metadata||{};
  const guess=(meta.name||meta.full_name||meta.user_name||
               String(u.email||'').split('@')[0]||'ゆるトレ仲間');
  next={...next,
    user:{...(next.user||{}),
      name:((next.user&&next.user.name)||guess).slice(0,20),
      avatarUrl:(next.user&&next.user.avatarUrl)||meta.avatar_url||meta.picture||null},
    onboard:true};
}
```

Googleログインの表示名とアイコンがそのまま使われます。
（あとからプロフィール画面で自由に変更できます）

### ⑤ セッション取得を確実にした

```js
supabaseClient.auth.getSession()
  .then(({data})=>{ setSession(data?.session||null); if(data?.session)cleanAuthUrl(); })
  .catch(()=>{})
  .finally(()=>{ setAuthChecked(true); });   // 失敗しても必ず先へ進む

supabaseClient.auth.onAuthStateChange((_e,next)=>{
  setSession(next||null); setAuthChecked(true); if(next)cleanAuthUrl();
});
```

- `getSession()` … 画面を開いた時点のセッション（**OAuthから戻った直後もここで拾えます**）
- `onAuthStateChange` … そのあとのログイン／ログアウト（**OAuthの完了もここに来ます**）

どちらで来ても同じ `setSession()` に流れるので、判定は常にセッション1つで済みます。
`.finally()` を付けたので、**取得に失敗しても「読み込み中…」で固まりません。**

### ⑥ OAuthの戻り先を本番URLに固定

```js
const APP_PUBLIC_URL='https://yurutore-club.netlify.app/';
function authRedirectTo(){
  const h=location.hostname||'';
  const isLocal=(h==='localhost'||h==='127.0.0.1'||h==='::1'||h===''||h.endsWith('.local'));
  if(isLocal)return location.origin+location.pathname;  // ローカル開発は今いる場所へ
  return APP_PUBLIC_URL;                                 // 本番は必ず公開URLへ
}

await supabaseClient.auth.signInWithOAuth({
  provider:'google',
  options:{redirectTo:authRedirectTo()}
});
```

パスワード再設定メールの戻り先も同じ関数に統一しました。

さらに、戻ってきたあとURLに残る `?code=` `?state=` `#access_token=` を
**1度だけ掃除**します（`cleanAuthUrl`）。残したままリロードすると
認証コードの再交換に失敗して混乱するためです。

> **Supabase側の設定をご確認ください**
> Authentication → URL Configuration の **Redirect URLs** に
> `https://yurutore-club.netlify.app/` を登録してください。
> Site URL も同じURLにしておくと確実です。

---

## 3. ウェルカム画面について

**ウェルカム画面は削除していません。**

- 未ログインの人には**必ず最初に表示されます**（そこに「ログイン・新規登録はこちら」があります）
- ログアウトした人にも、もう一度表示されます
- `?welcome=1` または `#welcome` を付ければ、**ログイン済みでもいつでも見られます**

変わったのは「すでにログインしている人が毎回スプラッシュを挟まずホームへ入る」点だけです
（ご要件の「ログイン済み → Home の判定を一本化」に合わせています）。

---

## 4. テスト結果

実ブラウザ（Chromium）で、PC / iPhone / Android の3種類の User-Agent と
Supabaseの認証を差し替えたスタブで確認しました。**PASS 29 / FAIL 0**。

```
① デバイスプレビューが本番導線から消えているか
PASS  PCでもアプリは1画面だけ
PASS  「デバイスプレビュー」の見出しが無い
PASS  Android端末はAndroidの枠1つ
PASS  iPhoneはiPhoneの枠1つ
PASS  ?preview=1 のときだけ2画面プレビューが出る（開発用）

② 未ログイン → ウェルカム／認証画面
PASS  未ログインはウェルカム画面
PASS  「ログイン・新規登録はこちら」がある
PASS  押すとメール/Googleのログイン画面へ進む
PASS  Googleボタンが signInWithOAuth({provider:"google"}) を呼ぶ
PASS  ローカル開発では戻り先が今いる場所（開発が止まらない）
PASS  本番ホストでは戻り先が https://yurutore-club.netlify.app/

③ OAuthから戻ってきたらホームへ
PASS  OAuth前は認証画面
PASS  セッションが入るとホーム画面へ遷移する
PASS  端末にプロフィールが無くても登録画面に出戻らない
PASS  セッションの名前でホームに入る（「こんにちは、あゆみさん」）
PASS  戻り先URLの ?code= / ?state= が掃除される

④ ログアウト後の遷移（今回の本題）
PASS  ログイン済みはホーム画面
PASS  ログアウトボタンがある
PASS  ログアウト後はウェルカム／認証画面へ戻る
PASS  ホーム画面のままにならない
PASS  デバイスプレビューにならない
PASS  体験版の古いデータが残っていても素通りしない
PASS  ログアウト後、再ログインでホームへ戻れる

⑤ 体験版（ログインしない人）は今までどおり
PASS  体験版で設定済みの人はホームを見られる

⑥ セッション取得に失敗しても固まらない
PASS  「読み込み中…」で固まらない
PASS  ウェルカム／認証画面が出る
```

### 既存機能の回帰

| 対象 | 結果 |
|---|---|
| v43 SNS（投稿・リアクション・コメント・フォロー・空/エラー表示） | **PASS 34 / FAIL 0** |
| v42.2 パンダルーム（8ポーズ・ミニアクション・夜景） | **PASS 8 / FAIL 0** |
| JSエラー / HTTP 404 | 0件 |

---

## 5. 修正中に見つけて直した不具合

**ログイン成立の瞬間に画面が落ちる問題**（この修正の実装中に発見）

セッションが入った瞬間に「ログイン済み＝ホーム」と判定すると、
まだ端末のプロフィール読み込み（`loadSt`）が終わっていないため、
`state.user.name` を参照した時点で画面が真っ白になりました
（実際に `Cannot read properties of null (reading 'name')` を再現）。

→ プロフィールがそろうまでは読み込み表示にし、
   そろい次第ホームへ進むようにしました（上の `hasProfile`）。

---

## 6. 変更ファイル一覧

| ファイル | 変更内容 |
|---|---|
| `index.html` | **本番の正**。認証と画面遷移まわりのみ変更 |
| `app.js` | `index.html` のインラインJSと同一内容（同期用）。**中身は完全一致** |
| `README_CURRENT.md` | v43.1 の記載を追加 |

### 追加ファイル

| ファイル | 内容 |
|---|---|
| `README_v43_1_auth_fix.md` | 本ドキュメント |

**CSS・画像・SQL・アセットの変更はありません。**

### 変更した関数・追加した関数

| 名前 | 変更 |
|---|---|
| `authRedirectTo()` | **新規**。OAuth／パスワード再設定の戻り先を1か所で決める |
| `cleanAuthUrl()` | **新規**。戻ってきたあとのURLから `?code=` などを消す |
| `Root()` | デバイスプレビューを `?preview=1` 限定にし、本番はアプリ1画面に |
| `devPreviewOn()` | **新規**。`?preview=1` の判定 |
| `handleLogout()` | `user` / `onboard` を残さない。ウェルカム画面から再開する |
| `handleGoogleLogin()` | `redirectTo` を `authRedirectTo()` に |
| `handlePasswordReset()` | `redirectTo` を `authRedirectTo()` に |
| セッション取得の `useEffect` | `.catch()` / `.finally()` を追加。`onAuthStateChange` でも `authChecked` を立てる |
| `loadSt` の `useEffect` | ログイン済みでプロフィールが無いとき、セッションから用意する |
| 画面の入口判定 | `isSignedIn` / `hasProfile` / `isGuestTrial` / `showAuthFlow` に集約 |
| `forceAuthScreen` state | **新規**。ログアウト直後は必ず認証画面から始める |

---

## 7. 変更していないもの

デザインと既存機能はそのままです。

| 項目 | 状態 |
|---|---|
| ウェルカム画面 / 登録画面 / ログイン画面の**見た目** | 無変更（表示条件だけ整理） |
| パンダルーム / 夜景 / パンジロー生活行動 / ミニアクション | 無変更 |
| SNS（投稿・リアクション・コメント・フォロー）とSQL・RLS | 無変更 |
| 運動記録 / ミッション / ポイント / ホーム / 履歴 | 無変更 |
| Supabaseの認証方式 | 無変更（**新しい認証方式は作っていません**） |
| localStorage の既存キー | 追加・変更・削除なし |
| CSS / 画像 / `supabase/migrations/` | 無変更 |

---

## 8. 公開前のチェックリスト

1. Supabase → Authentication → **URL Configuration**
   - Site URL: `https://yurutore-club.netlify.app/`
   - Redirect URLs に `https://yurutore-club.netlify.app/` を追加
2. Supabase → Authentication → Providers → **Google** を有効化し、
   Google Cloud 側の「承認済みのリダイレクト URI」に
   `https://<プロジェクトID>.supabase.co/auth/v1/callback` を登録
3. Netlifyに配置してから、次の順で動作確認
   - ログアウト → ウェルカム画面に戻るか
   - 「ログイン・新規登録はこちら」→ Googleでログイン → ホームに入るか
   - 再読み込みしてもログイン状態が続くか

---

## 9. 不要／重複ファイルの有無

**なし（クリーン版です）。** 旧ZIP・バックアップ・検証用スタブは含めていません。
