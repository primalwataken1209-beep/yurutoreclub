# ゆるトレ倶楽部 v50 / v50.1 / v50.2 — Legal / Safety / Store Ready

基準バージョン：**v49.1**（`yurutore_v49_1_i18n_final_clean`）
現在のバージョン：**v50.2**（`yurutore_v50_2_i18n_final_polish_clean`）

このv50は**新機能追加版ではありません**。Google Play および将来の Apple App Store 申請に必要な
Legal / Privacy / Safety の土台だけを追加しています。

対象地域：日本 / United States

---

## v50.2 i18n Final Polish（変更履歴）

v50.1 を基準に、英語モードに残っていた表示と、自動投稿のクールダウン漏れだけを最小差分で直したバージョンです。
**修正対象は4点のみ**で、それ以外は一切変更していません。

### ① YURU_REACTIONS 5種を日英対応

`label_en` / `line_en` を追加しました。既存の `label` / `line` は1文字も変更していません。
表示は既存の `tl()` で切り替えます（日本語モードの表示は v50.1 と完全に同一）。

| キー | 日本語ラベル | English | 英語セリフ |
|------|------------|---------|-----------|
| panda | えらすぎ！ | So proud! | So proud of you! Panda saw that little step 🐼 |
| ramen | 飯テロ | Food flex | Official food flex! Enjoy it, then a little move tomorrow = a win 🍜 |
| zero | 実質ゼロ | Basically zero | You moved, so it basically cancels out! That's a Yurutore win 🔥 |
| night | 深夜部 | Night crew | Welcome to the Night Crew! Keep it easy and don't overdo it 🌙 |
| yuru | ゆるくいこ〜 | Take it easy~ | Taking it easy today was the right call. Rest counts too 😴 |

「Food terrorism」のような直訳は使っていません。

### ② 「記録して投稿」の自動生成本文を日英対応

`snsAutoPostBody(act)` を新設し、投稿した時点の言語で本文を作ります。

| 種別 | 日本語（v50.1と同一） | English |
|------|--------------------|---------|
| ウォーキング | ウォーキングをやったよ〜 | Did some walking today~ |
| ランニング | ランニングをやったよ〜 | Did some running today~ |
| ストレッチ | ストレッチをやったよ〜 | Did some stretching today~ |
| ジム | ジムをやったよ〜 | Did some gym training today~ |
| 自宅トレ | 自宅トレをやったよ〜 | Did some home workout today~ |
| その他 | その他をやったよ〜 | Got a little movement in today~ |

英語の名詞は ACTS へ追加した `post_en` を使います（`label` / `label_en` は無変更）。
`other` だけは英文そのものが変わるため、専用キー `sns.autoPostOther` を使います。

**保存済みの過去投稿には一切手を入れていません。**
既存投稿の一括翻訳も UPDATE 処理も追加していません。
SNS閲覧時に他ユーザーの投稿を自動翻訳する機能も追加していません。

### ③ 自動生成本文の fallback を日英対応

運動種別を取得できないときの本文です。**fallback の発生条件は v50.1 から変更していません。**
変わったのは文言が日英になったことだけです。

| | 文言 |
|---|---|
| 日本語 | ちょっとだけ動いた〜 |
| English | Moved a little today~ |

### ④ 「運動記録 → 自動投稿」にも10秒クールダウンを適用

v50.1 で通常のSNS投稿フォームにだけ効いていた10秒クールダウンを、
`publishToSns`（記録して投稿）にも適用しました。

- **新しいクールダウンの仕組みは作っていません。** v50.1 の
  `snsCooldownLeft('post')` / `snsMarkSent('post')` / `t('safety.tooFastPost')` をそのまま再利用しています。
- 同じ `'post'` を共有するため、**投稿経路に関係なく同一ユーザーの投稿は共通の10秒**になります。
  通常投稿 → 自動投稿、自動投稿 → 通常投稿、どちらの順でも効きます。
- 判定は **DB INSERT の前**に行うので、10秒以内は送信されず二重投稿になりません。
- **成功した投稿のときだけ**時刻を更新します。通信エラーやクールダウンで止まった投稿では待たされません。
- コメントの5秒クールダウンは v50.1 のまま。投稿用とは統合していません。

あわせて、クールダウンで自動投稿を止めたときに、その案内が
「タイムラインに投稿したよ ✨」で上書きされて見えなくなる問題を直しました（指示 §17「エラー表示」）。
`publishToSns` が成否を返すようにし、**投稿できたときだけ**成功トーストを出します。
これは v50.1 では通信エラーの案内も同じように隠れていた箇所で、あわせて解消しています。

### v50.2 で変更したファイル

| ファイル | 変更量 |
|---------|-------|
| `index.html` | 追加71行・置換19行 |
| `app.js` | 同上（`index.html` のインラインと同期） |
| `README_v50_legal_safety.md` | この節を追加 |
| `README_CURRENT.md` | 冒頭を v50.2 CLEAN へ |

**新規ファイル：0 / 削除ファイル：0**

置換した19行の内訳：ACTS 5行（`post_en` 追加）、YURU_REACTIONS 5行（`label_en` / `line_en` 追加）、
`publishToSns` 6行、成功トーストの出し分け2行、リアクション表示3行。

### Legal / Auth / Panda Room / DB schema は非変更

**v50 / v50.1 の Legal・Account Deletion・Safety 設計は一切変更していません。**
次のファイルは v50.1 からバイト単位で同一です。

```
privacy/index.html   terms/index.html   community-guidelines/index.html
account-deletion/index.html   contact/index.html
legal/legal.css   legal/legal.js
supabase/migrations/20260101000000_v43_real_sns.sql
supabase/migrations/20260908_v50_safety_legal.sql
supabase/functions/delete-account/index.ts
style.css   _headers   supabase_v28_events.sql
assets/ images/ ルート直下の画像すべて
```

SQL migration の追加・テーブル変更・Supabase schema 変更はありません。
通報 / ブロック / reports / blocks / RLS / 危険表現フィルタも変更していません。
新しい外部依存・保存キーも追加していません。

### v50.2 で実施した検証

| 対象 | 方法 | 結果 |
|------|------|------|
| v50 回帰（体験版の全導線＋リーガルページ） | 実Chromium | 52 / 52 合格 |
| v50 通報・ブロック・アカウント削除 | 実Chromium（Supabaseスタブ） | 45 / 45 合格 |
| v50.1 安全対策・未翻訳3箇所 | 実Chromium | 45 / 45 合格 |
| v50.2 の4点（日英・クールダウン・回帰） | 実Chromium | 42 / 42 合格 |
| 自動投稿本文・リアクション文言 | 単体テスト | 日英 全パターン一致 |
| 危険表現フィルタ（v50.1・無変更の確認） | 単体テスト | 危険32/32・通常41/41 |
| i18nキー一致 | AST走査 | ja/en 509キー完全一致・既存キー変更0 |
| Panda Room / Auth / Legal の非変更 | バイト比較 | 24領域すべて同一 |

主な確認内容：

- §25 英語モードで So proud! / Food flex / Basically zero / Night crew / Take it easy~ が表示され、
  タップすると英語セリフが出る（日本語の取り残しなし・「Food terrorism」等の直訳なし）
- §26 日本語モードのラベルとタップセリフが v50.1 と完全に同一
- §27 日本語で「記録して投稿」→ 本文が `ウォーキングをやったよ〜` / `ジムをやったよ〜`
- §28 英語で同操作 → 本文が `Did some walking today~` / `Did some gym training today~`（日本語を含まない）
- §29 fallback が日英とも正しい（`ちょっとだけ動いた〜` / `Moved a little today~`）
- §30 通常投稿の直後（約4秒後）の自動投稿はDBへ送られず、既存文言が表示される。10秒経過後は投稿できる
- §31 自動投稿の直後（約4秒後）の通常投稿も同様。10秒経過後は投稿できる
- §9 保存済みの既存投稿を書き換えていない
- §32 日本語・英語の双方で Welcome → Home → 運動記録 → SNS → 投稿 → リアクション → コメント → Panda Room が正常
- §33 Privacy / Terms / Community Guidelines / Contact / Account deletion がすべて開く
- §34 §35 Auth と Panda Room（15ポーズ・PJ47設定・行動時間・タップ演出・家具・夜景）に差分なし

---

## v50.1 Store Review Polish（変更履歴）

v50 を基準に、審査前に残っていた小さな品質問題だけを最小差分で潰したバージョンです。

### 変更内容

- **既存未翻訳3箇所の修正**（英語モードで日本語が残っていた箇所）
  1. タイムライン下部のボタン `✨ 運動を記録して投稿する` を `t('sns.recordAndPost')` へ移行
     （英語：`✨ Log a workout and share it`）
  2. 投稿カードの運動種別タグ `{act.label}` → `{tl(act)}`
  3. 投稿フォームの運動種別チップ `{a.label}` → `{tl(a)}`
- **SNS投稿の10秒連投防止**（投稿成功から10秒間は次の投稿を送信しない）
- **コメントの5秒連投防止**（コメント成功から5秒間は次のコメントを送信しない）
- **空白のみの投稿／コメント防止の確認**（既存の `trim()` 処理をそのまま活用。重複実装はしていません）
- **最低限の危険表現チェック**（明白な殺害予告・自傷を直接促す表現・重大な暴力を促す表現のみ）
- **i18nキー整合性の確認**（ja / en とも 506 キーで完全一致）

### v50 の設計は変更していません

**v50 の Legal / Account Deletion / Safety 設計は一切変更していません。**
具体的には、次のファイルは v50 からバイト単位で同一です。

```
privacy/index.html            terms/index.html
community-guidelines/index.html   account-deletion/index.html
contact/index.html            legal/legal.css   legal/legal.js
supabase/migrations/20260101000000_v43_real_sns.sql
supabase/migrations/20260908_v50_safety_legal.sql
supabase/functions/delete-account/index.ts
style.css   _headers   supabase_v28_events.sql
assets/ images/ ルート直下の画像すべて
```

Privacy Policy / Terms / Community Guidelines / Contact / Account Deletion / Edge Function /
reports / blocks / RLS / 13歳以上確認 / SNS通報 / SNSブロック / Auth削除処理 / Supabase構成は
すべて v50 のままです。

### v50.1 で変更したファイル

| ファイル | 変更量 | 内容 |
|---------|-------|------|
| `index.html` | 追加105行・置換3行 | i18nキー4件追加、投稿前安全対策の追加、未翻訳3箇所の修正 |
| `app.js` | 同上 | `index.html` のインラインと同期 |
| `README_v50_legal_safety.md` | この節を追加 | v50.1変更履歴 |
| `README_CURRENT.md` | 冒頭を更新 | v50.1 CLEAN へ |

置換した3行は、上記の未翻訳3箇所そのものです。それ以外の既存行は1行も書き換えていません。

### 追加したi18nキー（ja / en 各4件）

| キー | 日本語 | English |
|------|--------|---------|
| `sns.recordAndPost` | ✨ 運動を記録して投稿する | ✨ Log a workout and share it |
| `safety.tooFastPost` | 少し待ってからもう一度投稿してください。 | Please wait a moment before posting again. |
| `safety.tooFastComment` | 少し待ってからもう一度コメントしてください。 | Please wait a moment before commenting again. |
| `safety.blocked` | この内容は投稿できません。表現を変えてもう一度お試しください。 | This content can't be posted. Please revise it and try again. |

既存キーは1つも変更・削除していません（v50: ja/en 各502キー → v50.1: ja/en 各506キー）。

### 投稿前安全対策の設計

**新しいSupabaseテーブル・migrationは追加していません。** すべてフロント側で完結します。
**新しい外部依存（npm / CDNライブラリ / 外部API / Moderationサービス / Analytics / CAPTCHA）も追加していません。**

- **連投防止**：メモリ上の変数だけで管理します。localStorage / sessionStorage に新しいキーを増やしていません。
  そのためページを再読み込みすれば必ず投稿できる状態に戻り、「異常な投稿不能状態」に陥りません。
  送信が**成功したときだけ**時刻を記録するので、ブロックされた投稿でクールダウンは発生しません。
- **空白対策**：既存の `String(body).trim()` をそのまま活かしています。JavaScript の `trim()` は
  半角スペース・全角スペース・改行・タブをすべて除去するため、指示書の5ケースはこれで満たされます。
  重複した判定は追加していません。
- **危険表現チェック**：AIモデレーション・外部Moderation API・巨大NGワード辞書は使いません。
  1単語一致では判定せず、危険性が明確な**フレーズ単位**（日本語13 / 英語10 の計23パターン）に限定しています。
  対象は「明白な殺害・傷害の予告」「自傷を直接促す表現」「他人への重大な暴力を具体的に促す表現」の3カテゴリだけです。
  政治／宗教／ネガティブ感情／悪口全般／医療／ダイエット／ラーメン／飲酒／軽い冗談は一切対象にしていません。
  「死ぬほど疲れた」「筋トレで殺された（笑）」「殺しにくるメニュー」「This workout is killing me」などは
  すべて通過することをテストで確認済みです。
- 判定は `snsCreatePost` / `snsAddComment` の中で行うため、通常の投稿・「記録して投稿」の
  どちらの経路でも DB へ送信されません。
- これは v50 の通報・ブロックを**置き換えるものではなく、補助として足しただけ**です。

### v50.1 で実施した検証

| 対象 | 方法 | 結果 |
|------|------|------|
| v50 の回帰テスト（体験版の全導線＋リーガルページ） | 実Chromium | 52 / 52 合格 |
| v50 の通報・ブロック・アカウント削除 | 実Chromium（Supabaseスタブ） | 45 / 45 合格 |
| v50.1 の新規項目（未翻訳3箇所・連投防止・空白・危険表現・v50回帰） | 実Chromium | 45 / 45 合格 |
| 危険表現フィルタの精度 | 単体テスト | 危険32/32ブロック・通常会話41/41通過 |
| SQLマイグレーション | 実PostgreSQL 16 | 全項目合格（v50から無変更） |
| delete-account Edge Function | Deno（型検査＋モック） | 30 / 30 合格（v50から無変更） |
| i18nキー一致 | AST走査 | ja/en 506キー完全一致・既存キー変更0 |
| パンジロー／Auth／Legal の非変更確認 | バイト比較 | 20領域すべて同一 |

主な確認内容：

- §20 Test A：投稿直後の再投稿は DB へ送られず「少し待ってから～」が出る
- §20 Test B：10秒経過後は正常に投稿できる
- §20 Test C：ページ再読み込み直後でも投稿できる（投稿不能状態にならない）
- §21 Test A / B：コメントも同様（5秒）
- §22：明白な危険フレーズはブロック、「疲れた」「しんどい」「ラーメン」「ダイエット」「筋トレ」は通過
- §23：Privacy / Terms / Community Guidelines / Contact / Account deletion / アプリ内削除 /
  通報 / ブロックがすべて正常に動作
- §24：パンジロー15ポーズ・行動時間・PJ47設定・タップリアクション・Panda Room・家具・夜景に差分なし
- §25：Supabase Auth・Google OAuth・Email Auth・session restore・logout・Edge Function に差分なし
- §26：service_role / secret / admin key / private token の混入なし
  （フロントに存在する鍵は既存の Publishable Key のみ）

---

## ⚠️ 公開前に必ずやること（この4つが終わるまで本番公開完成ではありません）

| # | 項目 | 場所 |
|---|------|------|
| 1 | `[OPERATOR_NAME]` を正式なサービス運営者名へ置換 | `legal/legal.js` の `YT_LEGAL_CONFIG.OPERATOR_NAME`（**1か所だけ**） |
| 2 | `[SUPPORT_EMAIL]` を実際に受信できる問い合わせ先へ置換 | `legal/legal.js` の `YT_LEGAL_CONFIG.SUPPORT_EMAIL`（**1か所だけ**） |
| 3 | Edge Function の deploy と secret 設定 | 下記「Edge Function の deploy」 |
| 4 | SQL マイグレーションの実行 | 下記「SQL マイグレーション」 |

5つのリーガルページ（privacy / terms / community-guidelines / account-deletion / contact）は
すべて `legal/legal.js` から値を差し込んでいます。**HTMLを1枚ずつ書き換える必要はありません。**

置換前の状態では、問い合わせ先が `[SUPPORT_EMAIL]` と表示され、`mailto:` リンクは張られません
（誤送信を防ぐため意図的にそうしています）。

---

## 1. 実装したもの

### 公開ページ（静的HTML・ログイン不要・日英切替あり）

| URL | ファイル | 内容 |
|-----|---------|------|
| `/privacy/` | `privacy/index.html` | プライバシーポリシー（全20項目） |
| `/terms/` | `terms/index.html` | 利用規約（全17条・健康免責を含む） |
| `/community-guidelines/` | `community-guidelines/index.html` | コミュニティガイドライン |
| `/account-deletion/` | `account-deletion/index.html` | アカウント削除の案内（Google Play 提出用URL） |
| `/contact/` | `contact/index.html` | お問い合わせ |
| （共通） | `legal/legal.css` | リーガルページ共通スタイル |
| （共通） | `legal/legal.js` | 運営者名・問い合わせ先の設定 ＋ 日英切替 |

- アプリ本体（`index.html` / `app.js` / React / Babel / Supabase）は読み込みません。軽量・静的です。
- 言語はアプリ本体と同じ `yurutore_language` を共有します。アプリで English にしていれば、リーガルページも English で開きます。
- `?lang=ja` / `?lang=en` を付けると強制的に切り替えられます（審査で英語版を見せたいときに便利）。
- JavaScript が無効な環境でも、日本語版は読める作りになっています。

### アプリ内に追加したもの

- **登録画面**（新規登録タブのときだけ）
  - 「私は13歳以上です」/ "I am 13 years of age or older." のチェック
  - 「登録することで、利用規約およびプライバシーポリシーに同意します。」（リンクは別タブで開く）
  - チェックが無いと登録できません。Google ログインで始める場合も同じです。
  - ログイン画面には表示しません。
- **プロフィール画面の下部**
  - ブロックしたユーザーの一覧 / 解除
  - 利用規約 / プライバシーポリシー / コミュニティガイドライン / お問い合わせ のリンク
  - 「アカウントを削除」（ログアウトより目立たない、控えめな見た目）
- **SNS の安全機能**
  - 投稿の「…」メニュー →「この投稿を通報」「このユーザーをブロック」
  - コメントごとの「このコメントを通報」
  - 通報理由6種：嫌がらせ・誹謗中傷 / 不適切な内容 / スパム / 個人情報 / 危険な内容 / その他
  - ブロックすると、その人の投稿・コメントが自分の画面から消え、フォロー関係も解除されます
- **アカウント削除（2段階確認）**
  1. 「アカウントを削除しますか？」→「削除へ進む」
  2. 「本当に削除しますか？」→「削除する」
  - ワンタップでは削除されません。
  - 失敗したときに「削除しました」とは表示しません。

### サーバー側

- `supabase/migrations/20260908_v50_safety_legal.sql` … reports / blocks / RLS / 外部キー整備
- `supabase/functions/delete-account/index.ts` … アカウント完全削除の Edge Function

---

## 2. SQL マイグレーション

Supabase ダッシュボード → SQL Editor に `supabase/migrations/20260908_v50_safety_legal.sql`
を貼り付けて **1回実行**してください。（CLI の場合は `supabase db push`）

- 何度実行しても同じ結果になります（冪等）。
- 既存の `20260101000000_v43_real_sns.sql` は**1文字も変更していません**。
- 既存ユーザー・プロフィール・投稿・コメント・リアクション・フォローは保持されます。

### 作られるもの

**`reports`（通報）**

| 列 | 内容 |
|----|------|
| `id` | uuid |
| `reporter_user_id` | 通報した本人（`auth.users` を ON DELETE CASCADE 参照） |
| `target_type` | `post` / `comment` |
| `target_id` | 対象のID |
| `reason` | `harassment` / `inappropriate` / `spam` / `personal_info` / `dangerous` / `other` |
| `note` | 補足（任意・500文字まで） |
| `status` | `open` / `reviewed` / `actioned` / `dismissed` |
| `created_at` | 通報日時 |

RLS：**INSERT のみ**、しかも `reporter_user_id = auth.uid()` のときだけ。
**SELECT ポリシーは作っていません**。`authenticated` に SELECT 権限も渡していません。
そのためクライアントからは自分の通報も含めて1件も読めません。
管理者は Supabase ダッシュボード（service role）から確認・更新してください。

同じ人が同じ対象を何度も通報しても1件だけになります（unique index）。

**`blocks`（ブロック）**

`blocker_id` / `blocked_id` / `created_at`。主キーで重複を防ぎ、CHECK 制約で自分自身のブロックを禁止しています。
RLS は本人のみ SELECT / INSERT / DELETE 可。**「誰が自分をブロックしているか」は誰にも見えません。**

**`app_events` の整合性改善**

v28 の `app_events.user_id` には `auth.users` への外部キーがありませんでした。
v50 では、既存データがある環境でも安全に通るよう、次の手順で `ON DELETE CASCADE` を追加します。

1. `app_events` が無い環境ではスキップ
2. `auth.users` に存在しない `user_id` の行（削除済みユーザーの残骸）を先に削除
3. 外部キーを追加
4. 何らかの理由で失敗しても `raise notice` にとどめ、マイグレーション全体は成功させる

`user_progress` も、存在する環境でだけ同じ処理を行います。
どちらも失敗した場合でも、Edge Function 側が本人分を明示削除するのでアカウント削除は完結します。

---

## 3. Edge Function の deploy

```bash
supabase functions deploy delete-account
supabase secrets set SERVICE_ROLE_KEY=<Supabaseダッシュボードで取得したservice_role key>
```

`SUPABASE_URL` は Supabase が自動で渡します。

### ⚠️ Service Role Key の取り扱い

**Service Role Key を、次の場所へ絶対に書かないでください。**

- `app.js`
- `index.html`
- `legal/legal.js`
- GitHub に公開するコード
- Netlify のフロントエンド（環境変数を含む）

Service Role Key は **Supabase Edge Function のサーバー側 secret としてのみ**扱います。
フロントに存在してよいのは、既存の Publishable / Anon Key（`sb_publishable_...`）だけです。
v50 でもこの状態は変わっていません。

### 削除処理の流れ

| STEP | 内容 |
|------|------|
| 1 | `Authorization` の JWT から本人の user ID を取得（クライアントから user_id は受け取らない） |
| 2 | Storage `avatars/{userId}/` 配下を list してから全ファイル削除 |
| 3 | `user_progress` を削除（テーブルが無い環境では安全にスキップ） |
| 4 | `app_events` を削除（Auth 削除より必ず前） |
| 5 | `blocks`（両方向）と `reports`（本人分）を削除 |
| 6 | `profiles` を削除 → posts / comments / post_reactions / follows が cascade で消える |
| 7 | Admin API で `auth.users` を **hard delete**（soft delete では終わらせない） |
| 8 | 成功レスポンスを返す |

途中でエラーが起きた場合は HTTP 500 とエラー内容を返し、**成功したふりはしません**。
特に、途中で失敗したときは `auth.users` を削除しないので、中途半端に消えた状態にはなりません。

「テーブルが存在しない（`42P01` / `PGRST205`）」だけは削除失敗ではなく
「消すものが無い」として扱い、`skipped` に記録して続行します。

### 削除成功後（アプリ側）

- Supabase から `signOut`
- **そのユーザーに属する保存キーだけ**を削除
  - `yurutore-v6-ios-{userId}` / `yurutore-v6-android-{userId}`
  - `yurutore_room_seen_unlocks_v1_{userId}`
  - `yurutore_panda_stats_v1_{userId}`
  - `yurutore_daily_visit_v1_{userId}`
  - `yurutore_room_talklog_v1`（パンジローとの会話ログ）
  - sessionStorage の `yurutore_welcome_seen_v13`
- **`localStorage.clear()` は使いません。** 言語設定 `yurutore_language` は残ります。
- Welcome 画面へ戻ります。

---

## 4. ストア申請時に登録するURL

`https://<公開ドメイン>/` を頭に付けて登録してください。

| 提出先 | 項目 | URL |
|--------|------|-----|
| Google Play Console | Privacy policy | `/privacy/` |
| Google Play Console | Account deletion URL（データセーフティ） | `/account-deletion/` |
| Apple App Store Connect | Privacy Policy URL | `/privacy/` |
| Apple App Store Connect | EULA / 利用規約（任意） | `/terms/` |

Apple の審査で求められるユーザー生成コンテンツ要件（通報・ブロック・削除）は、v50 で
「投稿とコメントの通報」「ユーザーのブロック」「アプリ内アカウント削除」を実装済みです。

---

## 5. i18n

- 既存の `I18N` / `t()` / `tl()` / `ytSetLang()` / `useLang()` をそのまま使っています。
- 新しい名前空間 **`legal`** を追加しました（ja / en 各55キー）。
- **既存キーは1つも変更・削除していません。**
- v49.1 は ja / en 各 447 キーで一致していました。v50 では **ja / en 各 502 キーで完全一致**します。
- 新規キーの追加以外、既存の値に一切の差分がないことを機械的に検証済みです。

---

## 6. 追加していないもの（意図的に見送ったもの）

指示どおり、次のものは今回追加していません。

- 広告SDK / 広告目的のトラッキング
- Google Analytics / Firebase Analytics / Meta Pixel
- 広告Cookie・トラッキングCookie
- GPS・端末位置情報（`Geolocation API` は一切使っていません。都道府県は従来どおり手動選択のみ）
- 課金機能（サブスクリプション / Google Play Billing / Apple IAP / Stripe）
- 特定商取引法ページ（有料プラン実装時に再検討）
- Push 通知
- 大規模なAIモデレーション（サーバー側モデレーションを後から足せる構造にとどめています）

不適切投稿への基本対策は、既存の「空投稿防止」「文字数制限（投稿300字 / コメント200字）」に加え、
v50 の「通報」「ブロック」を中心にしています。

---

## 7. 変更していないもの（回帰確認済み）

次のファイル・機能は v49.1 から**一切変更していません**。

- `style.css`（バイト単位で同一）
- 画像・アセット（`assets/` `images/` およびルート直下の画像すべて）
- `supabase/migrations/20260101000000_v43_real_sns.sql`
- `supabase_v28_events.sql`
- `_headers`
- パンジロー関連のコード全般
  - `PJ47_POSES`（15ポーズ）/ `PJ47_TIERS` / `PJ47_HOLD` / `PJ47_FIRST_GAP` / `PJ47_WEIGHTS` / `PJ47_EX_BOOST`
  - `usePanjiro47Life`（生活エンジン本体）
  - `PANDA42_ACTIONS` / `PANDA42_WEIGHTS`
- パンダルーム / 家具 / 家具解放条件 / 夜景・昼夜切替（`ROOM41_SLOTS` / `ROOM30_WINDOW_SRC` ほか）
- 今日のひとこと365 / ゆるミッション365
- 既存認証処理（`handleLogin` / `handleRegister` / `handleResendConfirmation` / `handlePasswordReset` / `handleGoogleLogin` / `handleLogout`）
- Google OAuth / メール認証 / `authRedirectTo` / `cleanAuthUrl`
- Supabase URL / Publishable Key
- `storageKey` / `loadSt` / `saveSt`（既存の localStorage / sessionStorage キー）
- デバイスプレビュー制御（`isLocalDevHost` / `devPreviewOn`）

`index.html` の差分は **追加688行・置換9行のみ**です。置換した9行は次のとおりで、すべて今回の追加に必要な最小限の変更です。

1. `snsFetchTimeline`：フォロー中の一覧からブロック中のユーザーを除外
2. `snsFetchTimeline`：取得した投稿からブロック中のユーザーを除外
3. `snsFetchComments`：コメントからブロック中のユーザーを除外
4. `ProfileScreen` に `onDeleteAccount` を渡す1行
5. `ProfileScreen` の関数シグネチャに `onDeleteAccount` を追加
6. `SnsUserScreen`：ブロック中は投稿一覧の代わりに案内を出す分岐
7-8. Googleログインボタン（2か所）：新規登録タブのときだけ13歳確認を挟む
9. ログアウトボタンの下余白（`marginBottom:18` → `4`）。下に追加した項目と間隔を揃えるため

---

## 8. 実施した検証

### リーガルページ（実ブラウザ / Chromium）

- 5ページすべてが日本語で表示される
- 5ページすべてが English に切り替わり、切替後は日本語ブロックが非表示になる
- **英語版に日本語の取り残しがない**（本文を機械的に走査して確認）
- `[OPERATOR_NAME]` / `[SUPPORT_EMAIL]` が `legal.js` から正しく差し込まれる

### 回帰テスト（実ブラウザ / 体験版導線）

Welcome → 3枚オンボーディング → 登録画面 → プロフィール設定 → ホーム → 運動記録 →
褒め画面 → パンダルーム → コミュニティ → プロフィール を通しで実行し、全52項目合格。

- パンジローが `assets/panda-room/v47/` の画像で表示されることを確認
- 日本語モード / 英語モードの両方で確認
- JavaScript エラーはゼロ

### SNS安全機能・アカウント削除（実ブラウザ / Supabaseをスタブ化）

全45項目合格。主なもの：

- 他人の投稿にだけ「…」メニューが出る（自分の投稿には出ない）
- 理由を選ばないと通報できない
- 通報が `reports` へ **本人名義で** INSERT される（`target_type` / `reason` も正しい）
- コメントの通報も同様に保存される
- ブロックは確認シートを挟む。確認画面の時点ではまだブロックされていない
- ブロックすると相手の投稿が消え、自分の投稿は残る。再読み込み後も効いている
- ブロック時にフォロー解除が実行される
- プロフィールからブロックを解除できる
- **アカウント削除は2段階**。1段階目では削除APIを呼ばない
- **削除失敗時に「削除しました」と表示しない**。エラー文言と問い合わせ案内を出し、ログイン状態のまま
- 削除成功で Welcome 画面へ戻る
- クライアントから `user_id` を渡していない
- **`yurutore_language` が残り、他ユーザーの保存キーが消えていない**（`localStorage.clear()` を使っていない証拠）
- 英語モードで新規UIに日本語の取り残しがない

### SQL（実際の PostgreSQL 16 へ適用）

Supabase 相当のスキーマを用意し、v28 → v43 →（既存データ投入）→ v50 の順で適用して検証。

- v50 を **2回連続で実行**しても正常終了する（冪等）
- 既存ユーザー / プロフィール / 投稿 / コメント / リアクション / フォロー / user_progress がすべて保持される
- `app_events` の迷子の行（削除済みユーザー分）だけが除去され、既存の行は残り、外部キーが付く
- `user_progress` が無い環境でも正常終了する（勝手にテーブルを作りもしない）
- `app_events` も `user_progress` も無い環境でも正常終了する
- reports / blocks を含む全テーブルで RLS が有効
- **reports に SELECT ポリシーが存在せず、`authenticated` に SELECT 権限も無い**
- `anon` には reports / blocks の権限を一切渡していない
- 自分自身のブロック不可 / 重複ブロック不可 / 重複通報不可
- 別ユーザーが `reports` を1件も取得できない（実際に role を切り替えて確認）
- 他人になりすました通報が RLS で弾かれる
- **指示書 §41 の Test D〜L に相当する削除連鎖をすべて確認**
  （profiles / posts / comments / reactions / follows / user_progress / app_events / auth.users）
- ほかのユーザーのデータは1件も消えない

### Edge Function（Deno で実行）

`deno check` で型検査を通したうえ、モックを差し込んで全30項目合格。

- Authorization ヘッダ無し / GET / 無効なJWT を正しく拒否し、そのとき DB を一切触らない
- 削除の順序が STEP1〜7 のとおり（`app_events` は必ず Auth 削除より前）
- `avatars/{userId}/` 配下の**全ファイル**を削除する（将来ファイルが増えても対応）
- `auth.users` は **hard delete**（soft delete ではない）
- `user_progress` / `app_events` / `reports` / `blocks` が無い環境でも成功する
- **本当の失敗（権限エラー等）は 500 で返し、そのとき `auth.users` を削除しない**
- Auth 削除の失敗も 500 で返す（成功と偽らない）
- avatars バケット未作成でもスキップして削除を完了する
- リクエストボディに他人の `user_id` を入れても無視され、JWT の本人だけが削除される

### コード検査

- Babel（`preset-env` + `preset-react`）でコンパイル成功
- `index.html` のインラインJS と `app.js` がバイト単位で同期（先頭コメント1行を除く）
- `localStorage.clear()` / `sessionStorage.clear()` の使用箇所：**0**（コメント内の言及のみ）
- service_role / secret key の記述：**0**（コメント内の注意書きのみ）
- Analytics / 広告SDK / Geolocation の記述：**0**

---

## 9. 既知の事項（v49.1 から引き継いでいるもの・今回は変更していません）

指示書の「それ以外は一切変更禁止」に従い、次の既存の未翻訳箇所には手を付けていません。
気になる場合は、次のバージョンでのご相談とさせてください。

- タイムライン下部のボタン「✨ 運動を記録して投稿する」が日本語固定
- 投稿カードの運動種別タグと投稿フォームの種別チップが `a.label` を直接参照しており、
  英語モードでも日本語のラベルが出る（`tl(a)` を使えば解消しますが、v50 の対象外としました）
- `?debug=sns` の開発用デバッグ表示が日本語固定（本番UIには出ません）

---

## 10. ファイル一覧

### 新規ファイル

```
privacy/index.html
terms/index.html
community-guidelines/index.html
account-deletion/index.html
contact/index.html
legal/legal.css
legal/legal.js
supabase/migrations/20260908_v50_safety_legal.sql
supabase/functions/delete-account/index.ts
README_v50_legal_safety.md
```

### 変更ファイル

```
index.html          （追加688行・置換9行）
app.js              （index.html のインラインと同期）
README_CURRENT.md   （冒頭を v50 CLEAN へ更新。v49.1以前の履歴は残しています）
```

### 変更していないファイル

```
style.css
_headers
supabase_v28_events.sql
supabase/migrations/20260101000000_v43_real_sns.sql
assets/ images/ ルート直下の画像すべて
README_v38.md 〜 README_v44_device_preview_fix.md（過去のREADME）
```
