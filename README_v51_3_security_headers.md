# ゆるトレ倶楽部 v51.3 — 公開前セキュリティヘッダー強化

ベース：`yurutore_v51_2_sns_photo_clean`（アップロードいただいたZIPが、こちらで作成した v51.2 とバイト単位で同一であることを確認したうえで作業しています）

**アプリのコードは1行も変えていません。変更は `_headers` の1ファイルだけです。**

---

## 1. 変更したファイル

| 区分 | ファイル | 変更内容 |
|---|---|---|
| 変更 | `_headers` | セキュリティヘッダー5種を `/*` に追加（既存の Cache-Control 3行は変更なし） |
| 追加 | `README_v51_3_security_headers.md` | このファイル |

**それ以外はすべて v51.2 とバイト単位で同一**です（`diff -rq` で確認済み）。
`index.html` / `app.js` / `style.css` / 画像 / `assets/` / 法務ページ / `legal/` /
`supabase/`（migration・manual・Edge Function）/ 既存README は無変更です。

UI・デザイン・パンジロー・パンダルーム・運動記録・投稿処理・写真投稿・タイムライン・
コメント・リアクション・フォロー・プロフィール・公開/非公開・Googleログイン・メール認証・
Supabase認証・RLS・Storage処理・アカウント削除・多言語・法務ページ・既存URL・DB構造・
既存JavaScriptのロジックには一切触れていません。リファクタリングもしていません。

---

## 2. 追加したHTTPヘッダー（`/*` に追加）

```
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  X-Frame-Options: DENY
  Permissions-Policy: camera=(self), microphone=(), geolocation=(), payment=(), usb=(), accelerometer=(), gyroscope=(), magnetometer=(), midi=(), serial=()
  Content-Security-Policy: （§3の全文）
```

| ヘッダー | 目的 | 補足 |
|---|---|---|
| `X-Content-Type-Options: nosniff` | 中身を見てMIMEを推測する動作を止める | 画像として保存されたファイルがスクリプト等として解釈されるのを防ぐ |
| `Referrer-Policy: strict-origin-when-cross-origin` | 外部サイトへ遷移するときに、パス付きURLを渡さない | 法務ページの外部リンク・Google認証の遷移で、`https://yurutore-club.netlify.app/` までしか渡らない |
| `X-Frame-Options: DENY` | 他サイトの `<iframe>` に埋め込ませない（クリックジャッキング対策） | CSP の `frame-ancestors 'none'` と**同じ意味**。対応ブラウザでは `frame-ancestors` が優先されるため矛盾は起きません。`X-Frame-Options` は古い端末向けの保険として残しています |
| `Permissions-Policy` | 使っていないブラウザ機能を最初から禁止する | **`camera=(self)` は写真機能を壊さないため**。写真選択は `<input type="file">` ですが、スマホでは撮影に進む導線があるため自サイトには許可しています。マイク・位置情報・決済・USB・各種センサーは `()`＝全面禁止 |

`Cache-Control`（v44で入れた3行）はそのままです。`/assets/*` と `/images/*` の長期キャッシュも変更していません。

### 任意（今は無効・コメントアウトで同梱）
`_headers` の末尾に、必要になったら有効化できる2つをコメントで入れてあります。今回は有効にしていません。

- `Strict-Transport-Security: max-age=31536000; includeSubDomains`
  … `netlify.app` は常時HTTPSのため通常は不要。独自ドメインへ移行し、サブドメインもすべてHTTPS化できてから有効化を検討してください。
- `Cross-Origin-Opener-Policy: same-origin-allow-popups`
  … 現在のGoogleログインは同じタブでの遷移なので影響しませんが、将来ポップアップ方式にする場合は再確認が必要なため、今回は入れていません。

---

## 3. 最終CSP（全文）

```
Content-Security-Policy: default-src 'self'; base-uri 'self'; object-src 'none'; frame-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://eszheiabjwehcbrteqza.supabase.co https://*.googleusercontent.com; font-src 'self'; connect-src 'self' https://eszheiabjwehcbrteqza.supabase.co; upgrade-insecure-requests
```

### 許可した外部ドメインと理由（すべて実コードから特定。推測で足したものはありません）

| ドメイン | ディレクティブ | 根拠（実コードの場所） |
|---|---|---|
| `https://cdnjs.cloudflare.com` | `script-src` | `index.html` 12〜14行目：React 18.3.1 / ReactDOM 18.3.1 / Babel standalone 7.24.7 |
| `https://cdn.jsdelivr.net` | `script-src` | `index.html` 15行目：`@supabase/supabase-js@2` |
| `https://eszheiabjwehcbrteqza.supabase.co` | `connect-src` / `img-src` | `SUPABASE_URL`（`index.html` 2601行目）。REST・Auth・Storage・Edge Function（アカウント削除）の通信先。画像は avatars の公開URLと post-images の署名URL |
| `https://*.googleusercontent.com` | `img-src` | Googleログイン利用者のアイコン。`index.html` 5601行目で Google から渡される `user_metadata.picture` をそのまま `<img src>` に使い、`profiles.avatar_url` として他の利用者にも表示されます。Googleは `lh3` 以外のホスト名を返すことがあるため、このベンダー限定のワイルドカードにしています |
| `data:` | `img-src` | 運動記録・タイムカプセルの写真（端末内保存の dataURL）と、CSS内の小さなSVGアイコン |
| `blob:` | `img-src` | 投稿前の写真プレビュー（`URL.createObjectURL`。`index.html` 4740行目付近） |
| `'self'` | 各所 | `style.css` / `app.js`（開発用）/ `legal/legal.css` / `legal/legal.js` / `images/` / `assets/` |

**Realtime（WebSocket）は使っていない**ため `wss:` は許可していません（`\.channel(` / `WebSocket` / `wss://` の検索結果0件）。将来Realtimeを使う場合は `connect-src` に `wss://eszheiabjwehcbrteqza.supabase.co` の追加が必要です。

### 禁止側のディレクティブ
| 指定 | 意味 |
|---|---|
| `default-src 'self'` | 明示していない読み込みは自サイトのみ |
| `object-src 'none'` | Flash等のプラグイン埋め込み禁止 |
| `frame-src 'none'` | ページ内に他サイトを埋め込まない（アプリはiframeを使っていません） |
| `frame-ancestors 'none'` | 他サイトから埋め込まれない |
| `base-uri 'self'` | `<base>` の書き換えによる相対URLの乗っ取りを防ぐ |
| `form-action 'self'` | フォーム送信先を自サイトに限定（アプリは `<form>` を使っていません） |
| `font-src 'self'` | 外部フォントは使っていないため自サイトのみ（Google Fonts等は未使用） |
| `upgrade-insecure-requests` | 万一 `http://` の参照が混ざっても `https://` で取りに行く |

**Googleログインは「別ページへの画面遷移」**（`supabase.co/auth/v1/authorize?provider=google` へ移動）なので、CSPの制限対象外です。`navigate-to` は指定していません。

---

## 4. `'unsafe-inline'` / `'unsafe-eval'` の判断（実測）

CSPを4パターンに変えて、実ブラウザ（Chromium）で起動を確認しました。

| パターン | 結果 |
|---|---|
| A：`script-src 'unsafe-inline' 'unsafe-eval'` ＋ `style-src 'unsafe-inline'` | 起動OK・違反0件 |
| B：script-src から **`'unsafe-eval'` を外す** | **起動OK・違反0件** → 不要と判明 |
| C：script-src から `'unsafe-inline'` を外す | **起動しない**（`script-src-elem ← inline` の違反1件） |
| D：style-src から `'unsafe-inline'` を外す | 起動はするが `style-src-elem ← inline` の違反1件 |

### `script-src 'unsafe-inline'`：**使用しています（必須）**
- 理由：`index.html` はアプリ本体（約9,600行のReactコード）を `<script type="text/babel">` として**HTMLの中に直接書いている**構成です。Babel standalone がこれを変換し、**新しい `<script>` 要素として挿入して実行**します。この挿入されたスクリプトがインラインスクリプト扱いになるため、`'unsafe-inline'` が無いと**アプリが1行も動きません**（パターンC）。
- 依存している処理：`index.html` 1935行目の `<script type="text/babel" data-presets="env,react">` ブロック全体（＝アプリ全部）。
- 将来削除するには：JSXを事前ビルド（Vite等）して `app.js` を外部ファイルとして読む構成に変えれば、`script-src 'self' https://cdnjs...` だけで済み、Babel standalone も不要になります。ただし**今回は「CSPのためにビルド方式へ変更すること」は禁止**とのご指示のため、変更していません。

### `script-src 'unsafe-eval'`：**使用していません**
- Babel standalone は変換結果を `eval` ではなく `<script>` 要素の挿入で実行するため、無くても動くことを実測で確認しました（パターンB）。
- アプリ側にも `eval(` / `new Function` は0件です（§5）。

### `style-src 'unsafe-inline'`：**使用しています（必須）**
- 理由：`index.html` の `<style>` ブロック（約1,900行のCSS）と、Reactコンポーネントの `style={{...}}`（インラインstyle属性）が大量にあります。無効にすると v51.2 で追加した写真表示のCSS等が効かず、見た目が崩れます。
- 将来削除するには：`<style>` の中身を `style.css` に移し、`style={{...}}` をクラス指定に置き換える必要があります（大規模なUI改修になるため今回は対象外）。

---

## 5. XSS危険APIの検索結果

`.html` / `.js` / `.css` / `.ts` / `.json` のすべてを全文検索しました。

| 検索語 | 件数 |
|---|---|
| `innerHTML` | **0** |
| `outerHTML` | **0** |
| `insertAdjacentHTML` | **0** |
| `dangerouslySetInnerHTML` | **0** |
| `document.write` | **0** |
| `eval(` | **0** |
| `new Function` | **0** |

- 投稿本文・コメント・ニックネーム・ひとこと・自己紹介などの利用者入力は、すべて **Reactの通常のテキスト描画**（`{post.body}` のような形）で表示しており、HTMLとしては解釈されません。サニタイズライブラリの追加は不要と判断し、**追加していません**。
- 法務ページの `legal/legal.js` も `textContent` と `setAttribute('href', 'mailto:...')` のみで、HTML文字列の組み立てはありません。
- 画像URLは v51.2 で追加した検査（署名URLが `https://eszheiabjwehcbrteqza.supabase.co/storage/v1/` で始まるものだけ表示）がそのまま効いています。

---

## 6. 秘密情報の検索結果

`service_role` / `serviceRole` / `client_secret` / `GOCSPX`（GoogleのClient Secretの接頭辞）/
`-----BEGIN`（秘密鍵）/ `api_secret` / `SUPABASE_SERVICE` / JWT形式（`eyJ…`）を全文検索しました。

- **フロントエンド（`index.html` / `app.js` / `style.css` / 法務ページ）に秘密情報は1件もありません。**
- ヒットしたのは、次のいずれかだけです（いずれも問題なし）。
  - コメント文・README の説明文（「service_role key はここには存在しない」等の注意書き）
  - `supabase/functions/delete-account/index.ts` の `Deno.env.get('SERVICE_ROLE_KEY')`
    … **鍵の値そのものではなく、サーバー側の環境変数を読む行**です。値はSupabaseのシークレットにあり、ファイルには含まれていません。
- フロントにあるキーは `SUPABASE_ANON_KEY='sb_publishable_…'`（`index.html` 2601〜2602行目）だけです。これは**ブラウザに置く前提の公開キー**で、service_role とは別物です。実際の権限はRLSが決めています。
- Google の Client ID / Client Secret はフロントのコードに一切含まれていません（Supabase Auth 側の設定です）。

---

## 7. 実施した動作テスト

Chromium（iPhone 13相当の画面サイズ）で、**Netlify の `_headers` と同じヘッダーを実際に付けた状態**でアプリを動かし、CSP違反を `securitypolicyviolation` イベントとConsoleの両方で監視しました。Supabase への通信は、本番と同じRLSの判定を再現したモックを使っています（本番DBには接続していません）。

### 7-1. セキュリティヘッダー／CSP専用テスト：**27/27 合格**

| # | 内容 | 結果 |
|---|---|---|
| H1〜H6 | CSP・nosniff・Referrer-Policy・X-Frame-Options・Permissions-Policy が付与され、既存の Cache-Control が消えていない | ✅ |
| C1・C2 | CSP有効のままアプリが起動。React / ReactDOM / Babel / supabase-js の4本ともCDNから読み込み成功 | ✅ |
| C3 | 自サイト内の画像（webp / png）表示 | ✅ |
| C4 | Supabase REST への通信（タイムライン取得）が止まらない | ✅ |
| C5 | Storage の署名URL画像の表示 | ✅ |
| C6 | Googleアカウント画像（`lh3.googleusercontent.com`）の表示 | ✅ |
| C7・C8 | `blob:` プレビュー → 写真アップロード → タイムライン表示 | ✅ |
| C9・C10 | 運動記録の写真（`data:` URL）の保存とサムネ表示 | ✅ |
| C11 | パンダルーム・パンジローの画像表示 | ✅ |
| C12 | 英語モードでの起動 | ✅ |
| L | 法務5ページ（privacy / terms / community-guidelines / contact / account-deletion）の表示・CSS適用・`legal.js` による運営者名の差し込み・CSP違反0 | ✅ |
| V1〜V3 | ページ内で観測したCSP違反 **0件**、Console に `Refused to …` **0件**、JSエラー **0件** | ✅ |

### 7-2. v51.2の機能テスト（81項目）をCSP有効のまま再実行：**81/81 合格**
運動記録（写真なし／あり）、記録→ワンタップ投稿、コメント引継ぎ、写真引継ぎ、SNS単独投稿、
非公開ユーザーの保護、他人の投稿・画像を操作できないこと、画像以外の拒否、巨大画像の縮小、
連打での重複防止、Googleログインの遷移、メールログイン、日英切替、コメント・リアクション・フォロー、
パンジロー・パンダルーム、投稿削除、migration未適用環境での互換性 —— すべて v51.2 と同じ結果でした。

### 7-3. ご指示の確認項目 1〜19 との対応

| # | 項目 | 確認方法 |
|---|---|---|
| 1 | 初回表示 | ✅ 自動テスト（CSP有効） |
| 2 | メールログイン | ✅ 自動テスト（モック認証・本番アカウントは未確認） |
| 3 | Googleログイン | ✅ `authorize?provider=google` への遷移まで確認（Google側の実画面は未確認） |
| 4 | ログアウト | ⚠️ 自動テスト未実施（CSPは同一オリジンの処理のみで影響なし）。§8をご確認ください |
| 5〜7 | プロフィール表示・編集・公開/非公開 | ⚠️ 表示系は確認済み。編集・公開設定の保存は自動テスト未実施 |
| 8〜12 | 運動記録・投稿・投稿直後の反映・写真つき投稿・写真表示 | ✅ 自動テスト |
| 13〜15 | コメント・リアクション・フォロー | ✅ 自動テスト |
| 16 | パンダルーム | ✅ 画像表示を確認 |
| 17 | 法務ページ | ✅ 5ページすべて |
| 18 | 日英切替 | ✅ 自動テスト |
| 19 | アカウント削除画面 | ⚠️ 画面表示は未確認。通信先は Supabase 同一ドメインのため `connect-src` で許可済み |
| — | Console の CSP違反 | ✅ 0件（`Refused to load` / `Refused to connect` / `Refused to execute` なし） |

---

## 8. 公開手順と、公開後に見ていただきたいこと

1. `yurutore_v51_3_security_headers_clean.zip` を展開し、フォルダごと Netlify Drop へ。
   **v51.2 のZIPは上書きしていません**ので、問題があればすぐ戻せます。
2. 公開後、ブラウザで Ctrl+F5（強制再読み込み）。
3. ヘッダーが効いているかの確認（どちらか）
   - ブラウザの開発者ツール → Network → 一番上のドキュメント → Response Headers に
     `content-security-policy` があるか
   - `curl -I https://yurutore-club.netlify.app/` で確認
4. **実機で1周**：ログイン → 記録 → 写真つき投稿 → タイムライン表示 → ログアウト →
   Googleログイン → プロフィール編集 → 公開/非公開切替 → アカウント削除画面を開く（実行はしない）。
   スマホのブラウザでConsoleを見るのは大変なので、**「画像が出ない」「ボタンを押しても反応しない」が無ければOK**です。
5. 万一なにか表示されない場合（切り分け）
   - 画像だけ出ない → `img-src` にドメイン追加が必要（そのURLをお知らせください）
   - 画面が真っ白 → `script-src` の問題。`_headers` の `Content-Security-Policy:` の行を消して再アップすれば即復旧します（他のヘッダーは残して構いません）

---

## 9. 既知の制約

1. **`'unsafe-inline'`（script/style）が残っています。** 現在の「HTMLにReactを直接書く」構成では外せません（§4）。外すにはビルド方式への変更が必要で、今回は禁止事項のため実施していません。CSPの主な効果は「外部ドメインの読み込み・通信の遮断」「埋め込み禁止」「プラグイン禁止」に限られます。
2. **`https://*.googleusercontent.com` はワイルドカード**です。Googleがアイコンを返すホスト名が `lh3` 以外になることがあるためで、Google のユーザーコンテンツ配信に限定した最小の指定です。
3. **Realtime を使い始める場合**は `connect-src` に `wss://eszheiabjwehcbrteqza.supabase.co` の追加が必要です。
4. **CDNのバージョンを上げる／別CDNへ変える場合**は `script-src` の更新が必要です。
5. `Permissions-Policy` から `bluetooth=()` は外しました。Chromeが「Unrecognized feature」の警告をConsoleに出すためです（機能としては未使用のまま）。ブラウザが知らない機能名は無視されます。
6. 本番Supabase・実機スマホ・本物のGoogleログイン画面での確認はこの環境からできていません（§7-3 の⚠️）。
7. Netlify の `_headers` は、パスが複数のルールに一致した場合それぞれのヘッダーが適用されます。HTMLページは `/*` のみに一致するため、今回のセキュリティヘッダーは確実に付きます。`/assets/*` `/images/*` のキャッシュ設定も従来どおりです。
8. アカウント削除 Edge Function の CORS は v50 から `'*'` のままです（今回は変更していません）。将来 `https://yurutore-club.netlify.app` に限定することをおすすめします。
