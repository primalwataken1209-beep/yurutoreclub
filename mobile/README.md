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
`YT_MOBILE_PRODUCTION_BUILD=I_HAVE_RELEASE_APPROVAL` の両方が必要で、appId が正式 ID `club.yurutore.app` でなければ拒否する。
正式 ID がリポジトリに入っていても、承認ラベルと確認の変数がなければ作れない（テストで確認）。

## ID

- appId / applicationId / Bundle ID: `club.yurutore.app`（2026-10-31 本人承認。閉鎖テストも正式公開と同じ ID）
- 認証の戻り先: `club.yurutore.app://auth/callback`（staging と本番で同じ。接続先の Supabase だけが違う）
- Apple：Team `9S43D53PCM` に App ID を登録済み。証明書・Profile・Keys・App Store Connect のアプリは未作成。Google Play のアプリは未作成
- staging のビルドも同じ ID になるため、ストアへ上げる前に `build-info.json` が production であることと、表示名の「STG」を外したことを確認する
- 詳細と、ID が出てくるファイルの一覧は `docs/mobile-ids-and-auth.md`

## 未対応・承認や登録が必要なもの

| 項目 | 状態 | 必要なこと |
|---|---|---|
| staging の Redirect URL 登録 | 未 | Supabase staging の Auth に `club.yurutore.app://auth/callback` を追加（Work管理） |
| Google ログインの実機確認 | 未 | 上の登録後、Android/iOS 実機で確認 |
| Apple でサインイン | **コードのみ実装・既定で無効・実機未確認** | PKCE ブラウザ方式とボタン（iOS のみ、`--enable-apple-signin` のビルドだけ）、13 歳確認、失敗時の文言を実装しテスト済み。Apple Developer Program の契約と App ID 登録は済み。Sign in with Apple の有効化、Services ID・鍵の作成、Supabase の Apple provider 設定、退会時のトークン取り消し（設計案は `docs/apple-token-revocation-design.md`）は未実施・承認待ち。詳細は `docs/mobile-ids-and-auth.md` |
| メール確認・パスワード再設定のアプリ内復帰 | 未検証 | 戻り先はアプリのスキームになる。メールアプリからの復帰と PASSWORD_RECOVERY の動きを実機で確認する |
| 署名 | 未 | upload key / 配布証明書の作成は本人。リポジトリに鍵を置かない |
| アイコン・スプラッシュ | Capacitor 既定のまま | 素材の作成 |
| Android の画面端（edge-to-edge） | 未検証 | targetSdk 36 では画面端まで描画される。既存CSSの `env(safe-area-inset-*)` が Android WebView で効くかを実機で確認する |
| ログイン中のネット不通 | 未検証 | 体験版がオフラインで動くことは試験済み。ログイン中の表示は実機で確認する |
| 運動記録の永続保存 | **実装済み・実機未確認（提出前に実機確認が必須）** | `src/native-storage.js`。アプリのキー（`yurutore-…` / `yurutore_…`）を、バックアップ対象外のアプリ専用ファイル（iOS `Library/NoCloud`、Android は files 領域で data_extraction_rules により除外）へ2つのファイルを交互に書いて保存する。localStorage が消えたときだけ起動前に復元し、アプリはその後に起動する。保存や復元の失敗は画面に表示し、成功扱いにしない。復元に失敗したら保存済みの写しを上書きしない。写真入りの記録も同じ写しに入る（上限は localStorage と同じ）。公式 `@capacitor/filesystem` 8.1.5 を使用。Preferences は使わない |
| ログインセッションの保存先 | **実装済み・実機未確認（提出前に実機確認が必須）** | `@aparajita/capacitor-secure-storage` 8.0.1（MIT）。iOS は Keychain（この端末のみ・iCloud 同期なし・初回ロック解除後）、Android は Keystore の AES-GCM で暗号化。localStorage にはセッションを置かず、安全な保存に失敗したらログイン失敗として表示する。ログアウト（退会後を含む）で `yt-session_` の項目をすべて消す。iOS の Keychain はアプリを削除しても残るため、新規インストール後の初回起動で消す。強制終了・再開・トークン更新・ログアウトは実機で未確認 |
| OS バックアップ | 対応済み | `allowBackup="false"` と data_extraction_rules で、クラウドバックアップと端末間転送から WebView の保存領域を除外（機種変更で記録は引き継がれない） |
| セッション更新の再開 | 対応済み（実機未確認） | アプリが前面のときだけ自動更新し、背面で停止（appStateChange） |
| Google ログイン失敗の表示 | 対応済み（実機未確認） | 戻ってきた時点の失敗（拒否・交換失敗）は画面上部に日英で表示する |
| プライバシーマニフェスト | 下書き | `ios/App/App/PrivacyInfo.xcprivacy`（追跡なし）。収集データの種類は Work の申告下書きと最終ビルドに合わせて確定する |
| SDK ライセンス・Gradle 同期 | 未実施（ローカル） | Android Studio を開いた人が行う。CI は GitHub 標準 runner のイメージに含まれる SDK をそのまま使い、ライセンス承諾の操作はしない |

## Compile CI（`.github/workflows/mobile-compile.yml`）

- 対象は PR 上の `mobile/**`・`index.html`・`app.js` の変更と、手動実行。権限は `contents: read` だけで、action は SHA で固定、各ジョブにタイムアウトを設定している。
- 標準 runner だけを使う（`ubuntu-latest`、`macos-26`）。secret・リリース署名・成果物のアップロード・デプロイはない。
- 鍵はコンパイル確認用のダミーで、staging バンドルとしてビルドする。Android はリリース署名なしのデバッグビルド（`assembleDebug` はツールが自動生成する使い捨てのデバッグ鍵で署名する。配布用ではない）、iOS は `CODE_SIGNING_ALLOWED=NO` のシミュレータ向けビルド。
- Gradle wrapper の jar と配布ファイルは、公式のチェックサムで確認する。

## 端末保存の方式の選定（2026-10-31）

| 候補 | 評価 | 結論 |
|---|---|---|
| `@capacitor/filesystem` 8.1.5 | Ionic公式、MIT、Capacitor 8 用、2026-10-15 公開。`LIBRARY_NO_CLOUD`（iOS の Library/NoCloud）に対応。同梱依存の既知脆弱性 0 件 | 記録の保存に採用。JS 側は公式の `registerPlugin('Filesystem')` だけを使い、追加の JS（synapse）は同梱しない |
| `@capacitor/preferences` | 公式だが小さな設定用（公式 docs） | 記録や画像の保存先にしない |
| `@aparajita/capacitor-secure-storage` 8.0.1 | MIT、Capacitor 8 対応、2026-09-23 公開、継続して更新されている。iOS は KeychainSwift（MIT、SPM で `from: 21.0.0`）、Android は Keystore AES-GCM と SharedPreferences。アクセス設定（この端末のみ）と iCloud 同期の切り替えがある。同梱依存の既知脆弱性 0 件 | セッションの保存に採用。依存に含まれる `@capacitor/keyboard` は直接の依存ではないため、ネイティブには登録されない（`cap sync` で確認） |
| `capacitor-secure-storage-plugin` 0.13.0 | MIT、Capacitor 8 対応だが更新間隔が長く、0.x 系 | 見送り |
| `@capgo/capacitor-native-biometric` | MPL-2.0、生体認証が主目的 | 目的外のため見送り |
| 独自の小さなネイティブブリッジ | 依存は減るが、暗号処理を新しく書くことになり、この環境では実機で動かして確かめられない | 今回は見送り。上の採用ライブラリに問題が見つかった場合の代替案 |

Android のデバッグビルドは、ツールが自動生成するデバッグ鍵で署名される。配布できる署名（リリース署名）は作っていない。