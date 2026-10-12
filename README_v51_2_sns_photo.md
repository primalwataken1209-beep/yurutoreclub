# ゆるトレ倶楽部 v51.2 — SNS写真投稿・運動記録→タイムライン完全連携

ベース：`yurutore_v51_1_legal_contact_clean`（これだけを基準に最小差分で修正）

「運動した → コメント・写真を記録した → パンジローに褒められた → その記録をワンタップでSNSへ共有できた」
という流れを完成させるための限定改修です。新しいSNSは作っていません。

> **本番 Supabase には何も適用していません。**
> この作業環境からは本番DBへ接続できないため、SQL は「ファイルとして用意しただけ」です。
> 下の「本番で人間が行う手順」に沿って適用してください。

---

## 1. 変更ファイル一覧

| 区分 | ファイル | 内容 |
|---|---|---|
| 変更 | `index.html` | 本番で動くインラインのアプリ本体。SNS写真投稿・ワンタップ投稿・表示・削除（詳細は §2） |
| 変更 | `app.js` | `index.html` のインラインと同期（先頭コメント1行のみ差分。従来どおり） |
| 変更 | `privacy/index.html` | 写真の扱いの文言を日英で最小修正（§8） |
| 変更 | `supabase/functions/delete-account/index.ts` | アカウント削除時に投稿写真フォルダも削除（STEP 2b を追加） |
| 追加 | `supabase/migrations/20260916_v51_2_sns_photo.sql` | **本番に適用するSQL**（列追加・バケット作成・Storage RLS） |
| 追加 | `supabase/manual/v51_2_verify_readonly.sql` | 適用前後の確認用（読み取りのみ） |
| 追加 | `supabase/manual/v51_2_rollback.sql` | ロールバック用（手動・必要時のみ） |
| 追加 | `supabase/manual/v51_2_optional_user_progress_photo_scrub.sql` | 【任意】`user_progress` に残った古い写真データの除去（§10-1） |
| 追加 | `README_v51_2_sns_photo.md` | このファイル |
| 削除 | なし | |

**変更していないもの（バイト単位で v51.1 と同一）**
`style.css` / `_headers` / 画像・`assets/` 一式 / `terms` / `community-guidelines` / `contact` /
`account-deletion` / `legal/legal.js`・`legal.css` / 既存 migration 2本 / `supabase_v28_events.sql` / 既存README。

`index.html` 内でも次は触っていません：Google認証・メール認証・Supabase URL/キー・ウェルカム画面・
オンボーディング・ホーム・パンジロー（画像・リアクション・生活行動）・パンダルーム・
既存SNSのフォロー/コメント/リアクション/通報/ブロック・日英切替の仕組み・localStorage のキーと構造・
公開/非公開設定・既存の posts RLS。
（認証関連の行 `signInWithPassword / signInWithOAuth / signUp / handleLogin / handleGoogleLogin / handleRegister` は差分ゼロを機械確認済み）

---

## 2. 変更内容（index.html）

### 2-1. 運動記録 → タイムライン：再入力なしのワンタップ投稿
- 褒め画面の「タイムラインに投稿する」は、**保存済みの記録（本文・運動種類・写真）をそのまま** `publishToSns(report)` に渡します。フォームは開きません。
  - 本文：`report.note` があればそれ、空なら既存の `snsAutoPostBody(activity)`（日英対応済みの自動本文）
  - 運動種類：`report.aid`
  - 写真：`report.photo` があれば、**このタップの時点で初めて** SNS用に作り直してアップロード
- 投稿中は「送信中…」、成功したら既存の「タイムラインに投稿したよ ✨」を表示し、**タイムラインを「読みこみ中」を出さずに読み直して**投稿を表示します。
  （v51.1 では投稿完了前にタイムラインを読み込むため新しい投稿が見えず、「記録して投稿」ボタンからもう一度入力してしまう原因になっていました）
- 写真つきの記録では、褒め画面のボタンの上に小さく「📷 写真も一緒に投稿されるよ」と表示します（公開前に分かるように）。
- タイムライン下部の「✨ 運動を記録して投稿する」（記録と同時に投稿）でも写真が引き継がれます。このシートでは写真の説明を「この写真は記録に残り、タイムラインにも投稿されるよ」に切り替えます。

### 2-2. SNS単独投稿に写真1枚
- 投稿カードの運動種類チップの下に「📷 写真をえらぶ」を追加（既存デザインに合わせた小さなボタン）。
- 選ぶと 64px の小さなプレビュー＋「×（写真を外す）」、ボタンは「選び直す」に変わります。
- 1投稿につき最大1枚。複数枚・動画は非対応。

### 2-3. 画像の検証と縮小（ブラウザ側）
| 項目 | 内容 |
|---|---|
| 選べる形式 | jpg / png / webp（`accept` と `file.type` の両方で制限。**SVG・GIF・PDF等は拒否**） |
| 中身の確認 | ファイル先頭のバイト（JPEG/PNG/WEBPの署名）を確認。拡張子だけ偽装したファイルは拒否 |
| 元ファイル上限 | 20MB、6000万画素 |
| 送る画像 | **長辺1600px以下の JPEG** に作り直す（品質0.85→必要なら0.75→0.65）。上限3MB |
| 撮影情報 | 作り直すため、位置情報などの EXIF は送られません |
| 透過PNG | 背景を白にして変換 |

### 2-4. 保存とエラー時の後始末
- 保存先：Supabase Storage の **private バケット `post-images`**、パス `{自分のuser_id}/{ランダムUUID}.jpg`
- DB：`posts.image_path` に **パスだけ**を保存（公開URLは保存しない）
- 順序：**写真アップロード → 投稿INSERT**
  - 写真が失敗 → 投稿は作らない。「写真を送れなかったみたい。投稿はまだされていないよ🐼」。本文と写真は残り、再送できる
  - 投稿INSERTが失敗 → 直前にアップロードした写真を削除（置き去りにしない）
- 写真なし投稿は従来どおり `image_path` を送りません（既存互換）。

### 2-5. タイムライン表示
- `image_path` が NULL の投稿は今まで通り。
- 写真つき投稿は本文の下に表示。**表示のたびに1時間有効の署名URL**をまとめて発行（30件でも1リクエスト）。
- 幅はカードに収め、高さ最大360px、縦横比維持、元画像より大きく引き伸ばさない。
- 読み込み失敗時は1回だけURLを取り直し、だめなら写真部分だけ非表示（カードは崩れない）。
- 署名URLは `https://eszheiabjwehcbrteqza.supabase.co/storage/v1/` で始まるものだけを表示。
- **migration 未適用の環境でも壊れません**：`image_path` 列が無いとエラーになる場合は自動で従来の列だけで読み直します。

### 2-6. 二重投稿防止
- 褒め画面：同じ記録は「送信中」「送信済み」をメモリで管理し、連打しても1回だけ（新しい保存キーは追加していません）。
- タイムライン投稿：送信中はボタン無効化＋即時ガード。既存の10秒クールダウンもそのまま有効。

### 2-7. 投稿削除
- 既存どおり **論理削除（`is_deleted = true`）** のまま。あわせて `image_path` を NULL にし、Storage の写真ファイルを削除します。
- 理由：アプリに投稿の復元機能は無く、写真だけがサーバーに残り続けるのを避けるため。削除済み投稿の写真は RLS でも他人から見えません。
- 写真ファイルの削除に失敗しても、投稿の削除自体は成立します（§9 の確認SQLで置き去りを確認可能）。

### 2-8. 仕様外だが必要だった小修正（2点・要確認）
1. **運動記録写真が `user_progress` へ送られていた問題の修正**
   v51.1 の `syncStateToSupabase()` は、アプリ状態を丸ごと `user_progress.data` に upsert しており、
   **運動記録・タイムカプセルの写真（dataURL）もサーバーへ送っていました**（`user_progress` テーブルがある環境のみ。v51.1 を実ブラウザで動かして再現確認済み）。
   これはプライバシーポリシー「写真は端末内のみ」と、今回の必須テストB「投稿しなければサーバー送信されない」に反するため、
   送信直前に写真の中身を `{w, h, localOnly:true}` の目印へ置き換えるようにしました。
   **端末内（localStorage）のデータは一切変更していません。** 既にサーバーに残っている分は §10-1 を参照。
   元に戻す場合は `ytStripLocalPhotos` の呼び出し2行を削除し `data:safe` を `data:s` に戻します。
2. **トーストの小修正**：「送信中…」→「投稿したよ」と続けて出すと、先のトーストのタイマーが後のトーストを早く消してしまうため、
   タイマーは「自分が出したトーストのときだけ消す」ようにしました（`showToast` 1行）。

---

## 3. DB migration（`supabase/migrations/20260916_v51_2_sns_photo.sql`）

```sql
alter table public.posts add column if not exists image_path text;          -- NULL可。既存行は NULL のまま
alter table public.posts add constraint posts_image_path_valid check (
  image_path is null or (
    image_path ~ '^{uuid}/{uuid}\.jpg$'                                       -- 実際は正規表現
    and split_part(image_path,'/',1) = user_id::text                          -- 自分のフォルダの画像だけ
  ));
create unique index if not exists posts_image_path_uniq
  on public.posts (image_path) where image_path is not null;                -- 1画像=1投稿
```
- 冪等（何度実行しても同じ）。既存投稿は変更・削除しません。
- **posts の既存 RLS ポリシーには一切触れません**（drop/create なし）。
- 形式チェックにより「他人の非公開画像のパスを、自分の公開投稿に付けて見られるようにする」攻撃をDB側で防ぎます。

## 4. Storage bucket

| 項目 | 値 |
|---|---|
| id / name | `post-images` |
| public | **false**（URLを知っていても取得不可） |
| file_size_limit | 3MB（3145728） |
| allowed_mime_types | `image/jpeg` のみ（SVG/HTML等はサーバー側でも拒否） |

## 5. Storage RLS（`storage.objects`、`post-images` 専用）

| 操作 | 許可条件 |
|---|---|
| INSERT | `authenticated` かつ フォルダ名 = `auth.uid()` かつ 名前が `{uuid}/{uuid}.jpg` |
| SELECT（署名URL発行も含む） | ① 自分のフォルダ ／ ② その画像を使った投稿があり、投稿者＝フォルダの持ち主、`is_deleted = false`、投稿者の `profiles.is_public = true`、**かつ posts 自体の SELECT RLS を通る** |
| DELETE | 自分のフォルダのみ |
| UPDATE | ポリシーなし＝誰も上書き・移動できない |
| anon | ポリシーなし＝何もできない |

- `service_role` key はフロントに一切ありません（従来どおり Publishable key のみ）。
- 非公開ユーザーの画像は、UIで隠すだけでなく **Storage 側で署名URLが発行されない**ため、パスを知っていても取得できません。
- `avatars` など他バケットのポリシーには触れていません。

---

## 6. 本番で人間が行う手順（この順番で）

> 目安 15〜20分。どの手順も途中でやめても既存機能は壊れません。

**① 事前確認（読み取りのみ）**
Supabase ダッシュボード → SQL Editor → `supabase/manual/v51_2_verify_readonly.sql` の **①②だけ**を実行。
- ① posts の SELECT ポリシーに「本人 **または**（`is_deleted = false` かつ 投稿者 `is_public = true`）」の条件が入っていることを確認
- ② `relrowsecurity` が `true`
- もし SELECT が `is_deleted = false or user_id = auth.uid()`（リポジトリ内の v43 のまま）だった場合：
  写真は今回の Storage RLS で守られますが、**非公開ユーザーの投稿本文が他人に見える状態**です。今回の変更とは別に対応が必要なので、適用前にご相談ください。

**② migration を実行**
SQL Editor に `supabase/migrations/20260916_v51_2_sns_photo.sql` の全文を貼り付けて Run。
（Supabase CLI 利用時は `supabase db push`）

**③ 適用後の確認**
`v51_2_verify_readonly.sql` の ③④⑤ を実行し、次を確認。
- `image_path` 列がある（text / YES）
- バケット：`public = false` / `3145728` / `{image/jpeg}`
- ポリシー：`post-images:` で始まるものが INSERT / SELECT / DELETE の **3件だけ**
- ダッシュボード → Storage に `post-images` が表示され、「Public」になっていないこと

**④ アカウント削除 Edge Function を再 deploy**
```
supabase functions deploy delete-account
```
（シークレット `SERVICE_ROLE_KEY` は設定済みのまま。再設定は不要です）
これを行わないと、アカウント削除時に投稿写真が Storage に残ります。

**⑤ アプリを公開**
`yurutore_v51_2_sns_photo_clean.zip` を展開し、フォルダを Netlify Drop へ。
公開後、ブラウザで開いて Ctrl+F5（強制再読み込み）。

**⑥ 本番で動作確認（2アカウント推奨：公開A・非公開B）**
1. A：写真つきで記録 → 褒め画面「タイムラインに投稿する」→ 写真つきで表示される
2. A：タイムラインで写真を選んで投稿 → 表示される
3. B（非公開）で写真投稿 → B本人には見える／Aのタイムラインには出ない
4. A：自分の写真投稿を削除 → Storage の `post-images/{AのID}/` から消える
5. Googleログイン・メールログイン・日英切替・パンダルームが今まで通り

**⑦（任意）** §10-1 の `user_progress` 写真データ除去。

---

## 7. ロールバック方法

| やりたいこと | 手順 |
|---|---|
| アプリだけ戻す | v51.1 の ZIP を Netlify Drop し直す。`image_path` 列・バケットが残っていても v51.1 は影響を受けません（v51.1 は `image_path` を読まない） |
| 写真の投稿・閲覧を止める | `supabase/manual/v51_2_rollback.sql` の「A」を実行（post-images のポリシー3件を削除） |
| 完全に撤去 | 「A」→ Dashboard で post-images の全ファイル削除 → バケット削除 → 「B」のコメントを外して列を削除 |
| Edge Function を戻す | v51.1 の `supabase/functions/delete-account/index.ts` で `supabase functions deploy delete-account` |

※ 列を削除すると写真つき投稿の写真参照は失われます（本文は残ります）。

---

## 8. 法務ページの変更箇所（`privacy/index.html` のみ・日英同じ意味）

| 場所 | 変更 |
|---|---|
| 2.「画像」リスト | 「SNS投稿に添付した写真（利用者がSNSへの投稿を選択した場合に限り、Supabase Storage に保存されます）」を1行追加（英語版も同様） |
| 8.「画像」本文 | 「運動記録を保存しただけではサーバーへ送信されません」＋「SNSへ投稿することを選択した場合／SNSの投稿に写真を添付した場合は、SNS機能提供のため Supabase Storage へ送信・保存され、投稿と同じ範囲の利用者に表示される」「縮小・再変換してから送る」「投稿やアカウントを削除すると写真も削除される」を追記 |
| 20. 最終改定日 | 2026年9月8日 → **2026年9月16日**（英語版 Last updated も同様。制定日は変更なし） |

利用規約・コミュニティガイドライン・お問い合わせ・アカウント削除ページ、運営者名・問い合わせ先は変更していません。

---

## 9. テスト結果

### 9-1. 実施方法
| 種類 | 内容 |
|---|---|
| 実ブラウザE2E | Chromium（iPhone 13 相当の画面）で v51.2 の `index.html` をそのまま動かし、Supabase の通信だけをモック（本番と同じRLS判定を再現）。公開ユーザーA・非公開ユーザーB・公開ユーザーCの3人で操作 → **81/81 合格** |
| DB/Storage RLS | PostgreSQL 16 に Supabase の `auth.uid()` / `storage.objects` / `storage.foldername()` を再現し、既存 migration 2本 → 本番相当の posts SELECT → v51.2 migration（2回実行で冪等性も確認）→ 3ユーザーで実際に SQL を実行 → **41/41 合格** |
| Edge Function | `delete-account` を TypeScript からそのまま実行し、Supabase クライアントを差し替えて検証（写真250枚の削除・バケット未作成時のスキップ・削除失敗時に Auth 削除へ進まない） |
| 構文・i18n | Babel（本番と同じ 7.24.7）で変換成功。日英キー 521 / 521 で完全一致（+12キーずつ） |
| 未実施 | 本番 Supabase・本物の Google OAuth・実機スマホでの確認（この環境から接続できないため。§6-⑥ で確認してください） |

### 9-2. 必須テスト A〜R

| # | 内容 | 結果 | 確認方法 |
|---|---|---|---|
| A | 写真なし運動記録 → 正常保存 | ✅ | E2E |
| B | 写真あり記録 → 保存／投稿しなければサーバー送信なし | ✅ | E2E：post-images アップロード0件・posts INSERT 0件・user_progress にも写真なし・端末内の写真は保持 |
| C | 写真あり記録 → タイムライン投稿（再入力なし・種類/写真引継ぎ・表示） | ✅ | E2E：フォーム非表示、本文=コメント、walk、`{UID}/{uuid}.jpg`、JPEG・長辺≤1600・EXIFなし、署名URLで表示、成功トースト。「記録して投稿」経路も確認 |
| D | コメントなし → 既存自動本文 | ✅ | 「ウォーキングをやったよ〜」 |
| E | SNS単独・写真なし | ✅ | E2E |
| F | SNS単独・写真1枚 | ✅ | プレビュー・外す・選び直し・投稿・表示 |
| G | 非公開ユーザー：本人は見える／他人は見えない | ✅ | E2E＋SQL：パスを知っていても署名URL発行不可、公開→非公開切替で即不可 |
| H | 公開ユーザーの投稿・画像が他人から見える | ✅ | E2E＋SQL |
| I | 他人の投稿を UPDATE/DELETE できない | ✅ | SQL：0件（本文・is_deleted・image_path とも） |
| J | 他人の Storage 画像を DELETE できない | ✅ | SQL：0件。本人でも UPDATE（上書き/移動）不可 |
| K | 画像以外を拒否 | ✅ | SVG・拡張子偽装テキスト・PDF を拒否、アップロード0件。SQL：`.svg` 名・サブフォルダ・他人フォルダも拒否 |
| L | 巨大画像 | ✅ | 6000×4000 → 1600×1067 に縮小して送信、20MB超は拒否 |
| M | 連打で重複投稿しない | ✅ | 褒め画面2連打・タイムライン3連打とも INSERT 1回・アップロード1回 |
| N | Googleログイン | ✅※ | ボタン → `authorize?provider=google` へ遷移（既存処理のまま）。※本物のGoogle画面は未確認 |
| O | メールログイン | ✅※ | password grant → ホームへ（モック認証）。※本番アカウントでは未確認 |
| P | 日本語/English切替 | ✅ | 新規文言・エラー・alt が英語、日本語へ戻すと日本語 |
| Q | 既存コメント・フォロー・リアクション | ✅ | E2E |
| R | パンジロー・パンダルーム | ✅ | 褒め画面のパンジロー表示、ホームのパンダルーム・画像表示、家具解放ポップアップも従来どおり |
| 追加 | アップロード失敗で投稿を作らない／DB失敗で画像を削除／再送で成功 | ✅ | E2E |
| 追加 | 削除 → 論理削除維持＋image_path=NULL＋Storage削除 | ✅ | E2E＋SQL |
| 追加 | migration 未適用でもタイムライン・文字投稿が動く | ✅ | E2E |
| 追加 | 全画面で JS エラーなし | ✅ | E2E |

---

## 10. 既知の制限・残っているリスク

1. **`user_progress` に残っている古い写真データ**：v51.1 までに送られた分は、その利用者が v51.2 でアプリを開いて保存が走るまで残ります。
   `supabase/manual/v51_2_optional_user_progress_photo_scrub.sql` で件数確認 → 必要なら一括除去できます（ローカルDBで動作確認済み・任意）。
2. **署名URLは1時間の「持参人URL」**：一度発行されたURLは、期限内ならURLを知る人が開けます。非公開に切り替えた直後も、既に表示中のURLは最長1時間有効です（削除した投稿は写真ファイル自体を消すので開けません）。
3. **ブロック**は従来どおり画面側での非表示です（posts と同じ扱い）。ブロックした相手の写真もDB上は公開範囲の規則に従います。
4. **Storage の中身の検査**：サーバーは申告された Content-Type（image/jpeg）と容量で判定します。アプリは必ずJPEGに作り直して送りますが、改造クライアントが自分のフォルダへ3MB以下の非JPEGを置くことは理論上可能です（表示は `<img>` のみ・他人に見えるのは公開投稿に紐付いた場合だけ）。アップロード回数のサーバー側制限もありません。
5. **置き去り画像**：アップロード直後にアプリを閉じた場合や、削除API が失敗した場合は Storage に残ることがあります。`v51_2_verify_readonly.sql` ⑥ で一覧できます。
6. **運動記録の写真は端末内で長辺900px**（既存仕様）のため、記録から投稿した写真は最大900pxです。タイムラインで直接選んだ写真は最大1600px。
7. **HEIC**：iPhone の Safari は選択時に JPEG へ自動変換するため問題ありませんが、HEIC のまま渡すブラウザでは「jpg / png / webp の写真を選んでね」と表示されます。
8. **アカウント削除ページ**（`/account-deletion/`）は今回変更していません。「投稿」に写真が含まれる旨を明記したい場合は次回の法務更新で追記をおすすめします。
9. **Edge Function の CORS** は v50 から `'*'` のままです（今回は変更していません）。将来 Netlify のドメインに限定することをおすすめします。
10. 本番の posts SELECT ポリシーはリポジトリ内の SQL と異なります（本番で手動設定済み）。§6-① の確認を必ず行ってください。
