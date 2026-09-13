# ゆるトレ倶楽部 v50.2 CLEAN

公開・確認しやすいように整理した版です。
現在の基準バージョンは **v50.2** です。過去の変更履歴は下に残してあります。

## 最新の変更（v50.2 i18n Final Polish）

英語モードに残っていた表示と、自動投稿のクールダウン漏れだけを、v50.1 から最小差分で直しました。
**修正対象は次の4点のみ**です。

1. **YURU_REACTIONS 5種を日英対応** — `label_en` / `line_en` を追加
   （So proud! / Food flex / Basically zero / Night crew / Take it easy~）
2. **リアクションセリフ5種を日英対応** — タップ後の吹き出しも英語になる
3. **運動記録の自動投稿本文を日英対応** — `Did some walking today~` など。日本語は従来どおり
4. **自動投稿fallbackを日英対応** — `ちょっとだけ動いた〜` / `Moved a little today~`
5. **通常投稿と運動自動投稿で10秒クールダウンを共有** — 投稿経路に関係なく同一ユーザーは共通10秒

既存の日本語文言は1文字も変更していません。保存済みの過去投稿も書き換えていません。
新しいクールダウンの仕組みは作らず、v50.1 の判定関数・文言をそのまま再利用しています。

あわせて、クールダウンで自動投稿が止まったときにその案内が
「タイムラインに投稿したよ ✨」で上書きされて見えなくなる問題を直しました
（投稿できたときだけ成功トーストを出すようにした。通信エラーの案内も同様に見えるようになります）。

**Legal / Auth / Panda Room / DB schema は非変更です。**
Privacy / Terms / Community Guidelines / Contact / Account deletion ページ、Edge Function、
reports / blocks / RLS、危険表現フィルタ、通報・ブロック、Supabase Auth / Google OAuth / Email Auth、
パンジロー15ポーズ・PJ47設定・行動時間・タップ演出・家具・夜景、`style.css`、画像アセットは
すべて v50.1 からバイト単位で同一です。SQL migration の追加もありません。

変更ファイルは `index.html`（追加71行・置換19行）と、それに同期した `app.js` のみ。
新規ファイル・削除ファイルはありません。
詳細は `README_v50_legal_safety.md` の「v50.2 i18n Final Polish」を参照してください。

## v50.1 の変更（Store Review Polish）

審査前に残っていた小さな品質問題だけを、v50 から最小差分で潰したバージョンです。

- **既存未翻訳3箇所を修正**（英語モードで日本語が残っていた箇所）
  - タイムライン下部のボタン → `t('sns.recordAndPost')`（英語：`✨ Log a workout and share it`）
  - 投稿カードの運動種別タグ → `tl(act)`
  - 投稿フォームの運動種別チップ → `tl(a)`
- **SNS投稿の10秒連投防止**（投稿成功から10秒間は次の投稿を送信しない）
- **コメントの5秒連投防止**
- **空白のみの投稿／コメント防止の確認**（既存の `trim()` を活用。重複実装なし）
- **最低限の危険表現チェック**（明白な殺害予告・自傷を促す表現・重大な暴力を促す表現のみ／日13＋英10フレーズ）
- **i18nキー整合性の確認**（ja / en とも 506 キーで完全一致）

**v50 の Legal / Account Deletion / Safety 設計は変更していません。**
Privacy / Terms / Community Guidelines / Contact / Account deletion ページ、Edge Function、
reports / blocks / RLS、13歳以上確認、SNS通報、SNSブロック、Auth削除処理、Supabase構成、
`style.css`、画像アセットはすべて v50 からバイト単位で同一です。

連投防止はフロント側のメモリ上だけで管理しており、
**新しいSupabaseテーブル・migration・保存キー・外部依存は一切追加していません。**

変更ファイルは `index.html`（追加105行・置換3行）と、それに同期した `app.js` のみです。
詳細は `README_v50_legal_safety.md` の「v50.1 Store Review Polish」を参照してください。

## v50 の変更

**Legal / Privacy / Account Deletion / SNS Safety のみ追加**しています。新機能追加版ではありません。

- 公開リーガルページを追加（ログイン不要・軽量な静的HTML・日英切替）
  - `/privacy/` `/terms/` `/community-guidelines/` `/account-deletion/` `/contact/`
  - 運営者名 `[OPERATOR_NAME]` と問い合わせ先 `[SUPPORT_EMAIL]` は `legal/legal.js` の1か所で管理
- 登録画面（新規登録タブのみ）に「私は13歳以上です」と規約同意表示を追加。ログイン画面には出さない
- SNSに通報機能（投稿・コメント）とブロック機能を追加。既存SNSの見た目は変えていない
- アプリ内アカウント削除を追加（2段階確認 → Supabase Edge Function で完全削除）
- 新規マイグレーション `supabase/migrations/20260908_v50_safety_legal.sql`（reports / blocks / RLS）
- 新規 Edge Function `supabase/functions/delete-account/index.ts`
- i18n に `legal` 名前空間を追加（ja / en 各55キー）。**ja / en は502キーで完全一致**
- プロフィール画面下部に規約リンク・ブロック解除・アカウント削除を配置

**変更していないもの**：パンジロー15ポーズ・PJ47生活エンジン・行動発生タイミング・パンダルーム・家具・
夜景/昼夜切替・ホーム・運動記録・カレンダー・タイムカプセル・ミッション・今日のひとこと365・
既存SNSの基本UI・既存認証処理・Google OAuth・メール認証・既存ルーティング・
既存の localStorage / sessionStorage キー・Supabase URL / Publishable Key・
デバイスプレビュー制御・`style.css`・画像アセット。

`style.css` と既存マイグレーションはバイト単位で無変更です。
公開前に必要な手順は `README_v50_legal_safety.md` を必ず参照してください
（OPERATOR_NAME / SUPPORT_EMAIL の置換、Edge Function の deploy、SQL の実行が終わるまで本番公開完成ではありません）。

## v49.1 の変更

- Home 365-day counter i18n fix（`365日中 ○日目` → 英語は `Day ○ of 365`）
- Time Capsule empty-state i18n fix（`まだ預かり中の手紙はないよ` を既存辞書キーへ）
- Profile image save error i18n fix（保存エラー文言を日英対応）
- README version label updated（冒頭表記を v49.1 に）

上記4点のみ。365データ・日付計算・パンジロー生活行動・認証・SNS・保存キーは無変更。

## v44 の変更
ログアウト後に iPhone / Android が2台同時表示される問題への対策です。
2台表示の正体は `Root()` のPC向けフォールバック（v43まで）で、v43.1で既に除外済みでした。
v44ではさらに、デバイスプレビューを **開発環境(localhost)＋?preview=1 のときだけ** に格下げし、
本番ホストでは URL に何を付けても2台表示が起きないようにしました。
あわせて、公開中のビルド番号を確認する仕組み（`?build=1` / コンソール / `window.__YURUTORE_BUILD__`）と、
古いページが残らないための Netlify 用 `_headers` を追加しています。
詳細は `README_v44_device_preview_fix.md` を参照してください。

## v43.1 の変更
ログアウト後の画面遷移を修正しました。ログアウトすると必ずウェルカム／認証画面へ戻ります。
PC向けの「デバイスプレビュー」（iPhone/Androidの2画面）は本番導線から除外し、
どの端末でもアプリを1つだけ表示します（開発用に ?preview=1 は残しています）。
Googleログインの戻り先を https://yurutore-club.netlify.app/ に固定し、
未ログイン→Welcome/Auth、ログイン済み→Home の判定を1か所へ集約しました。
詳細は `README_v43_1_auth_fix.md` を参照してください。

## v43 の変更
SNSを実ユーザー基盤へ移行しました。Supabaseの profiles / posts / post_reactions /
comments / follows を使い、実投稿・実リアクション・実コメント・実フォローが動きます。
RLSは5テーブルすべてで有効。DBは `supabase/migrations/20260101000000_v43_real_sns.sql`
を1回実行するだけです。詳細は `README_v43_real_sns.md` を参照してください。

## v42.2 の変更
パンジローのミニアクションを実装しました。常時ループのアニメーションは全廃し、
基本は完全に静止、8〜30秒に1回だけ短い仕草をして、また静止へ戻ります。
タイマーは setTimeout の連鎖方式で、パンダルームを離れると必ず停止します。
詳細は `README_v42_2_mini_actions.md` を参照してください。

## v42.1 の変更
パンジローの生活画像を本番実装しました。8ポーズ（normal / window / eat / pizza /
relax_floor / workout / sofa / beer）が `assets/panda-room/v42/` に入っています。
ピザは eat の25%、ビールは夜（19〜23時）の sofa/eat のときだけ12%のレア遭遇です。
詳細は `README_v42_1_living_assets.md` を参照してください。

## v42 の変更
パンダルームのパンジローを「常時ゆれる待機アニメーション」から
**生活行動システム**（normal / window / eat / relax_floor / workout / sofa）へ変更しました。
詳細は `README_v42_living_panjirou.md` を参照してください。

## 本番の主要ファイル
- index.html : 本番画面・主要ロジック（正）
- supabase/migrations/ : DBマイグレーション（v43のSNSテーブル / v50のreports・blocks）
- supabase/functions/delete-account/ : アカウント削除のEdge Function（v50）
- style.css : スタイル
- app.js : 同期用コード
- supabase_v28_events.sql : Supabase関連SQL（必要時のみ）

## 公開リーガルページ（v50）
- privacy/ terms/ community-guidelines/ account-deletion/ contact/ : 静的HTML（ログイン不要・日英）
- legal/legal.css : リーガルページ共通スタイル
- legal/legal.js : 運営者名・問い合わせ先の設定（**公開前に要置換**）＋ 日英切替

## 素材
- images/ : ウェルカム等の画像
- assets/panda-room/v30/ : パンダルームで使用する軽量WebP素材
- assets/panda-room/v41/ : v41の家具スロット素材
- assets/panda-room/v42/ : パンジロー生活立ち絵（8ポーズ・計399KB・README.txt参照）
- ルート直下の画像 : 現行コードから参照される互換用素材

## 整理で除外したもの
- 過去バージョンのREADME群
- backup_v29/ / backup_v37_clean/
- assets/panda-room/v30/originals/（PNG原本。実行時はWebPを使用）
- inline.jsx / script.jsx（本番index.htmlと重複する開発用ソース）
- changed_files.zip / full.zip の入れ子ZIP

元のv37 ZIPは変更していません。このCLEAN版は確認・展開しやすさを目的に再構成しています。

## v47（パンダルーム パンジロー生活感アップデート）

- パンダルームのパンジローを新デザイン15ポーズへ更新（assets/panda-room/v47/）
- 数秒〜数十秒でポーズがランダムに切り替わる「生活エンジン」を追加（PJ47_* / usePanjiro47Life）
- 軽い仕草 gap10〜20秒/hold5〜9秒 / 日常行動 gap20〜40秒/hold8〜15秒 / 大きな生活行動 gap35〜70秒/hold12〜25秒（v47.1で調整）
- 入室後の最初の軽い仕草だけ6〜12秒（PJ47_FIRST_GAP）
- 時間帯(band.id)で出現確率を重み付け。当日の運動記録で training / cheer / ramen が出やすくなる
- タップで「ん？」(question) を1.5〜3秒表示
- 切替演出は0.2秒の弱いフェードのみ。回転・ズーム・点滅・パーティクルは使用しない
- 認証 / ルーティング / ホーム / SNS / 運動記録 / 家具解放 / 時間帯背景は未変更
- PJ47_ENABLED=false で v42 の挙動へ戻せる

## v48（日本語／英語 多言語対応）

- i18n基盤を追加：I18N辞書 ＋ t('key') ＋ tl(obj) ＋ ytSetLang() ＋ useLang()
- 言語コード ja / en。将来 ko / zh / es は I18N に言語キーを1つ足すだけで追加できる
- 保存キーは yurutore_language のみ新規追加（既存キーは変更・削除なし）
- 判定優先順位：①保存済みのユーザー選択 → ②端末言語（ja以外はen） → ③en
- 切替はウェルカム画面下部と、パンダルーム設定の「言語 / Language」から。リロード不要
- Phase1（ウェルカム／オンボーディング／登録・ログイン／ホーム／運動記録／完了リアクション／
  ボトムナビ／パンダルーム主要UI／プロフィール）を英語化
- 未翻訳：パンジローの大量セリフ、今日のひとこと365、ゆるミッション365、褒め言葉プール、
  気分診断、SNS、今週画面、タイムカプセル（Phase 2）。未翻訳キーは自動で日本語へフォールバック
- パンジローの行動タイミング（PJ47_TIERS / PJ47_HOLD / PJ47_FIRST_GAP）は v47.1 から無変更
- 認証・Supabase・ルーティング・家具ロジック・時間帯演出は無変更

## v48.1（英語版 Phase 1 仕上げ）

- 認証導線（確認メール画面・入力チェック・ログイン／登録エラー・再送信・パスワード再設定・読み込み中）を辞書化
- パンジローのリアクション27種に lines_en / alt_en を追加（日本語は削除せず併記）
- 褒めメッセージの英語プール PRAISE_MESSAGES_EN（6カテゴリ×5本）を追加
- 家具35点に name_en / cond_en / memory_en、ごほうび5段階に title_en / label_en を追加
- 画像 alt、ルームのモーダル見出し・aria-label、相対時刻（分前/時間前/日前）を多言語化
- 新しい保存キーは追加していない（yurutore_language のみ）
- PJ47_TIERS / PJ47_HOLD / PJ47_FIRST_GAP・認証処理は v48 から無変更

## v49（Phase 2 日英完全対応）

英語モードの通常導線から日本語をなくしました。日本語版は1文字も劣化させていません。

- 辞書は ja / en とも **446キーで完全一致**（en 側に残る日本語は言語切替ボタンの「日本語」のみ）
- 新規名前空間：sns / week / capsule / photo / misc / mem / status / mood / demo
- コミュニティ（SNS）、今週、思い出、気分チェック、プロフィール、タイムカプセル、
  各モーダル・ボタン・エラー・トースト・空表示を英語化
- パンジローの会話を英語化
  - ROOM_TALK_DB_EN（部屋の会話DB全体のミラー）＋ `roomTalkDB()` で切替
  - ROOM_TODAY_MONOLOGUE_EN（5時間帯）
  - PJ47_TALK_EN（15ポーズ × 3本 = 45本）
  - PRAISE_MESSAGES_EN（6カテゴリ × 5本 = 30本）
- 今日のひとこと365：DAILY_365_MESSAGES_EN を **365本ちょうど**で新規書き下ろし
  （機械的な一括翻訳はしていない。日本語配列と本数が一致したときだけ英語を使う安全ガードつき）
- 今日のゆるミッション365：全365件に title_en / text_en を追加
  （実体は61種のユニークな組み合わせなので、61種を丁寧に英訳して展開）
- 都道府県は表示だけ英語（PREF_LABEL_EN）。**保存値は日本語のまま**なので既存データは無影響
- ローカル変数 `tl`（タイムラインのstate）を `feedData` に改名。
  i18nヘルパー `tl()` と名前が衝突していたため。処理は完全に同一
- 保存キーの追加・変更はなし（言語は既存の `yurutore_language` のみ）
- PJ47_TIERS / PJ47_HOLD / PJ47_FIRST_GAP / PJ47_WEIGHTS / PJ47_EX_BOOST / PJ47_POSES /
  usePanjiro47Life は v48.1 とバイト単位で同一（v47.1の間合いは無変更）
- 認証・ルーティング・Supabase・localStorage/sessionStorage の差分はゼロ
- index.html のインラインJSと app.js は完全同期（差分はapp.js先頭のコメント1行のみ）

### 今回あえて英語化していないもの（安全優先）
- パンダ相談室（PandaChatRoom）と300種の返答 … `HOME_SHOW.chatRoom=false` で非表示のため
- DAILY_SUPPORT（60件）… 現在UIに出ていないため
- pandaEmotion / PandaEmotionCard（約120本）… 非表示カードのため
- HOME_SHOW が false の旧ホームカード群（ゆる順路 / 週カード / ゆるナビ ほか）
- デバイスプレビュー画面の見出し（`?preview=1` の開発用のみ）
