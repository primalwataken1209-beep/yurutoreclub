# ゆるトレ倶楽部 stagingテスト版

作業ブランチ: `staging/isolated-test-app`
基準: PR #1 / `aaa5e94633c47241d509993386cec89e7874e276`
Supabase: `yurutore-club-staging` / `knftduojdalnawvkbelt`

このブランチはテスト専用で、mainやPR #1へマージしない。

## 接続の分離

`app.js`と配信する`index.html`の接続先・公開キーをstagingに固定した。
秘密鍵、service role key、SMTP認証情報、Google OAuthの秘密情報は追加しない。
`stagingFetch`はstaging以外のAPI originをSDKから呼び出せないようにする。
実レスポンスのCSPでもconnect-srcをstagingのHTTPS/WSSに、画像を同一サイト・data/blob・staging Storageに限定する。
Googleログインはボタンとハンドラーの両方で無効化している。

メール登録・確認メール再送・パスワード再設定の戻り先はテスト版のorigin直下に限定。
本番アプリのoriginや任意ドメインでは戻り先を生成せず失敗する。
Supabase側のSite URL / Redirect URLs保存は管理画面へのログイン後に行う必要がある。
確認メールを無効にしたり、本番のSMTP設定をコピーしたりしない。

## stagingデータベースで適用した変更

`staging/bootstrap.sql`は次の不足物を新規作成した内容の記録。適用済みなので再実行しない。

- blocks: 本人だけがブロックの参照・追加・解除が可能
- reports: 本人の通報を追加できる。一般クライアントは閲覧・更新・削除不可
- app_events: 許可した5イベントについて本人のINSERTだけ可能
- user_progress: 本人の状態だけを読取・保存・更新・削除可能
- avatars: JPEG、最大3MiB。アプリのgetPublicUrl仕様に合わせ公開読取。アップロード・上書き・削除は本人の`{uid}/avatar.jpg`だけ許可。合成したテスト画像だけを使用する

各テーブルでRLSを有効にし、最小限のGRANTと削除CASCADEを設定した。
`staging/harden-existing.sql`は既存のpublic_profilesビューをsecurity_invokerに変更し、トリガー関数の公開実行権限とsearch_pathを補強した記録。
これらのSQLは指定stagingだけに適用。本番データを参照・コピーしていない。

既存`post-images`は非公開JPEG/3MiB、既存`delete-account`はstagingに配備済みであることを読み取り確認。秘密情報や関数のデプロイ設定は変更していない。
既存yt_follow_countsはログインと対象プロフィールの公開範囲を確認して集計値だけを返す設計のため、意図したauthenticated向けSECURITY DEFINER RPCとして維持。Supabase Advisorの警告1件が残る。

## Netlify

`netlify.toml`はこのブランチだけの設定で、プレビュービルドから`staging-dist`を公開する。
新規Netlifyプロジェクト・ドメイン・有料オプション・Secretsを作らない。
既存サイトのDeploy Previewで本番とは別のURLを使用する。PR #5の比較先mainはプレビュー検出用で、mainのコードを変更するものではない。PRはマージ禁止。

ビルドには`CONTEXT=deploy-preview`と`BRANCH=staging/isolated-test-app`が必要。
production contextやmainからのビルドは拒否する。SQL・テスト・履歴資料は配信しない。
本番サイト全体の設定、Production branch、環境変数、既存Secretsは変更しない。
プレビューの実URL確定後、stagingのSite URLとRedirect URLsに同じURLを完全一致で登録する。

公式資料:
- https://supabase.com/docs/guides/auth/redirect-urls
- https://supabase.com/docs/guides/auth/row-level-security
- https://docs.netlify.com/deploy/deploy-types/deploy-previews/
- https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/how-credits-work/

## 検証

既存40件に、接続先・戻り先・API拒否・公開ファイル・staging RLSの5件と、実Chromiumでの通信遮断1件を追加した。
Chromiumの通信遮断検査はネットワークなしの隔離コンテナで、stagingの応答も合成する。本番APIや画像がネットワーク処理へ渡る前に拒否されることを確認する。
実stagingでも合成した2ユーザーのトランザクションで本人操作と他人のデータの非公開を確認し、ロールバック後にテストユーザーが0件であることを確認した。

実メール・パスワードの正常ログイン、メール確認、パスワード再設定は、管理画面の戻り先保存と利用者によるメール確認・パスワード入力後に行う。未実施を成功扱いしない。
