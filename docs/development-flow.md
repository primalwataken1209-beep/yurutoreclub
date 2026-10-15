# 半自動開発フロー

PRで検証結果を確認し、取り込み・公開・本番SQL・Edge Functionの適用はオーナーが個別に承認します。
このフローはデプロイ、SQLの外部適用、Secrets更新、自動マージを行いません。

## 調査時点（2026-10-15）

- main: `e987939cb885feb16a7fee7be0dafd7e0cc2446c`。静的HTMLとブラウザ内Babel/React。`index.html`にアプリ本体があり、`app.js`にも同じコードを保持しています。
- PR #1: `fix/v51-4-5-integration` / `fb7af8a29e11061059ce1ed1f903f95bba187542`。v51.4.6のRLS・写真削除・退会時エラー処理を含み、Codexの同HEAD再レビューは重大な指摘なし。
- PR #2: `fix/v51-3-security-headers` / `2586c70b8a97e7a9fe4d82b7cdbab49407f22040`。mainから独立し、変更は `_headers` のみ。CSPの実ブラウザ検証は別途必要。
- テスト、package.json、`.github/workflows`、`netlify.toml` は既存コードにありませんでした。
- PR #1/#2 のNetlify botコメントから Deploy Previewの既存連携を確認。Netlify管理画面の本番ブランチ・環境変数・ビルド設定は未確認。PRの説明には「mainへのマージ＝本番公開」と明記されています。
- アプリのSupabase URLは本番プロジェクトを直接参照。既存Deploy PreviewをDBから隔離済みとは扱いません。今回のテストはPreviewを開かず、アカウントA/Bによる本番書き込みも行いません。
- Codex botが既存連携とPR作成時レビューの案内を投稿済み。新しいCodex ActionsやAPIキー設定は追加しません。自動レビュー設定画面の現在のトグル自体は未確認です。

## CIと検証範囲

`npm ci --ignore-scripts` → `npm test`（Node 22）。GitHub Actionsでは依存取得後、公式Node 22イメージを取得してdigestを記録し、外部通信禁止のDockerコンテナでテストします。コンテナは専用UID/GID（65534）・全capability削除・再昇格禁止・ルートファイルシステムと作業フォルダの読み取り専用・一時領域のみ書き込み可能に設定します。runnerの環境変数・コマンドファイル・Dockerソケットは渡しません。起動時に専用UID・環境分離・読み取り専用・権限ゼロ・再昇格禁止・ネットワーク分離を確認し、不一致ならテストを開始せず失敗します。ログを表示するときはGitHub workflow commandの解釈を停止し、テスト出力から後続ステップへ命令が渡らないようにします。
権限は `contents: read` のみ。Secrets、DB接続先、実ユーザーの認証情報を渡しません。結果はチェックの成否、Actions Summary、14日保存のTAP artifactで確認できます。

- 静的検証: app.js / index.html内JSXの構文と一致、法務JSの構文、日英辞書キー一致。
- 基本動作: JSDOMにローカルReactを読み込み、初期画面と体験版入口の画面変化を確認。外部リソース自動ロードを無効化し、fetch/XHR/WebSocketを拒否。
- RLS: PGliteのメモリ内PostgreSQLへ旧版 `supabase_v28_events.sql`、続いて `supabase/migrations/` の全SQLを順番に適用。auth/storageの最小スキーマをテスト内で用意し、架空ユーザーA/Bとanonを非管理者ロールに切り替えて検証。非公開投稿・コメント・リアクション・写真、他人名義の書き込み、削除済み公開投稿を確認。app_eventsは本人INSERTのみ許可、他人名義INSERT/閲覧/更新/削除を拒否し、v50での孤立行整理・CASCADE外部キー追加・Auth退会時に本人分だけ連鎖削除されることを確認。
- 投稿写真削除: 実関数を抽出してモックに接続。写真を先に削除、Storage失敗で投稿更新しない、DB更新失敗を報告、他人の写真を消さないことを確認。
- 退会: 実Edge FunctionをTypeScript変換し、SDKの代わりにモックを注入。両バケットの通信/権限/サーバー障害でDB/Auth削除を止めること、バケット不存在のみスキップ、複数ページ削除、認証本人だけが対象になることを確認。

これはSupabase本番の設定確認や実サービス統合テストの代わりではありません。JSDOMは実ブラウザのCSP・レイアウト・OAuthを検証しません。Storage APIもモックで、実ファイルの削除は行いません。

## 取り込み順序と承認

1. このCI用PRはPR #1のブランチ宛てです。mainを変更せず、v51.4.6修正に対して検証します。CI用PRのマージもレビュー後に人が行います。
2. PR #1へ取り込まれた後はPR #1の新しい更新でもActionsが動きます。mainへ承認して取り込んだ後は、将来の全PRで自動検証されます。既存PR #2へ過去に遡ってチェックが付くわけではありません。mainへの導入後にPR #2を更新して再実行してください。
3. mainへ入れる操作は既存Netlify本番公開を起動し得ます。必ずオーナーの明示承認が必要です。Actionsからマージ・公開は行いません。
4. 本番SupabaseのSQL適用・Edge Functionデプロイ・Storage設定変更は、それぞれ差分と読み取り確認結果をレビューしてから別途承認してください。今回実行しません。
5. 実ブラウザ/CSP/OAuth/写真アップロードの統合テストには隔離したテストSupabaseが必要です。接続先の切替、テストアカウント、Netlify Previewの隔離方針を先に承認してください。本番A/Bアカウントでは書き込みテストをしません。

## 未設定・未確認の権限とSecrets

- 今回のCIには追加Secrets不要。GitHub Secretsの値・一覧は取得せず、変更もしません。
- GitHub Actionsの実行許可・許可Actionの組織制限は実行結果で確認します。制限があれば管理者の承認が必要です。
- branch protection / 必須チェック設定は変更しません。安定実行を確認後、`Static, smoke and security (offline)` を必須にするかオーナーが判断してください。
- Netlify管理画面・本番環境変数、Supabase管理権限やSecrets、Codex自動レビューの設定トグルは未確認です。新しいAPIキーやservice_roleキーはこのCIに不要です。
- 失敗したテストの修正は作業ブランチ→PR→人の承認。本番への自動修正・自動適用はありません。
