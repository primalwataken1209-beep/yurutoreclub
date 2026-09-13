# v44 — ログアウト後に iPhone / Android が2台同時表示される問題の修正

## 0. 先に結論（原因の特定）

### 原因になっていたコード

| # | ファイル | 関数 | 内容 |
|---|---------|------|------|
| 1 | `index.html`（インライン）／ `app.js` | **`Root()`** | v43までの `Root()` は、末尾に「Android でも iOS でもない端末＝PC」用のフォールバックがあり、そこで `<div className="page-title">ゆるトレ倶楽部 — デバイスプレビュー</div>` と `.devices-row` の中に **`<IOSDevice/>` と `<AndroidDevice/>` を両方** 描画していた。**これが「iPhone」「Android」を左右に並べたあの画面の正体。** |
| 2 | `index.html`／`app.js` | **`getDeviceOS()`** | 判定は `'android'` / `'ios'` / `'desktop'` の3値。UAが読めない・見慣れない端末は **すべて `'desktop'`** に落ちる。そして v43 の `Root()` では `'desktop'` = 2台表示だった。つまり **「判定できなかったら2台出す」という状態に、実質なっていた。** |

### ご指摘の5点への回答（現在のコードを実際に読んで確認）

1. **`signOut()` 後の遷移先** — `AppLogic()` 内の **`handleLogout()`**。`window.location.reload()` も `location.href` への代入も**ありません**（`app.js` 全体を検索しても、認証まわりに画面遷移用のURL書き換えはありません）。React の state を戻すだけです。→ **シロ**
2. **未ログイン時の Welcome render 条件** — `AppLogic()` の画面振り分けは、未ログインなら `WelcomeGate` か `RegisterScreen` の**どちらか一方**を return します。ここで DevicePreview を出す枝は存在しません。→ **シロ**
3. **iOS / Android 判定の初期化・fallback（一番怪しいとご指摘の箇所）** — 半分あたりです。**「ログアウトで判定がリセットされる」は起きていません**（`Root()` は `useState(getDeviceOS)` で初回1回だけ判定し、`Root` はログアウトでは再マウントされない。ログアウトするのは子側の `AppLogic` の state だけ）。ただし **「判定不能なら2台出す」というフォールバックは実在しました** — 上の表 #2 のとおり `'desktop'` 行きが2台表示だったためです。→ **判定不能→2台、は事実。ログアウトで判定が消える、は事実ではない。**
4. **DevicePreview が二重 render される条件** — v43では **`getDeviceOS()` が `'desktop'` を返すこと**、ただ1つ。ログイン状態とは無関係で、PC から開けば**最初から**2台でした。
5. **logout で端末判定値まで消していないか** — `handleLogout()` が消すのは `sessionStorage['yurutore_welcome_seen_v13']` **だけ**。端末判定は localStorage / sessionStorage に**保存していない**ので、消しようがありません。→ **シロ**

### ただし、ここが一番大事です

**いまお預かりしたZIP（`yurutore_v44__auth_fix_clean.zip`）は、v43.1 でお納めしたものと1バイトも違いません。**
つまり **#1 の2台表示コードは、このZIPの中では既に直っています。**

実際に、このZIPをそのまま動かして
「通常初回表示 / メールログイン→ログアウト / Googleログイン→ログアウト」を
PC・iPhone・Android の3端末で回したところ、**49項目すべて1台のみ**で、
2台表示は一度も再現しませんでした。

一方、**v43（修正前）を同じ手順で動かすと、PCでは最初から最後まで必ず2台**になります。
ご覧になった画面は、こちらと完全に一致します。

→ **公開中の `https://yurutore-club.netlify.app/` が、まだ v43（修正前）のまま**か、
**ブラウザに古いページが残っている**可能性が高い、というのが現時点の結論です。
（v43.1 のZIPをNetlifyへ反映済みかどうか、ご確認ください）

そのため v44 では **「原因の除去」だけでなく「もう二度と起きない・すぐ確認できる」ところまで**手当てしました。

---

## 1. v44 で入れた対策

### ① デバイスプレビューは「開発環境限定」に格下げ（`devPreviewOn()` / `isLocalDevHost()`）

v43.1 では `?preview=1` を付けたときだけ2台表示にしました。
ただしそれでも、

- URLに `?preview=1` が残ったまま共有・ブックマークされた
- 古いビルドがキャッシュに残っていた

という経路で本番ユーザーに2台が出る余地が残ります。

v44 では **「localhost 等の開発環境」かつ「`?preview=1`」の両方**が揃ったときだけに変更しました。

```js
function isLocalDevHost(){   // localhost / 127.0.0.1 / ::1 / *.local / file://
  const h=(window.location.hostname||'').toLowerCase();
  return h===''||h==='localhost'||h==='127.0.0.1'||h==='::1'||h==='[::1]'||h.endsWith('.local');
}
function devPreviewOn(){
  if(!isLocalDevHost())return false;                 // ← 本番ホストでは必ず false
  return new URLSearchParams(location.search).get('preview')==='1';
}
```

→ **`https://yurutore-club.netlify.app/` では、URLに何を付けても2台表示は物理的に起きません。**
開発時（localhost）では今までどおり `?preview=1` で見比べられます。

### ② 「必ず1台」であることをコード上で明示（`Root()`）

`Root()` の末尾に、判定不能でも1台になることをコメントで固定しました。ロジックは
`android` → Androidの枠 / それ以外（iPhone・iPad・PC・判定不能）→ iPhoneの枠 の2択のみで、
**2台を返す return は本番経路に1つも存在しません。**

### ③ 公開中のビルド番号をすぐ確認できるように（`APP_BUILD` / `BuildStamp()`）

「直したのに直っていない」を今後すぐ切り分けられるようにしました。通常表示には一切出ません。

- ブラウザのコンソールに `[ゆるトレ倶楽部] build v44 / device-preview: production disabled`
- `window.__YURUTORE_BUILD__` → `"v44"`
- URLに **`?build=1`** を付けると、画面右下に小さく `build v44` と出る（スマホでも確認できます）

→ 公開後に `https://yurutore-club.netlify.app/?build=1` を開いて **`build v44` が出れば反映済み**です。
出なければ、まだ古いビルドが配信されています。

### ④ 古いページが残らないように（`_headers` を新規追加）

Netlify 用のキャッシュ設定です。画面本体は毎回サーバーに確認し、画像は今までどおり長期キャッシュ（表示は速いまま）。

```
/*
  Cache-Control: public, max-age=0, must-revalidate
/assets/*
  Cache-Control: public, max-age=31536000, immutable
/images/*
  Cache-Control: public, max-age=31536000, immutable
```

---

## 2. 変更ファイル

### 変更
- `app.js` — `isLocalDevHost()` / `buildStampOn()` / `APP_BUILD` を追加、`devPreviewOn()` を開発環境限定へ、`Root()` に `BuildStamp` と説明コメントを追加、`BuildStamp()` を追加
- `index.html` — 上と同一内容（インライン。ヘッダーコメントと `<meta name="app-build" content="v44"/>` を更新）
- `README_CURRENT.md` — v44 の記載を追加

### 追加
- `_headers` — Netlify のキャッシュ設定
- `README_v44_device_preview_fix.md` — このファイル

### 削除
- なし

### 触っていないもの（ご指定どおり）
- Supabase 認証（`signInWithOAuth` / `signInWithPassword` / `signOut` / `onAuthStateChange`）
- Google OAuth の設定値、`APP_PUBLIC_URL`、Supabase の接続設定（URL / anon key）
- SNS（投稿・リアクション・コメント・フォロー・RLS・マイグレーションSQL）
- 運動記録、ホーム、今週、ミッション、ポイント
- パンダルーム、夜窓、パンジロー生活システム、ミニアクション
- Welcome画面 / パンダ相談室 / タイムカプセル / 既存画像
- デザイン（`?build=1` を付けない限り、見た目の変化は0です）

---

## 3. 動作確認の結果

すべて実ブラウザ（Chromium）で、実際に画面を操作して確認しました。

### ご指定の3ケース × 3端末（PC / iPhone / Android）

| ケース | PC | iPhone | Android |
|--------|----|--------|---------|
| ① 通常初回表示 | 1台（iPhone枠） | 1台（iPhone枠） | 1台（Android枠） |
| ② メールログイン → ログアウト | 1台・Welcomeへ | 1台・Welcomeへ | 1台・Welcomeへ |
| ③ Googleログイン → ログアウト | 1台・Welcomeへ | 1台・Welcomeへ | 1台・Welcomeへ |

いずれも「デバイスプレビュー」の見出し・`.devices-row` は出現せず、JSエラーも0件。

### 追加で確認したこと

- 端末判定不能（未知のUA）でも枠は1台
- **本番ホスト + `?preview=1` でも1台**（PC / iPhone / Android すべて）
- localhost + `?preview=1` では開発用プレビューが従来どおり使える
- `?build=1` でビルド番号が出る／付けなければ出ない

### 既存機能の回帰確認

| 項目 | 結果 |
|------|------|
| v44 ログアウト検証（今回） | **57 / 57 PASS** |
| v43.1 認証・画面遷移 | **29 / 29 PASS** |
| SNS（投稿・反応・コメント・フォロー・RLS動作・空/エラー状態） | **34 / 34 PASS** |
| パンダルーム（8ポーズ＋ミニアクション＋夜窓） | **8 / 8 PASS** |
| 合計 | **128 / 128 PASS** |

---

## 4. 公開後にお願いしたい確認（30秒）

1. Netlify へこのZIPの中身を反映する
2. スマホで `https://yurutore-club.netlify.app/?build=1` を開く
3. 右下に **`build v44`** と出れば反映完了（出ない場合は、まだ古いビルドが配信されています）
4. ログイン → ログアウト → 2台にならないことを確認

もし `build v44` が出ているのに2台表示が起きるようでしたら、
その画面のURL（`?` 以降も含めて全部）をお知らせください。原因を追える形になっています。
