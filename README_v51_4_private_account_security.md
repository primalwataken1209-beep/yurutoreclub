# ゆるトレ倶楽部 v51.4 — 非公開アカウント・SNSプライバシー最終強化

> **【v51.4.1 で更新されました】** この版の設計はそのまま有効ですが、SQLファイルは
> `supabase/migrations/20260924_v51_4_1_private_insert_rls.sql` に一本化されています
> （v51.4 の内容＋コメント／リアクションの INSERT 制限）。
> 最新の説明・適用手順は **`README_v51_4_1_private_insert_security.md`** を参照してください。
> このファイルは設計の経緯として残しています。

ベース：`yurutore_v51_3_security_headers_clean`

目的：**非公開アカウントの情報が、画面上だけでなく Supabase の API / RLS レベルでも他ユーザーへ渡らないようにする。**
UI・デザイン・パンジロー・パンダルーム・運動記録・写真投稿・Storage・CSP/_headers・認証・法務ページ・
アカウント削除・多言語・既存URL・既存の投稿フロー・**posts のRLS**は変更していません。

> **本番 Supabase には何も適用していません。**
> SQL はファイルとして用意しただけです。内容をご確認のうえ、手動で適用してください（§6）。

---

## 1. 変更ファイル一覧

| 区分 | ファイル | 変更内容 |
|---|---|---|
| 変更 | `index.html` | 取得先だけの最小変更（5か所・§4）。UI・デザイン・既存ロジックは変更なし |
| 変更 | `app.js` | `index.html` のインラインと同期（従来どおり。差分は先頭コメント1行のみ） |
| 追加 | `supabase/migrations/20260923_v51_4_private_account_rls.sql` | **本番に適用するSQL**（RLS 4件＋VIEW＋関数） |
| 追加 | `supabase/manual/v51_4_rollback.sql` | 今回の変更だけを戻すSQL |
| 追加 | `supabase/manual/v51_4_verify_readonly.sql` | 適用前／適用後の確認（読み取りのみ） |
| 追加 | `README_v51_4_private_account_security.md` | このファイル |
| 削除 | なし | |

**それ以外は v51.3 とバイト単位で同一**（`diff -rq` で確認済み）。
`style.css` / `_headers` / 画像 / `assets/` / 法務ページ / `legal/` / 既存 migration 3本 /
`supabase/functions/delete-account/index.ts` / 既存READMEは無変更です。

---

## 2. 調査結果（変更前の状態）

### 2-1. 変更前のRLS（リポジトリのSQLと、本番で確認済みの posts）

| テーブル | SELECT（変更前） | 問題 |
|---|---|---|
| `profiles` | `to authenticated using (true)` | **ログインしていれば誰でも、非公開ユーザーの `intro` / `hitokoto` / `region` / `fav_acts` / `pace` まで取得できた** |
| `posts` | 本人 or（`is_deleted=false` かつ 投稿者が公開） | 問題なし（本番で動作確認済み・**今回変更なし**） |
| `comments` | `is_deleted = false or user_id = auth.uid()` | **非公開ユーザーの投稿に付いたコメントが API から読めた** |
| `post_reactions` | `using (true)` | **非公開ユーザーの投稿のリアクション、誰がどこに反応したかが読めた** |
| `follows` | `using (true)` | **誰が誰をフォローしているかの全関係が読めた** |
| `blocks` | `blocker_id = auth.uid()` | 問題なし（**変更なし**） |
| `reports` | SELECT ポリシーなし＋select権限なし | 問題なし（**変更なし**） |

INSERT / UPDATE / DELETE はすべて「本人のみ」で、今回**一切変更していません**。
外部キーは `profiles → posts / comments / post_reactions / follows / blocks` がすべて `on delete cascade`、
`reports.reporter_user_id → auth.users` が `on delete cascade`。アカウント削除の流れも変更していません。

### 2-2. 画面が必要としている情報（変更前に全取得箇所を確認）

| 画面・処理 | 必要なもの |
|---|---|
| タイムライン（投稿カード） | 投稿者の `nickname` / `avatar_url`（投稿が見える人＝本人か公開ユーザーのみ） |
| コメント欄 | **コメントした人の `nickname` / `avatar_url`**（公開投稿には**非公開ユーザーもコメントできる**） |
| プロフィール画面 | `nickname` / `avatar_url` / `intro` / `hitokoto` / `region` / 投稿数 / フォロー数 / フォロワー数 |
| タイムライン「フォロー中」タブ | 自分がフォローしている相手の `following_id` |
| フォローボタン | 自分が相手をフォロー済みか |
| ブロック解除画面 | **ブロックした相手の `nickname` / `avatar_url`**（相手が非公開の場合もある） |
| 通報 | 書き込みのみ（読み出しなし） |

→ **「非公開ユーザーの profiles 行を全面的に読めなくする」だけでは、コメント欄とブロック解除画面の名前・アイコンが消えます。**
そのため §3 の二段構えにしています（ご指示 §4 のとおり）。

---

## 3. 変更後の設計

### 3-1. profiles：公開してよい最小情報と、詳細情報を分離

| 取得方法 | 返す内容 | 誰が取得できるか |
|---|---|---|
| `profiles` テーブル（RLS） | **全カラム**（`intro` / `hitokoto` / `region` / `fav_acts` / `pace` / `is_public` / `created_at` など） | **自分の行** または **公開アカウントの行**だけ |
| `public_profiles` VIEW（新規） | **`id` / `nickname` / `avatar_url` の3つだけ** | ログイン済みユーザー全員（非公開アカウントの分も含む） |

```sql
-- 変更前
create policy "profiles: read for authenticated" on public.profiles
  for select to authenticated using (true);

-- 変更後
create policy "profiles: read own or public" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or is_public = true);

create or replace view public.public_profiles with (security_barrier = true) as
  select p.id, p.nickname, p.avatar_url from public.profiles p;
grant select on public.public_profiles to authenticated;   -- anon には渡さない
```

**他ユーザーから取得できるもの（最小情報）**：`id`, `nickname`, `avatar_url`
理由：投稿者名・コメント投稿者名・アイコン・ブロック解除一覧の表示に必要なため（§2-2）。
**他ユーザーから取得できないもの**：`intro`, `hitokoto`, `region`, `fav_acts`, `pace`, `is_public`, `created_at`, `updated_at`
（公開アカウントについては、これまでどおり全項目が見えます。公開＝見せてよい、という設定のため）

VIEW は「定義者の権限」で動くため profiles のRLSを通りません（Supabase の診断では *security definer view* と表示されます）。
**公開してよい3列だけに絞った意図的な設計**で、詳細カラムはVIEWに含めていないため漏れません。

### 3-2. comments：自分が見られる投稿のコメントだけ

```sql
create policy "comments: read visible posts" on public.comments
  for select to authenticated
  using (
    user_id = (select auth.uid())                 -- 自分のコメント（削除済みでも本人には見える：従来どおり）
    or (is_deleted = false
        and exists (select 1 from public.posts p where p.id = comments.post_id))
  );
```
`exists(...)` の中の `posts` も **posts のRLSを通る**ため、「投稿が見えない人にはコメントも見えない」が自動的に成立します。
posts のポリシーは変更していません。

### 3-3. post_reactions：自分が見られる投稿のリアクションだけ

```sql
create policy "reactions: read visible posts" on public.post_reactions
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or exists (select 1 from public.posts p where p.id = post_reactions.post_id)
  );
```
見える投稿のリアクション数・自分が押したかどうかは、**今までどおり**表示されます。

### 3-4. follows：行は本人だけ。件数は専用関数で

```sql
create policy "follows: read own" on public.follows
  for select to authenticated
  using (follower_id = (select auth.uid()) or following_id = (select auth.uid()));
```
これだけだと他ユーザーのプロフィール画面の「フォロー数・フォロワー数」が 0 になってしまうため、
**行を返さず件数だけを返す関数**を用意し、表示は今までどおりにしています。

```sql
create or replace function public.yt_follow_counts(target uuid)
returns table (following_count integer, followers_count integer)
language plpgsql stable security definer
set search_path = public, pg_temp
as $$ ... $$;
grant execute on function public.yt_follow_counts(uuid) to authenticated;   -- anon には渡さない
```

SECURITY DEFINER の必須条件（ご指示 §7）への対応：

| 条件 | 対応 |
|---|---|
| search_path を明示 | `set search_path = public, pg_temp` |
| 入力値を信用しない | 引数は `uuid` 1つだけ。動的SQL・文字列連結は使用していません |
| 必要以上のデータを返さない | 返すのは**整数2つだけ**。誰がフォローしているかは一切返しません |
| authenticated 以外から呼べないように | `revoke all from public, anon` ＋ `grant execute to authenticated` |
| service_role 相当の権限を公開しない | テーブルを書き換える処理は含まず、件数の参照のみ |
| 不要なら使わない | profiles / comments / post_reactions はRLSだけで解決し、**関数は follows の件数のみ**に限定 |

さらに、**自分 または 公開アカウント以外を指定した場合は 0/0 を返します**（非公開アカウントの規模も見せない）。

### 3-5. blocks / reports（確認のみ・変更なし）

| テーブル | 現状 | 判断 |
|---|---|---|
| `blocks` | SELECT / INSERT / DELETE すべて `blocker_id = auth.uid()`。他人のブロック設定は読めない | **すでに安全。変更なし** |
| `reports` | SELECT ポリシーが1件もなく、`authenticated` に `select` 権限も付いていない（`grant insert` のみ）。他人の通報内容はもちろん、自分の通報も読めない | **すでに安全。変更なし** |

migration の中で「この2つが意図せず緩くなっていないか」を検査し、問題があれば**適用を中止**します。

### 3-6. 再帰RLSの回避（ご指示 §12）

参照の向きは一方向だけで、循環はありません。

```
comments  ─→ posts ─→ profiles ─→ （他テーブルを参照しない：auth.uid() と is_public だけ）
reactions ─→ posts ─┘
follows   ─→ （auth.uid() だけ。profiles を参照しない）
public_profiles（VIEW）─→ profiles のRLSを通らない（定義者権限）
```

- `profiles` のポリシーはサブクエリを持たないため、どこから参照されても再帰しません。
- `follows` のポリシーは **profiles を参照しません**（参照すると `profiles → follows → profiles` の形になり得るため、意図的に避けています）。
- 実際に `posts × profiles × comments × post_reactions` の4テーブル結合、`follows × profiles`、`public_profiles × posts` を
  PostgreSQL で実行し、`infinite recursion detected in policy` が出ないことを確認済み（§7）。

---

## 4. アプリ側の変更（index.html・5か所／UIは変更なし）

| # | 場所 | 変更内容 |
|---|---|---|
| 1 | 新規ヘルパー追加 | `snsFetchPublicProfiles(ids)`（名前・アイコンをまとめて取得）と `snsFetchFollowCounts(uid,target)`（件数取得）。**どちらもVIEW／関数が無いDBでは自動的に従来の取得方法へ戻る** |
| 2 | `snsFetchProfile()` | 詳細が取れなかった場合（＝相手が非公開）だけ、VIEWから名前・アイコンを取得。画面は「名前だけ表示・投稿0件」になります |
| 3 | `snsFetchUserCounts()` | フォロー数・フォロワー数を `yt_follow_counts` から取得（投稿数は従来どおり posts の件数） |
| 4 | `snsFetchComments()` | コメント投稿者の名前・アイコンを `public_profiles` から取得（非公開ユーザーの名前が消えないように） |
| 5 | `snsFetchBlockedProfiles()` | ブロック解除画面の名前・アイコンを `public_profiles` から取得 |

UI・文言・CSS・i18n・既存の投稿/記録/写真/認証のロジックは**1行も変えていません**（i18n は ja/en 521キーで一致を再確認）。

**この作りのおかげで、アプリとSQLのどちらを先に反映しても壊れません**：
- アプリだけ先に公開 → VIEW/関数が無いので従来の取得方法で動作（実ブラウザで確認済み）
- SQLだけ先に適用 → 旧アプリでも動作しますが、コメント欄で非公開ユーザーの名前が既定名になり、他ユーザーのフォロー数が0と表示されます
→ **推奨は「アプリを先に公開 → SQLを適用」**（§6）

---

## 5. 変更前後のポリシー一覧

| テーブル | 変更前 | 変更後 |
|---|---|---|
| profiles | `"profiles: read for authenticated"` `using (true)` | `"profiles: read own or public"` `using (id = auth.uid() or is_public = true)` |
| comments | `"comments: read alive"` `using (is_deleted = false or user_id = auth.uid())` | `"comments: read visible posts"` `using (user_id = auth.uid() or (is_deleted = false and exists(見える投稿)))` |
| post_reactions | `"reactions: read for authenticated"` `using (true)` | `"reactions: read visible posts"` `using (user_id = auth.uid() or exists(見える投稿))` |
| follows | `"follows: read for authenticated"` `using (true)` | `"follows: read own"` `using (follower_id = auth.uid() or following_id = auth.uid())` |
| posts / blocks / reports | — | **変更なし** |
| INSERT / UPDATE / DELETE（全テーブル） | — | **変更なし** |
| 追加 | — | VIEW `public_profiles`（3列）、関数 `yt_follow_counts(uuid)` |

---

## 6. 本番への適用手順

1. **アプリを先に公開**：`yurutore_v51_4_private_account_security_clean.zip` を展開して Netlify Drop → Ctrl+F5。
   この時点ではDBは未変更なので、動作は v51.3 と同じです。
2. **適用前の確認**：Supabase → SQL Editor で `supabase/manual/v51_4_verify_readonly.sql` の **①〜⑤** を実行。
   - ① の4テーブルのポリシー名が v43 のまま（`profiles: read for authenticated` など）であることを確認します。
   - **見慣れない SELECT ポリシーがあった場合は、適用せずにご相談ください**（migration 側でも検知して中止します）。
3. **migration を実行**：`supabase/migrations/20260923_v51_4_private_account_rls.sql` の全文を SQL Editor に貼って Run。
   - 全体が1トランザクションです。想定外のポリシーが残っている場合は例外を出して**すべて元に戻します**（DBは変更されません）。
4. **適用後の確認**：同ファイルの **⑥〜⑧** を実行し、ポリシー名・VIEWの3列・権限（authenticated のみ）を確認。
5. **実機で確認**（§9-3 の手順）：公開アカウントと非公開アカウントの2つでひと通り操作。
6. 問題があれば `supabase/manual/v51_4_rollback.sql` で**今回の変更だけ**を元に戻せます（posts・Storage・v51.2の変更には触れません）。

---

## 7. 実施したテスト

### 7-1. PostgreSQL 16 での RLS 実証：**48/48 合格**
Supabase と同じ構造（`auth.uid()` / `storage.objects` / `storage.foldername()`）を再現し、
v43 → v50 →（本番と同じ posts ポリシー）→ v51.2 → **v51.4** の順に適用したうえで、
A（公開）・B（非公開）・C（公開）の3人で実際にSQLを実行しました。

| 区分 | 確認した内容（抜粋） |
|---|---|
| profiles | A→Bの行が0件／A→Bの詳細を列挙できない／A→Cの `intro` は従来どおり取得できる／B本人は自分の詳細を取得・編集・upsertできる／A→Bのプロフィール更新は0件 |
| VIEW | 列が `id,nickname,avatar_url` の3つだけ／A→Bの名前・アイコンは取得できる／anon からは読めない |
| comments | A→B投稿のコメントは0件（post_idを直接指定しても0件）／B本人は自分の投稿のコメントが見える／C（書いた本人）は自分のコメントを確認できる／削除済みの扱いは従来どおり |
| post_reactions | A→B投稿のリアクションは0件／A→「Bがどこに反応したか」を列挙できない／見える投稿のリアクションは従来どおり |
| follows | C→自分が当事者の行だけ／C→Bのフォロー先を列挙できない／A本人は自分に関わる行が見える（フォロー中タブ・フォロー判定） |
| 関数 | C→公開AのフォローAは正しい件数（1/2）／C→非公開Bは 0/0／B本人は自分の正しい件数／anon は実行不可／SECURITY DEFINER かつ search_path 固定 |
| blocks / reports | 他人のブロック設定は0件／本人のブロック一覧は取得可／通報の送信は可／通報内容は読めない |
| 再帰RLS | 4テーブル結合・`follows × profiles`・`public_profiles × posts` すべて正常終了（再帰エラーなし） |
| posts | A→Bの投稿は0件／C→Aの投稿は見える／B本人は自分の投稿が見える／**ポリシー名は v51.3 のまま4件** |

あわせて **v51.2 の Storage RLS テスト（41項目）を再実行し、41/41 合格**（写真の公開範囲は変わっていません）。
migration の**2回実行（冪等）**、**ロールバックSQLの実行**、**想定外ポリシーがある場合に中止してDBが変わらないこと**も確認しました。

### 7-2. 実ブラウザ（Chromium・v51.4のRLSを再現したモック）
- **非公開アカウント専用テスト：29/29 合格**
  - 公開投稿へのコメントは従来どおり表示され、**非公開ユーザーの名前も表示される**（VIEW経由であることも確認）
  - 非公開ユーザーのプロフィール画面：名前だけ表示され、**自己紹介・ひとこと・地域・投稿は出ない**
  - 公開ユーザーのプロフィール画面：自己紹介もフォロワー数も**今までどおり**（関数経由）
  - 画面からAPIを直接叩いた場合も、profiles（詳細）・非公開投稿のコメント/リアクション・他人のフォロー関係は**すべて0件**
  - 非公開ユーザー本人：自分の詳細取得・プロフィール保存・自分の投稿とコメント/リアクションの閲覧・公開投稿へのコメントがすべて可能
  - **migration 未適用の状態（アプリだけ先に公開）でも、名前もフォロワー数も正しく表示される**（自動フォールバック）
- **v51.2/v51.3 からの機能テスト（81項目）を新RLSのまま再実行：81/81 合格**
  （運動記録・写真投稿・ワンタップ投稿・タイムライン・コメント・リアクション・フォロー・ブロック・削除・
  非公開ユーザーの保護・日英切替・Googleログイン遷移・メールログイン・パンダルーム・CSP違反0件）

### 7-3. 本番で確認していただきたいこと（§14の一覧）
自動テストはモックDB上での確認です。本番では次をひと通りお願いします。

| 項目 | 見るポイント |
|---|---|
| Googleログイン / メールログイン / ログアウト | 今までどおり入れるか |
| プロフィール編集・公開/非公開切替 | 保存できるか（非公開アカウントでも保存できること） |
| 運動記録 / 投稿 / 写真つき投稿 / タイムライン | 今までどおりか |
| コメント | **公開投稿に非公開アカウントがコメントしたとき、名前とアイコンが出るか** |
| リアクション / フォロー | 数が今までどおり出るか（**他人のプロフィールのフォロワー数が0になっていないか**） |
| ブロック | ブロック解除画面に相手の名前が出るか |
| パンダルーム / 日本語・英語 / アカウント削除画面 | 変化がないこと |
| 非公開アカウントの相手 | 名前は出るが、自己紹介・地域・投稿は出ないこと |

---

## 8. 既知の制約

1. **公開アカウントの情報は今までどおり全員に見えます**（`intro` / `region` など）。これは「公開設定＝見せてよい」という既存仕様のままです。非公開に切り替えれば、その瞬間から他ユーザーは取得できなくなります。
2. **名前とアイコンは、非公開アカウントでも他ユーザーから取得できます**（`public_profiles`）。SNS表示に最低限必要なためで、ご指示 §5 の「取得可能でもよい最小情報」に沿っています。名前も隠したい場合は、コメント欄・ブロック一覧の表示方法から作り直す必要があるため、今回は実施していません。
3. **`public_profiles` は定義者権限のVIEW**です。Supabase のセキュリティ診断で *security definer view* として警告表示されますが、公開してよい3列だけを返す意図的な設計です（`anon` には権限を渡していません）。
4. **投稿の「見えない相手」へのコメント投稿は、DB上は止めていません**（`comments` の INSERT は従来どおり `user_id = auth.uid()` のみ）。アプリの画面からは見えない投稿にコメントできませんが、改造クライアントなら理論上可能です。ただしそのコメントは投稿者本人とその閲覧者にしか見えません。INSERT ポリシーの変更は既存の投稿フローに影響するため、今回は見送りました（ご希望があれば別バージョンで対応します）。
5. **フォロワー数には、非公開アカウントのフォローも含まれます**（件数のみ。誰かは分かりません）。表示される数字を今までと同じに保つためです。
6. **アカウント削除・Edge Function・Storage・投稿写真の公開範囲は変更していません**（v51.2 の設計のまま）。
7. `user_progress` / `app_events` テーブルのRLSは今回の対象外です（プロフィール公開範囲とは別の話のため）。必要であれば次回確認します。
8. 本番Supabase・実機スマホ・本物のGoogleログインでの確認はこの環境からできていません（§7-3）。
