# ゆるトレ倶楽部 モバイル（Capacitor）土台

既存のWebアプリを、そのまま Android / iOS の共通アプリとして包むための土台です。
**公開URLを読み込む方式ではありません**（`server.url` は設定しない）。画面・React・Supabase SDK・
コンパイル済みJSXをすべてアプリ内に同梱し、実行時にCDNやBabelを使いません。

状態: **開発用の土台。ストア提出できる状態ではない**（下の「未対応」を参照）。

## 版と環境要件（2026-10-29 に公式docsで確認）

| 項目 | 値 | 出典 |
|---|---|---|
| Capacitor | 8.5.3（core / cli / android / ios）。最新は 8.6.0 だが公開から日が浅いため1つ前を採用 | npm registry |
| プラグイン | @capacitor/app 8.1.2、@capacitor/browser 8.0.5 | npm registry |
| Node.js | 22 以上 | capacitorjs.com/docs/getting-started/environment-setup |
| Android Studio | 2025.2.1（Otter）以上。SDK: minSdk 24 / compile・target 36 | 同上、docs/updating/8-0 |
| Xcode | 26.0 以上（macOS が必要）。iOS 15.0 以上。依存管理は Swift Package Manager | 同上 |

Windows では Android と iOS のプロジェクト生成までは可能だが、iOS のビルドと実機試験には Mac が必要。

## 仕組み

- `scripts/build-mobile.cjs` が `mobile/www` を作る。**既定は staging**。
  - リポジトリ直下の `index.html` の JSX を `app.js` と同一か確認してからコンパイルする。
  - 公開allowlist（`scripts/build-public.cjs`）と同じ静的ファイルをコピーする（`_headers` は除く）。
  - Web版のコードは書き換えず、ビルド時だけ、決まった箇所（一致しなければ停止）を差し替える。
    - Supabase の接続先と公開キー（staging のとき）
    - SDK の設定: PKCE、URLからのセッション検出なし、接続先プロジェクト以外への通信を拒否
    - 認証の戻り先: `<appId>://auth/callback`
    - Google ログイン: システムのブラウザ（Custom Tabs / SFSafariViewController）で開く
  - 出力の検査: 反対側プロジェクトの参照がないこと、外部の script がないこと、実行時JSXがないこと
  - CSP: `script-src 'self'`、`connect-src` はビルド対象の Supabase だけ
- `src/native-bridge.js`（アプリ内でのみ読み込む）
  - OAuth: 認可URLが「ビルド対象の Supabase」「戻り先が完全一致」「code_challenge が s256」の
    ときだけブラウザで開く。戻りは `scheme://auth/callback` の完全一致だけ受け付け、code を交換する。
  - 外部リンク: アプリ内のページ以外は、サポート用メールアドレスの mailto だけを許可する。他は開かない。
  - Android の戻るボタン: 開いているシート → 全画面 → 前のページの順で閉じ、最後はアプリをバックグラウンドへ移す。
- 法務ページにも同じスクリプトを読み込み、戻るボタンとリンクの制限を効かせる。

## 使い方（staging）

```
cd mobile
npm ci --ignore-scripts
# staging の公開キー（sb_publishable_...）を環境変数で渡す。リポジトリには置かない。
YT_STAGING_PUBLISHABLE_KEY=... npm run build:staging
npx cap sync          # www をネイティブ側へコピーする（端末でビルドする人が実行）
npm test              # この土台のテスト（ネットワーク不要）
```

本番向けの出力は `--target=production --release-approval=<承認ラベル>` と
`YT_MOBILE_PRODUCTION_BUILD=I_HAVE_RELEASE_APPROVAL` の両方が必要。さらに、appId が開発用の
仮ID（`*.dev.placeholder`）のままでは拒否する。現時点では作れない。

## ID（すべて仮・未登録）

- appId / applicationId / Bundle ID: `club.yurutore.dev.placeholder`
- 認証の戻り先: `club.yurutore.dev.placeholder://auth/callback`
- 正式IDは、ストアのアカウントと ID 登録を本人が行ってから決める。変更する箇所は
  `capacitor.config.json`、`android/app/build.gradle`、`android/app/src/main/res/values/strings.xml`、
  Java パッケージのフォルダ、`ios/App/App.xcodeproj/project.pbxproj`、`ios/App/App/Info.plist`。

## 未対応・承認や登録が必要なもの

| 項目 | 状態 | 必要なこと |
|---|---|---|
| staging の Redirect URL 登録 | 未 | Supabase staging の Auth に `club.yurutore.dev.placeholder://auth/callback` を追加（Work管理） |
| Google ログインの実機確認 | 未 | 上の登録後、Android/iOS 実機で確認 |
| Apple でサインイン | **未実装（無効）** | Apple Developer 登録、Services ID・鍵の作成、Supabase の Apple provider 設定が必要。ブリッジは provider 一覧で無効化しており、画面にボタンはない |
| メール確認・パスワード再設定のアプリ内復帰 | 未検証 | 戻り先はアプリのスキームになる。メールアプリからの復帰と PASSWORD_RECOVERY の動きを実機で確認する |
| 署名 | 未 | upload key / 配布証明書の作成は本人。リポジトリに鍵を置かない |
| アイコン・スプラッシュ | Capacitor 既定のまま | 素材の作成 |
| Android の画面端（edge-to-edge） | 未検証 | targetSdk 36 では画面端まで描画される。既存CSSの `env(safe-area-inset-*)` が Android WebView で効くかを実機で確認する |
| ログイン中のネット不通 | 未検証 | 体験版がオフラインで動くことは試験済み。ログイン中の表示は実機で確認する |
| **運動記録の永続保存** | **提出ブロッカー（未対応）** | 記録は Web版と同じ WebView の localStorage にあり、Capacitor 公式 docs（Preferences）は OS が localStorage を消す場合があると明記している。端末内の永続保存と起動時の復元（写真を含むサイズを考慮）を設計する。Preferences は小さな設定用なので、記録や画像の保存先にはしない |
| **ログインセッションの保存先** | **提出ブロッカー（未対応）** | SDK の既定どおり localStorage。Keychain / Keystore に保存するには公式でないプラグインの選定が必要（未承認）。強制終了・再開・トークン更新・ログアウトの実機確認と合わせて決める |
| OS バックアップ | 対応済み | `allowBackup="false"` と data_extraction_rules で、クラウドバックアップと端末間転送から WebView の保存領域を除外（機種変更で記録は引き継がれない） |
| セッション更新の再開 | 対応済み（実機未確認） | アプリが前面のときだけ自動更新し、背面で停止（appStateChange） |
| Google ログイン失敗の表示 | 対応済み（実機未確認） | 戻ってきた時点の失敗（拒否・交換失敗）は画面上部に日英で表示する |
| プライバシーマニフェスト | 下書き | `ios/App/App/PrivacyInfo.xcprivacy`（追跡なし）。収集データの種類は Work の申告下書きと最終ビルドに合わせて確定する |
| SDK ライセンス・Gradle 同期 | 未実施（ローカル） | Android Studio を開いた人が行う。CI は GitHub 標準 runner のイメージに含まれる SDK をそのまま使い、ライセンス承諾の操作はしない |

## Compile CI（`.github/workflows/mobile-compile.yml`）

- 対象は PR 上の `mobile/**`・`index.html`・`app.js` の変更と、手動実行。権限は `contents: read` だけで、action は SHA で固定、各ジョブにタイムアウトを設定している。
- 標準 runner だけを使う（`ubuntu-latest`、`macos-26`）。secret・署名・成果物のアップロード・デプロイはない。
- 鍵はコンパイル確認用のダミーで、staging バンドルとしてビルドする。Android は署名なしの debug APK、iOS は `CODE_SIGNING_ALLOWED=NO` のシミュレータ向けビルド。
- Gradle wrapper の jar と配布ファイルは、公式のチェックサムで確認する。
