# モバイルアプリの ID と認証の戻り先（内部資料）

2026-10-31 更新。ストアの登録情報、署名鍵、Supabase の設定は、それぞれ本人の承認を得てから扱う。

## 1. アプリ ID

| 項目 | 値 | 状態 |
|---|---|---|
| Android applicationId / iOS Bundle ID | `club.yurutore.app` | **本人承認済み（2026-10-31）**。閉鎖テストも正式公開と同じ ID |
| Apple | Team `9S43D53PCM` に App ID `club.yurutore.app` を登録済み | Apple Developer Program の契約は有効・更新契約に同意済み。証明書・Provisioning Profile・Keys・App Store Connect のアプリはまだ 0 件 |
| Google Play | 本人確認は完了 | アプリは未作成 |

- 以前の開発用の仮 ID（`club.yurutore.dev.placeholder`）と、staging 用の別 ID 案（`club.yurutore.app.staging`）は使わない。
- staging に接続するビルドも同じ ID になる。**staging のビルドをストアへ上げないこと**：上げる前に、AAB / アプリ内の
  `public/build-info.json` が `"target": "production"` であり、`app.bundle.js` が本番プロジェクトを指すことを確認する。
  あわせて、表示名（`capacitor.config.json` の appName、Android の `strings.xml`、iOS の CFBundleDisplayName）の「STG」を外す。
- 本番向けの出力は `build-mobile.cjs` のガードで、承認ラベル・`YT_MOBILE_PRODUCTION_BUILD=I_HAVE_RELEASE_APPROVAL`・
  正式 ID の3つがそろわないと作れない。正式 ID だけでは開かない（`build-mobile.test.cjs` で確認）。
- ID が出てくるファイル：`mobile/capacitor.config.json`、`mobile/android/app/build.gradle`（namespace・applicationId）、
  `mobile/android/app/src/main/res/values/strings.xml`（package_name・custom_url_scheme）、
  `mobile/android/app/src/main/java/club/yurutore/app/MainActivity.java`、
  `mobile/ios/App/App.xcodeproj/project.pbxproj`（PRODUCT_BUNDLE_IDENTIFIER）、`mobile/ios/App/App/Info.plist`（CFBundleURLSchemes）。
  テストがすべての一致を確認する。

## 2. 認証の戻り先（Google・Apple・メールリンク共通）

戻り先 URL は `club.yurutore.app://auth/callback`（完全一致）。staging ビルドと本番ビルドで同じ URL を使い、
接続する Supabase プロジェクト（staging `knftduojdalnawvkbelt` / 本番 `eszheiabjwehcbrteqza`）だけが異なる。

- アプリは PKCE（`code_challenge_method=s256`）でシステムのブラウザ（Android Custom Tabs / iOS SFSafariViewController）を開く。
  認可 URL は「ビルド対象の Supabase」「戻り先が完全一致」「s256」のすべてを満たすときだけ開く（`native-bridge.js`）。
- 戻りは scheme・host（`auth`）・path（`/callback`）が完全一致するものだけ受け付け、`code` を交換する。
  別のアプリが同じスキームを登録して code を横取りしても、端末内の code_verifier がないため交換できない（PKCE の目的）。
- **Supabase 側の設定（承認後に Work が実施）**：各プロジェクトの Authentication → URL Configuration → Redirect URLs に
  `club.yurutore.app://auth/callback` をワイルドカードなしで追加する。Site URL と Web 版の戻り先は変えない。
- Google Cloud 側：Supabase の Google provider が使う Web クライアントの承認済みリダイレクト URI は
  `https://<project>.supabase.co/auth/v1/callback` のまま。アプリはブラウザ方式なので、Android 用 OAuth クライアント（SHA-1）は不要。
- メール確認・パスワード再設定のリンクも同じ戻り先になる。メールアプリからカスタムスキームで戻れるかは、実機で確認する。
- 将来の選択肢：https の App Links / Universal Links。公開サイトへのファイル追加と Netlify の公開が必要なため、今回は採用しない。

## 3. Sign in with Apple（コードのみ・既定で無効）

- 実装済み：Google と同じ PKCE ブラウザ方式で `provider: 'apple'` を開く処理と、iOS だけに出す
  「Appleでサインイン / Sign in with Apple」ボタン（新規登録では 13 歳以上の確認を必須にする）、開始に失敗したときの Apple 用の文言。
- **既定のビルドでは無効**。`build-mobile.cjs --enable-apple-signin` のビルドで、iOS のときだけ表示する。
- 済んでいること：Apple Developer Program の契約、App ID `club.yurutore.app` の登録（Team `9S43D53PCM`）。
- 有効にする前に必要なこと（未実施・本人の操作と承認が必要）：
  1. App ID で Sign in with Apple の機能を有効にする
  2. Services ID と戻り先（Supabase の `https://<project>.supabase.co/auth/v1/callback`）の登録
  3. Sign in with Apple 用の鍵（.p8）の作成と、Supabase の Apple provider への設定（秘密情報。チャット・Git に出さない）
  4. 退会時の Apple トークンの取り消し（Apple の要件）。設計と隔離試験の案は `docs/apple-token-revocation-design.md`
  5. ボタンの見た目が Apple のガイドラインに合っているかの確認（現在は黒・全幅・システムフォント）
- 審査ガイドライン 4.8 の扱いは Work が公式文書で確認中。

## 4. 実機確認（最小限の案）

Xperia での確認はまとめて1回にする。前提：staging の Redirect URL の登録（2章）が済み、staging 用のビルドを端末に入れる方法
（Android Studio からの実行、または承認を得た配布方法）が決まっていること。

1. アプリを入れて起動し、体験版で運動を1件記録する（褒め画面が出る）
2. アプリを完全に終了して再起動し、記録が残っていることを見る
3. Google でログインし、アプリに戻ってログイン状態になることを見る（拒否した場合はエラー表示が出る）
4. ログアウトし、もう一度起動してログインしていないことを見る
5. Android の戻るボタンで、シート → 画面 → アプリが閉じる順になることを見る
6. 画面の上下（ステータスバー・ナビゲーションバー）に表示が重ならないかを見る

保存先のファイル、Keystore、OS がデータを消したときの復元は、端末の操作だけでは確認しにくいため、
開発者向けの手順（adb など）で Work または開発者が確認する。
