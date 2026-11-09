# Android：署名前の staging AAB 候補の取得と、署名の手順（内部資料）

2026-11-01。**準備だけ。** 手動の workflow はまだ一度も実行していない（実行できる条件は1章）。署名・鍵の作成・ストアへの
アップロード・配信はしていない。2章の署名手順は、承認されるまで実行しない。

## 1. 手動専用 workflow：`.github/workflows/mobile-staging-aab.yml`

| 項目 | 内容 |
|---|---|
| 起動 | `workflow_dispatch` だけ（push や PR では動かない）。対象ブランチは `claude/store-release-prep` に固定 |
| 入力 | staging の公開キー（`sb_publishable_…`）だけ。最初の手順でマスクし、`sb_secret_`・`service_role`・JWT 形式は拒否。コマンドの引数には載せず env で渡す |
| 固定 | `--target=staging`、appId `club.yurutore.app`（違えば停止）。本番の出力に必要な変数・承認ラベルは使わない |
| ビルド | `bundleRelease`（署名設定なし）。Gradle wrapper は公式のチェックサムで確認 |
| 検査 | `mobile/scripts/inspect-staging-aab.sh`：署名なし（jarsigner が unsigned と報告）、package が正式 ID、debuggable でない、cleartext 通信なし、allowBackup=false、権限は INTERNET だけ、build-info が staging・正式 ID・staging の URL、戻り先が `club.yurutore.app://auth/callback`、入力した公開キーが同梱されている、本番の参照がない、secret らしい値がない、compile 用のダミーキーでない |
| 成果物 | 検査がすべて合格したときだけ、`app-release.aab`・`app-release.aab.sha256`・`build-info.json` を **3日間** だけ保存 |
| 権限 | `contents: read` だけ。action は SHA で固定。secret は使わない |

検査スクリプトは、PR の compile CI（`mobile-compile.yml`）でも毎回試運転する。ダミーキーでビルドした AAB に対して、
「compile 用のダミーキー」の確認だけで止まることを確かめる。これで、それより前の全項目が本物の AAB で通ることが分かる。

### 1-1. main を変えずに実行できるか（調査結果）

**できない。** GitHub の公式資料（Events that trigger workflows → workflow_dispatch）には、「workflow のファイルがデフォルトブランチに
存在する場合にだけ、このイベントで実行される」とある。Run workflow のボタンも、デフォルトブランチにファイルがあるときだけ出る。
一度実行された workflow は、API や CLI で任意のブランチを指定して起動できるが、その前提もデフォルトブランチにファイルがあること。
この workflow はまだ main にないため、隔離ブランチに置いたままでは起動できない。main の変更・マージはしていない。

実行するための選択肢（どれも**別の承認が必要**）：

| 案 | 内容 | 必要な承認 |
|---|---|---|
| A | このファイルだけを main に入れる（PR を分けてマージ）。その後 `gh workflow run mobile-staging-aab.yml --ref claude/store-release-prep -f staging_publishable_key=…` または Actions の画面から起動 | main の変更 |
| B | PR9 にラベルを付けたときに動く `pull_request: types: [labeled]` の別 workflow にする。ただし入力欄がないため、公開キーをリポジトリの Actions 変数にするか、ブランチに置く必要がある | リポジトリ設定の変更、または公開キーの配置の判断 |
| C | 開発者の PC（Android Studio と Java 21）で同じ手順を実行し、`inspect-staging-aab.sh` で確かめる | ローカルでのビルドの実施 |

### 1-2. 実行するときの注意

- 公開リポジトリなので、workflow の実行記録と成果物は GitHub のアカウントがあれば誰でも見たり取得したりできる。
  成果物は署名のない staging 用の AAB で、そのままでは端末に入らない。保存期間は3日。
- 入力した公開キーは、実行のイベント情報（API）からは見える。公開キーはもともとアプリに同梱して公開される値なので、
  ここには **公開キー以外を入れない**（workflow でも拒否する）。
- AAB は署名前の候補。端末で試すには、2章の署名と、配信方法（Play の内部テストなど）の承認が別に必要。

## 2. 署名の手順（未承認・実行しない）

Google Play では Play App Signing を使い、開発者が持つのはアップロード鍵だけにする案。

### 2-1. 鍵の保管

- 保管場所は **この PC のローカルで、OneDrive・Git の作業フォルダ・同期フォルダの外**（例：同期対象外の専用フォルダ）。
  バックアップは、同期しない別の媒体に、暗号化して1つだけ（オフライン）。
- 鍵ファイル（`.jks` / `.keystore`）とパスワードは、Git・チャット・ログ・スクリーンショット・コマンドの引数に入れない。
  リポジトリの `.gitignore` に `*.jks`・`*.keystore`・`keystore.properties` を加えるのは、署名の作業を承認したときに行う。
- パスワードはパスワードマネージャーに保存し、入力は keytool / Gradle の対話プロンプトで行う（`-storepass` などの引数で渡さない）。
- 鍵を作ったら、証明書の SHA-256 フィンガープリントだけを記録する（Play Console の登録や確認に使う）。鍵そのものは共有しない。

### 2-2. 承認後の流れ（案）

1. アップロード鍵を作る（本人。keytool の対話プロンプトでパスワードを入力し、保存先は 2-1 の場所）
2. 1章の候補 AAB（またはローカルでビルドした staging の AAB）を、ローカルで署名する。署名は Gradle の `signingConfigs` を
   リポジトリに書かず、ローカルだけの設定（作業フォルダ外の properties か、対話プロンプト）で行う
3. 署名した AAB を `bundletool` で検証し、SHA-256 を記録する
4. Play Console にアプリを作り、内部テストトラックにアップロードする（配信の承認が別に必要）
5. 正式公開の AAB は、本番向けにビルドし直したものを使う（テスト用の AAB を昇格させない。`docs/mobile-ids-and-auth.md`）

### 2-3. 承認点（まとめ）

| 段階 | 承認 |
|---|---|
| 手動 workflow を動かせるようにする（1-1 の A・B） | main の変更、またはリポジトリ設定 |
| 候補 AAB を取得する | 実行の承認（公開キーの入力は本人か Work） |
| アップロード鍵を作る | 鍵の作成 |
| 署名する | 署名の作業 |
| Play Console へのアップロード・内部テスト | 配信 |
| 正式公開 | 本番向けのビルドと公開 |
