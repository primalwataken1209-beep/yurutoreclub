# ゆるトレ倶楽部 v43 — 実ユーザーSNS基盤

ベース：`yurutore_v42_2_mini_actions_clean`

SNSを「ダミー投稿中心の画面」から
**実ユーザー → 実投稿 → 実リアクション → 実コメント → 実フォロー**
の本物の構造へ移行しました。

> 派手にすることより、土台を正しく作ることを優先しています。
> 認証は既存のSupabase認証をそのまま使い、新しい認証方式は作っていません。

---

## 1. DB構成

| テーブル | 役割 | 主キー |
|---|---|---|
| `profiles` | SNS表示用プロフィール（**既存テーブルを拡張**） | `id`（= `auth.users.id`） |
| `posts` | 投稿 | `id` (uuid) |
| `post_reactions` | ゆるリアクション | `(post_id, user_id, reaction_type)` |
| `comments` | コメント（返信ツリーなし） | `id` (uuid) |
| `follows` | フォロー | `(follower_id, following_id)` |

### profiles は新規に作らず、既存のものを使っています

v25 の時点でアプリはすでに `profiles` へ upsert していました
（`nickname` / `hitokoto` / `intro` / `avatar_url` / `fav_acts` / `pace` / `region` / `is_public` / `updated_at`）。
指示書§3の「重複テーブルを作らず可能な限り既存構造を活用」に従い、**列名はそのまま**使います。

| 指示書の推奨名 | 実際に使う列 | 補足 |
|---|---|---|
| `display_name` | `nickname` | ニックネーム前提。本名は必須にしていません |
| `bio` | `intro`（自己紹介・長め） / `hitokoto`（ひとこと・短め） | プロフィール画面には `intro` を表示 |
| `prefecture` | `region` | **都道府県まで。任意。市区町村より細かい情報は扱いません** |
| `avatar_url` | `avatar_url` | そのまま |
| `created_at` | `created_at` | v43で追加 |
| `updated_at` | `updated_at` | そのまま（トリガーで自動更新） |

マイグレーションは `create table if not exists` ＋ `add column if not exists` なので、
**すでに profiles がある環境でも、足りない列だけが足されます**（既存データは消えません）。

### テーブル関係

```
auth.users (Supabase認証・既存)
    │ id
    ▼
public.profiles           ← SNSの起点。auth.uid() と 1:1
    │ id
    ├──────────────┬──────────────┬──────────────┐
    ▼              ▼              ▼              ▼
  posts        comments     post_reactions    follows
 user_id        user_id        user_id      follower_id / following_id
    │              ▲              ▲
    └── post_id ───┴──────────────┘
```

`posts` / `comments` / `post_reactions` / `follows` はすべて `profiles(id)` を参照し、
`profiles(id)` が `auth.users(id)` を参照します（両方 `on delete cascade`）。
退会時は auth 側の削除だけで、SNSデータも一緒に消えます。

**既存テーブルには一切触れていません**（`app_events` / `user_progress` / Storageの `avatars` バケット）。

---

## 2. SQLファイル

```
supabase/migrations/20260101000000_v43_real_sns.sql
```

### 実行順

1つのファイルにまとまっており、**上から順に1回実行するだけ**です。
Supabaseダッシュボード → SQL Editor に貼り付けて実行してください
（Supabase CLI なら `supabase db push`）。

ファイル内の順序は以下のとおりです。

| # | 内容 |
|---|---|
| 1 | `profiles`（無ければ作成 / あれば不足列を追加） |
| 2 | `posts` |
| 3 | `post_reactions` |
| 4 | `comments` |
| 5 | `follows` |
| 6 | インデックス |
| 7 | `updated_at` 自動更新トリガー |
| 8 | 新規ユーザー登録時に `profiles` を自動作成するトリガー ＋ 既存ユーザーの取りこぼし補完 |
| 9 | RLS 有効化とポリシー |
| 10 | 権限（`anon` から revoke、`authenticated` に必要な分だけ grant） |

**何度実行しても同じ結果になります（冪等）。** 実際に2回連続で流し、
エラーなし・既存データ保持を確認しています。

### インデックス

| 名前 | 対象 | 用途 |
|---|---|---|
| `posts_created_at_idx` | `posts(created_at desc) where is_deleted=false` | 新着順タイムライン |
| `posts_user_created_idx` | `posts(user_id, created_at desc) where is_deleted=false` | プロフィールの投稿一覧 |
| `comments_post_idx` | `comments(post_id, created_at) where is_deleted=false` | コメント展開 |
| `post_reactions_post_idx` | `post_reactions(post_id)` | リアクション集計 |
| `follows_following_idx` | `follows(following_id)` | フォロワー数 |
| `follows_follower_idx` | `follows(follower_id)` | フォロー中タイムライン |

---

## 3. RLS内容

**5テーブルすべてで RLS を有効化しています。無効のまま完成にはしていません。**

方針は2つだけです。

- **閲覧**：ログイン済み（`authenticated`）なら見られる。**未ログイン（`anon`）には一切見せない**
- **作成・更新・削除**：**すべて本人だけ**。`user_id` / `follower_id` は必ず `auth.uid()` と一致が必要

| テーブル | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `profiles` | 認証済みなら全件 | `id = auth.uid()` | `id = auth.uid()` | ポリシーなし（退会は auth 側の cascade） |
| `posts` | `is_deleted=false` または自分の投稿 | `user_id = auth.uid()` | `user_id = auth.uid()`（編集・ソフトデリート兼用） | `user_id = auth.uid()`（アプリ未使用・運用の保険） |
| `post_reactions` | 認証済みなら全件 | `user_id = auth.uid()` | ポリシーなし（付け外しのみ） | `user_id = auth.uid()` |
| `comments` | `is_deleted=false` または自分のコメント | `user_id = auth.uid()` | `user_id = auth.uid()` | `user_id = auth.uid()` |
| `follows` | 認証済みなら全件 | `follower_id = auth.uid()` かつ `follower_id <> following_id` | ポリシーなし | `follower_id = auth.uid()` |

さらに RLS と二段構えで、テーブル権限そのものを絞っています。

```sql
revoke all on ... from anon;              -- 未ログインは読み取りすら到達しない
grant select, insert, update on public.profiles to authenticated;
...
```

### DBレベルの制約（アプリを信用しない）

| 制約 | 効果 |
|---|---|
| `post_reactions` の主キー `(post_id,user_id,reaction_type)` | **同じ人が同じ投稿へ同じリアクションを連打できない**。種類が違えば複数可 |
| `follows` の主キー `(follower_id,following_id)` | **重複フォロー不可** |
| `follows_no_self` CHECK | **自分自身のフォロー禁止** |
| `posts_not_empty` CHECK | 本文も種別も空の投稿は作れない |
| `posts_body_len` / `comments_body_len` | 投稿300文字 / コメント200文字まで |
| `post_reactions_type_valid` | 定義済みの5種類以外は入らない |
| `posts_activity_type_valid` | 既存の運動種別ID以外は入らない |

---

## 4. 投稿フロー

```
① SNSタブの投稿フォームから
   本文＋運動種別を入力 → 「投稿する」
        │
        ▼
   snsCreatePost(uid,{body,activityType},user)
        │  ├ snsEnsureProfile()  … profiles行が無ければ作る（外部キー対策）
        │  └ posts へ INSERT（user_id は auth.uid() と一致必須＝RLS）
        ▼
   成功したら、通信を待たずに画面の先頭へ差し込む

② 運動記録から投稿（既存フロー）
   「記録して投稿」/ 褒め画面の「タイムラインへ」
        │
        ▼
   publishToSns(report)
        ├ 本文 = メモ（無ければ「◯◯をやったよ〜」）
        ├ 運動種別 = 記録の aid
        └ 未ログイン時は投稿せず「体験版だから…」と伝えるだけ
   ※ここが失敗しても運動記録そのものは必ずローカルに保存される
```

削除は **ソフトデリート**（`is_deleted = true`）。行は残ります。
自分の投稿にだけ「削除」ボタンが出ます。

---

## 5. コメントフロー

```
投稿カードの「💬 応援コメント N」をタップ
        │
        ▼
   snsFetchComments(uid,postId)   … 未取得のときだけ取りに行く
        └ comments(is_deleted=false) を古い順 ＋ 投稿者プロフィールをまとめて取得
        ▼
   入力して「送る」 → snsAddComment()
        └ comments へ INSERT（user_id = auth.uid()）
        ▼
   その場で一覧に足し、コメント数を+1
```

v43では**返信ツリーなし**（フラットな一覧）。削除はソフトデリート。

---

## 6. リアクションフロー

ゆるトレ独自の5種類を**そのまま残しています**（通常SNSの「いいね」単独にはしていません）。

| key | 表示 | 
|---|---|
| `panda` | 🐼 えらすぎ！ |
| `ramen` | 🍜 飯テロ |
| `zero` | 🔥 実質ゼロ |
| `night` | 🌙 深夜部 |
| `yuru` | 😴 ゆるくいこ〜 |

```
リアクションをタップ
        │
        ├ 先に画面へ反映（押した瞬間に数が動く）
        ▼
   snsToggleReaction(uid,postId,type,turnOn)
        ├ ON  … post_reactions へ upsert（ignoreDuplicates）
        │        主キー重複＝連打しても2件にならない
        └ OFF … 自分の行だけ delete
        ▼
   失敗したら画面を元に戻し、カード内に短いメッセージを出す
```

同じ種類をもう一度押すと外れます（トグル）。種類が違えば複数つけられます。

---

## 7. フォローフロー

```
タイムラインでアイコン／名前をタップ
        ▼
   プロフィール画面（SnsUserScreen）
        ├ snsFetchProfile()     … 表示名・アイコン・自己紹介・都道府県
        ├ snsFetchUserCounts()  … 投稿数 / フォロー数 / フォロワー数
        ├ snsFetchUserPosts()   … その人の投稿一覧
        └ snsIsFollowing()      … 自分がフォロー済みか
        ▼
   「フォローする」→ snsSetFollow(uid,targetId,true)
        └ follows へ upsert（重複は主キーで弾かれる）
   「フォロー中」→ もう一度押すと解除
        ▼
   自分自身のプロフィールにはフォローボタンを出さない
   （DB側も CHECK と RLS で二重に禁止）
```

タイムラインの「フォロー中」タブは、`follows` から取得した相手の投稿だけを新着順に出します。

---

## 8. タイムラインの構造（§10）

v43では **新着順の全体タイムライン** が基本です。加えて「フォロー中」タブを用意しました。

```js
const SNS_FEEDS=[
  {id:'all',      label:'みんな'},
  {id:'following',label:'フォロー中'}
];
```

将来「おすすめ」「地域」を足すときは、

1. `SNS_FEEDS` に1行足す
2. `snsFetchTimeline()` の `mode` 分岐で対象 `user_id` を絞る

だけで、描画側（`SnsPostCard`）はそのまま使えます。

### N+1にしない取り方

投稿を取ってから、そのページ分の投稿者・リアクション・コメント数を**3クエリでまとめて**取ります
（`snsFetchPostExtras`）。投稿30件でも合計4クエリで済みます。

PostgRESTの埋め込み（join構文）は使っていません。
マイグレーション直後にスキーマキャッシュが古いと join が失敗することがあるためです。

---

## 9. テスト結果

### ① DB：本物のPostgreSQL 16 で RLS を検証

Supabaseの `auth` スキーマ・`anon`/`authenticated` ロール・`auth.uid()` をローカルに再現し、
JWTのクレームを差し替えてユーザーを切り替えながら検証しました。

```
PASS  サインアップで profiles が自動作成される
PASS    → nickname に登録名が入る

── Aユーザー ──
PASS  Aが自分のプロフィールを編集できる
PASS  Aが投稿できる / コメントできる / リアクションできる

── Bユーザー ──
PASS  BがAの投稿を見られる / BがAのプロフィールを見られる
PASS  BがAをフォローできる
PASS  BがAの投稿にコメントできる / リアクションできる

── できてはいけないこと ──
PASS  AがBの投稿を編集できない
PASS  AがBの投稿を削除できない
PASS  AがBのプロフィールを編集できない
PASS  AがBのコメントを削除できない
PASS  AがBのリアクションを消せない
PASS  AがBのuser_idで投稿できない（RLS違反で拒否）
PASS  AがBになりすましてフォローできない
PASS  AがBになりすましてコメントできない

── 制約 ──
PASS  重複フォローは1件のまま
PASS  自分自身はフォローできない
PASS  同じリアクションの連打は増えない
PASS  種類が違うリアクションは付けられる
PASS  未定義のリアクション種別は入らない
PASS  本文も種別も空の投稿は作れない
PASS  301文字の投稿は作れない（上限300）

── 未ログイン（anon）──
PASS  未ログインでは投稿できない
PASS  posts / profiles / comments / post_reactions / follows すべて
      「permission denied」で1件も読めない

── ソフトデリート ──
PASS  本人は自分の削除済み投稿が見える（復元用）
PASS  他人には削除済み投稿が見えない

── タイムライン ──
PASS  全体タイムライン＝新着順
PASS  フォロー中タイムライン＝フォローした人の投稿だけ

── RLS ──
PASS  5テーブルすべてで relrowsecurity = true

── 冪等性 ──
PASS  マイグレーションを2回流してもエラーなし・データ保持
```

### ② UI：実ブラウザ（Chromium）で2ユーザーの流れを検証

Supabaseのクエリビルダを再現したテスト用スタブに差し替え、
実際の画面を操作して確認しました（**PASS 34 / FAIL 0 / JSエラー 0**）。

```
① Aユーザー
PASS  実投稿が表示される
PASS  ダミー投稿（みちこ等）が混ざっていない
PASS  新規投稿できる（先頭に出る）
PASS  自分の投稿には削除ボタンが出る
PASS  リアクションできる（数が1になる）
PASS  同じリアクションの連打で2にならない（トグルで外れる）
PASS  コメントできる

② Bユーザー
PASS  BがAの投稿を見られる
PASS  BにはAの投稿の削除ボタンが出ない
PASS  B自身の投稿には削除ボタンが出る
PASS  BがAのプロフィールを開ける（表示名/アイコン/自己紹介/都道府県/投稿数/フォロー/フォロワー）
PASS  BがAをフォローできる（フォロワー数が1になる）
PASS  フォロー→解除→再フォローしても1件のまま（重複なし）
PASS  自分自身のプロフィールにフォローボタンが出ない
PASS  BがAの投稿にリアクション／コメントできる
PASS  「フォロー中」タブにAの投稿だけが出る

③ Aに戻る
PASS  Bのリアクションが反映されている
PASS  Bのコメントが見える
PASS  自分の投稿を削除できる（ソフトデリート：行は残る）

④ 未ログイン
PASS  投稿フォームが出ない
PASS  「ログインすると、みんなの投稿が見られるよ」と案内が出る
PASS  他人の投稿が出ない

⑤ 空・エラー
PASS  投稿ゼロでも空白にしない（「まだ投稿がないよ🐼」）
PASS  通信失敗で再試行ボタンが出る
PASS  無限ローディングにならない
PASS  テーブル未作成でも案内が出る

⑥ 既存機能
PASS  タブ構成は変わっていない
PASS  パンダルームが表示される
PASS  パンジロー生活画像が表示される
```

### ③ 既存機能の回帰（v42.2）

8ポーズすべてで、立ち絵・ミニアクション・夜景を確認（**PASS 8 / FAIL 0**）。

```
normal      panda42_normal.webp      / mini-tilt
window      panda42_window.webp      / mini-gaze
ramen       panda42_eat.webp         / mini-slurp   窓: room30_window_evening.webp
pizza       panda42_pizza.webp       / mini-bite    窓: room30_window_evening.webp
relax_floor panda42_relax_floor.webp / mini-breathe 窓: room30_window_deepnight.webp
workout     panda42_workout.webp     / mini-reps
sofa        panda42_sofa.webp        / mini-shift   窓: room30_window_night.webp
beer        panda42_beer.webp        / mini-blink   窓: room30_window_night.webp
```

---

## 10. 実装中に見つけて直した不具合

**プロフィールが空で上書きされる問題**（v43の実装中に発見）

投稿・コメント・リアクションの直前に `snsEnsureProfile()` を呼んでプロフィール行を用意していますが、
最初の実装では端末側の `state.user` をそのまま upsert していました。
そのため、端末の自己紹介や都道府県が空のときに
**サーバー側の自己紹介・都道府県を消してしまう**状態になっていました。

修正後は次のように分けています。

- **通常時（投稿の直前など）**：中身が入っている項目だけを書く。空で上書きしない
- **プロフィール編集画面の保存時**：`{full:true}` で、ユーザーが自分で消した項目も反映する

---

## 11. UIについて（§15）

既存ゆるトレのデザインをそのまま使っています。禁止事項はすべて守っています。

| 禁止 | 状態 |
|---|---|
| X/Twitterそっくり | なし（既存のカード・配色・角丸のまま） |
| Instagramそっくり | なし（画像グリッドなし） |
| 派手すぎる通知 | なし（既存のトーストのみ） |
| フォロワー数を強調 | なし（プロフィール画面に小さく3つ並べるだけ） |
| 人気ランキング | なし |
| 連続投稿バッジ | なし |
| 競争的スコア | なし |

投稿フォームの文言も「今日の“ちょっとだけ”を投稿」「ひとことでOK」に留め、
競争を煽る表現は入れていません。

### プライバシー（§12）

- 都道府県（`region`）は**任意**。未設定なら表示しません
- **市区町村より細かい位置情報は扱いません**（列自体がありません）
- 表示名はニックネーム前提。**本名必須にしていません**
- メールアドレスはSNS画面に一切出しません

---

## 12. 開発用デバッグ（§21）

```
?debug=sns
```

を付けたときだけ、SNSタブの下に確認情報が出ます。**本番UIには表示されません。**

```
uid: 11111111-1111-1111-1111-111111111111
supabase: 接続あり
feed: all / status: ready
posts: 3 / authors: 2
reactions付き投稿: 2
error: (なし)
```

同じ場所に、v42までのダミー投稿も「開発用デモ投稿」として表示されます
（本番タイムラインには一切出ません）。

既存の `?debug=1` / `?hour=` / `?action=` / `?variant=` / `?mini=1` はそのまま使えます。

---

## 13. 変更ファイル一覧

| ファイル | 変更内容 |
|---|---|
| `index.html` | **本番の正**。SNSアクセス層・タイムライン・投稿カード・プロフィール画面・デバッグを追加 |
| `app.js` | `index.html` のインラインJSと同一内容（同期用）。**中身は完全一致** |
| `README_CURRENT.md` | v43の記載を追加 |

### 追加ファイル

| ファイル | 内容 |
|---|---|
| `supabase/migrations/20260101000000_v43_real_sns.sql` | v43のDBマイグレーション（これ1本を実行するだけ） |
| `README_v43_real_sns.md` | 本ドキュメント |

**CSSは変更していません**（既存の `.post` / `.avatar` / `.yuru-reaction` / `.card` などをそのまま使用）。
**画像の追加・変更・削除はありません。**

### 主な追加コード

| 名前 | 役割 |
|---|---|
| `snsEnsureProfile` / `snsFetchProfile` / `snsFetchUserCounts` | プロフィール |
| `snsFetchTimeline` / `snsFetchPostExtras` / `snsFetchUserPosts` | タイムライン取得 |
| `snsCreatePost` / `snsSoftDeletePost` | 投稿 |
| `snsToggleReaction` | ゆるリアクション |
| `snsFetchComments` / `snsAddComment` / `snsSoftDeleteComment` | コメント |
| `snsIsFollowing` / `snsSetFollow` | フォロー |
| `snsErrMsg` / `snsGuard` | エラーを日本語1行にする・未ログイン判定 |
| `TimelineScreen`（作り直し） | タブ・投稿フォーム・一覧・空/エラー表示 |
| `SnsComposer` / `SnsPostCard` / `SnsUserScreen` / `SnsNotice` | 画面部品 |
| `publishToSns` | 運動記録 → 実投稿 |
| `DevSnsDebug` | `?debug=sns` のときだけの確認表示 |

### v42までのコードの扱い

| 名前 | 扱い |
|---|---|
| `SAMPLE_POSTS` / `SAMPLE_USERS` | `DEV_SAMPLE_POSTS` / `DEV_SAMPLE_USERS` へ改名。**本番タイムラインからは参照されません**。`?debug=sns` のときだけ表示 |
| `toggleReaction` / `addCmt` | v42までのローカル保存を書き換える関数。タイムラインからは呼ばれなくなったが、**既存の保存データ構造を変えないため残しています** |
| `suggestReactions` | 未使用。将来「投稿に合うリアクションを上に出す」を戻すとき用に残しています |
| `state.reactions` / `state.likes` / `state.myComments` | **localStorageのキー・構造とも変更なし** |

---

## 14. 既存機能を壊していないこと（§18）

以下は**一切変更していません**。

| 項目 | 状態 |
|---|---|
| パンダルーム / 夜景 / パンジロー生活行動 / ミニアクション | 無変更（8ポーズすべて動作確認済み） |
| 運動記録 | 無変更（「記録して投稿」にSNS送信を1行足しただけ。失敗しても記録は必ず残る） |
| 認証（Supabase） | 無変更。**新しい認証方式は作っていません**。`auth.uid()` をSNSのIDにしています |
| ミッション / ポイント / ホーム / 履歴（今週） | 無変更 |
| `app_events` / `user_progress` / Storage `avatars` | 無変更 |
| localStorage の既存キー | **追加・変更・削除なし** |
| CSS / 画像 | 無変更 |

---

## 15. 未実装項目（v43では作っていないもの）

指示書§1のとおり、以下は**意図的に作っていません**。

- DM
- 都道府県掲示板
- オフ会 / イベント / グループ
- 有料会員DM
- 通知センター
- ブロック / 通報の高度UI
- 動画投稿 / ライブ配信
- 画像つき投稿（§4「v43では必須ではない」）
- 投稿の編集UI（削除＝ソフトデリートのみ。RLS上は本人のUPDATEが可能）
- コメントの削除UI（APIとRLSは用意済み。ボタンは未設置）
- タイムラインの続き読み込み（1ページ30件まで）
- 「おすすめ」「地域」タブ（構造だけ用意）

---

## 16. 不要／重複ファイルの有無

**なし（クリーン版です）。**

- 旧ZIP・バックアップ・入れ子ZIP・重複ソース・検証用スタブ：含めていません
- 画像は v42.1 から変更なし（8ファイル・計399KB）
