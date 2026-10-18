# ゆるトレ倶楽部 v51.4.1 — comments / post_reactions の INSERT 権限を閉じる

ベース：`yurutore_v51_4_private_account_security_clean`

v51.4 で作った非公開アカウントのプライバシー設計は**そのまま維持**し、
**コメントとリアクションの「書き込み（INSERT）」だけ**を安全に閉じました。

> **本番 Supabase には何も適用していません。**
> SQL はファイルとして用意しただけです。内容をご確認のうえ、手動で適用してください（§7）。

---

## 1. v51.4 から変更したファイル

| 区分 | ファイル | 内容 |
|---|---|---|
| 追加 | `supabase/migrations/20260924_v51_4_1_private_insert_rls.sql` | **最終 migration**。v51.4 の変更＋今回の INSERT 制限を**このファイル1本**で適用できます |
| 削除 | `supabase/migrations/20260923_v51_4_private_account_rls.sql` | 上のファイルに統合（二重に実行して迷わないように同梱していません） |
| 追加 | `supabase/manual/v51_4_1_rollback.sql` | ロールバック（**v51.3 の状態へ戻す**）。v51.4 分と今回分の両方を戻します |
| 追加 | `supabase/manual/v51_4_1_verify_readonly.sql` | 適用前／適用後の確認（読み取りのみ・INSERT の `with_check` も表示） |
| 削除 | `supabase/manual/v51_4_rollback.sql` / `v51_4_verify_readonly.sql` | 上の2ファイルに置き換え |
| 追加 | `README_v51_4_1_private_insert_security.md` | このファイル |
| 変更 | `README_v51_4_private_account_security.md` | 冒頭に「SQLは v51.4.1 に一本化」の案内を追記（設計の説明は変更なし） |

### アプリのコードは1行も変更していません
`index.html` と `app.js` は **v51.4 とバイト単位で同一**です（`diff` で確認済み）。
アプリは見えている投稿にしかコメント・リアクションを送らないため、今回の制限で壊れる導線はありません。
UI・デザイン・Google OAuth・メール認証・アカウント削除・写真投稿・Storage・CSP・`_headers`・
パンダルーム・運動記録・多言語・法務ページ・テーブル構造・既存データ・**posts の SELECT ポリシー**も変更していません。

---

## 2. 変更したポリシー（2件だけ）

| テーブル | 操作 | 変更前 | 変更後 |
|---|---|---|---|
| `comments` | INSERT | `with check (user_id = auth.uid())` | 本人確認 **＋ その投稿が自分から見えること** |
| `post_reactions` | INSERT | `with check (user_id = auth.uid())` | 本人確認 **＋ その投稿が自分から見えること** |

v51.4 で作った SELECT ポリシー（profiles / comments / post_reactions / follows）、
`public_profiles` VIEW、`yt_follow_counts()` 関数、blocks / reports、
そして posts のポリシーは**一切変更していません**。UPDATE / DELETE も全テーブル現状維持です。

### 2-1. comments INSERT の最終 WITH CHECK

```sql
create policy "comments: insert own" on public.comments
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.posts p where p.id = comments.post_id)
  );
```

### 2-2. post_reactions INSERT の最終 WITH CHECK

```sql
create policy "reactions: insert own" on public.post_reactions
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.posts p where p.id = post_reactions.post_id)
  );
```

---

## 3. 「閲覧可能な投稿」の判定方法

`exists (select 1 from public.posts p where p.id = ...)` は、**posts の SELECT ポリシーを通ります**。
つまり「自分がその投稿を SELECT できるかどうか」がそのまま条件になります。

- posts のポリシー（本番で確認済み・**今回も変更なし**）は
  「本人の投稿」**または**「削除されていない、かつ投稿者が公開アカウント」です。
- そのため判定基準を別の場所に書き写す必要がなく、**閲覧条件と書き込み条件が食い違うことが原理的に起きません**。
- 将来 posts のポリシーを変えた場合も、コメント／リアクションの書き込み条件が自動的に追随します。

| ケース | 結果 |
|---|---|
| 公開ユーザーの投稿 → 他のログインユーザー | コメント・リアクションできる（従来どおり） |
| **非公開ユーザーBの投稿 → 他ユーザーA**（post_id を直接指定） | **拒否**（`new row violates row-level security policy`） |
| **非公開ユーザーB本人 → 自分の投稿** | **できる**（本人には見えているため。§6 で実証） |
| 削除済み（`is_deleted = true`）の投稿 → 他ユーザー | 拒否 |
| 削除済みの投稿 → 投稿者本人 | できる（本人には見えるため。既存の閲覧仕様と整合） |
| 存在しない post_id | 拒否 |
| 他人の user_id を指定 | 拒否（従来どおり） |

---

## 4. 再帰RLSが発生しない理由

参照は一方向だけで、循環がありません。

```
comments (SELECT / INSERT)  ─→ posts ─→ profiles ─→ 参照なし（auth.uid() と is_public だけ）
post_reactions (SELECT / INSERT) ─→ posts ─┘
follows (SELECT) ─→ 参照なし（auth.uid() だけ）
public_profiles (VIEW) ─→ profiles のRLSを通らない（定義者権限）
```

- `posts` のポリシーは `profiles` しか参照せず、`profiles` のポリシーはどのテーブルも参照しません。したがって `comments → posts → profiles` で終わりです。
- INSERT の `with check` から参照するのも `posts` だけで、`posts` の側は `comments` / `post_reactions` を参照しません。
- `follows` のポリシーは `profiles` を参照しません（参照すると循環し得るため、v51.4 から意図的に避けています）。
- 実際に PostgreSQL 16 で `posts × profiles × comments × post_reactions` の4テーブル結合、
  `follows × profiles`、`public_profiles × posts` を実行し、`infinite recursion detected in policy` が出ないことを確認済みです。

---

## 5. SQL ファイル名

| 用途 | ファイル |
|---|---|
| 適用する migration（これ1本だけ実行） | `supabase/migrations/20260924_v51_4_1_private_insert_rls.sql` |
| ロールバック（v51.3 の状態へ戻す） | `supabase/manual/v51_4_1_rollback.sql` |
| 確認（読み取りのみ） | `supabase/manual/v51_4_1_verify_readonly.sql` |

migration は全体が `begin; … commit;` の1トランザクションです。最後に
**「想定外の SELECT / INSERT ポリシーが残っていないか」** を検査し、残っていれば例外を出して
**すべてロールバック**します（許可ポリシーは OR で合成されるため、古い緩いポリシーが1つ残ると対策が無効になるからです）。

---

## 6. テスト結果

### 6-1. PostgreSQL 16 での実証：**63/63 合格**
Supabase と同じ構造を再現し、v43 → v50 →（本番と同じ posts ポリシー）→ v51.2 → **v51.4.1** を適用して、
A（公開）・B（非公開）・C（公開）の3人で実際にSQLを実行しました。

**今回追加した INSERT 関連（必須テスト §7 に対応）**

| 内容 | 結果 |
|---|---|
| A → 非公開ユーザーBの投稿にコメント（post_id 直指定） | ✅ 拒否（row-level security） |
| A → 非公開ユーザーBの投稿にリアクション（post_id 直指定） | ✅ 拒否 |
| C → 非公開ユーザーBの投稿にコメント／リアクション | ✅ 拒否 |
| **B本人 → 自分の非公開投稿にコメント** | ✅ できる |
| **B本人 → 自分の非公開投稿にリアクション** | ✅ できる |
| C → 公開投稿にコメント／リアクション | ✅ できる（従来どおり） |
| 非公開ユーザーB → 公開投稿にコメント | ✅ できる（従来どおり） |
| 存在しない post_id へのコメント | ✅ 拒否 |
| 他人の user_id でのコメント | ✅ 拒否（従来どおり） |
| 削除済み投稿：他人は不可／投稿者本人は可 | ✅ |
| リアクションの取り消し（DELETE）は本人のみ | ✅ 従来どおり |

**v51.4 から引き継いだ確認（すべて再実行して合格）**
A→Bの profiles 行が0件／詳細カラムを列挙できない／B本人は自分の詳細を取得・編集できる／
VIEW は3列だけ・anon不可／A→B投稿のコメント・リアクションは0件／follows は当事者のみ／
フォロー数は公開ユーザーなら従来どおりの数・非公開は 0/0／blocks・reports は従来どおり／
再帰RLSなし／posts のポリシーは v51.3 のまま4件。

**回帰**：v51.2 の Storage RLS テスト **41/41 合格**（写真の公開範囲は変化なし）。
**運用系**：migration の2回実行（冪等）、ロールバックで v43（v51.3）の `with check (user_id = auth.uid())` に戻ること、
想定外の INSERT ポリシーがある場合に**中止してDBが変わらない**ことを確認済み。

### 6-2. 実ブラウザ（Chromium・v51.4.1 のRLSを再現したモック）
- **非公開アカウント専用テスト：36/36 合格**（v51.4 の29項目＋今回の7項目）
  - A が画面から API を直接叩いても、非公開投稿へのコメント／リアクションの INSERT は `42501` で拒否され、**DBに1件も残らない**
  - 同じ画面から公開投稿へのコメント／リアクションは**今までどおり成功**
  - **B本人は自分の非公開投稿にコメント・リアクションできる**
  - 非公開ユーザーの名前はコメント欄に出る／自己紹介・地域・投稿は出ない／公開ユーザーのフォロワー数は従来どおり
  - migration 未適用の状態（アプリだけ先に公開）でも正常動作
- **既存機能テスト（81項目）を再実行：81/81 合格**
  （運動記録・写真投稿・ワンタップ投稿・タイムライン・コメント・リアクション・フォロー・ブロック・削除・
  非公開ユーザーの保護・日英切替・Googleログイン遷移・メールログイン・パンダルーム・CSP違反0件）

### 6-3. 本番で確認していただきたいこと
| 項目 | 見るポイント |
|---|---|
| 公開投稿へのコメント・リアクション | 今までどおり送れるか（**ここが一番大事**） |
| 非公開アカウント本人 | 自分の投稿にコメント・リアクションできるか |
| タイムライン・フォロー・ブロック・写真投稿 | 変化がないこと |
| Googleログイン／メールログイン／アカウント削除画面 | 変化がないこと |

---

## 7. 適用手順

1. **アプリを先に公開**：`yurutore_v51_4_1_private_insert_security_clean.zip` を展開して Netlify Drop → Ctrl+F5。
   （アプリは v51.4 と同一内容です。まだ v51.4 を公開していない場合はこれが初回公開になります）
2. **適用前の確認**：SQL Editor で `supabase/manual/v51_4_1_verify_readonly.sql` の **①〜⑤**。
   4テーブルのポリシーが v43 のまま（`profiles: read for authenticated` / `comments: insert own` の `with_check` が `user_id = auth.uid()` だけ）であることを確認します。
   見慣れないポリシーがあれば、適用せずにご相談ください（migration 側でも検知して中止します）。
3. **migration を実行**：`supabase/migrations/20260924_v51_4_1_private_insert_rls.sql` の全文を貼って Run。
4. **適用後の確認**：同ファイルの **⑥〜⑧**。INSERT の `with_check` に `EXISTS (… FROM posts …)` が入っていることを確認。
5. **実機で確認**（§6-3）。
6. 問題があれば `supabase/manual/v51_4_1_rollback.sql` で v51.3 の状態へ戻せます。

---

## 8. 秘密情報について

`service_role` key などの秘密情報は、コード・SQL・README・ZIP のいずれにも**追加していません**。
既存の秘密情報（Edge Function がサーバー側の環境変数を読む行）にも変更を加えていません。
フロントに置かれているキーは従来どおり公開前提の `sb_publishable_…` のみです。

---

## 9. 既知の制約

1. **UPDATE 側は従来どおり**です。コメントの編集・ソフト削除は「本人のみ」で、投稿の閲覧可否は条件に入れていません（自分が書いたコメントを、相手が非公開に切り替えた後でも削除できるようにするため）。
2. 公開アカウントの投稿に非公開アカウントがコメントできる点は従来どおりです（その名前は `public_profiles` から表示されます）。
3. v51.4 以前に書き込まれたデータ（もしあれば）はそのまま残ります。今回の変更は**これから書き込むもの**に効きます。既存データの閲覧可否は SELECT ポリシー側で守られています（本人は自分の過去コメントを確認できます）。
4. 本番Supabase・実機スマホ・本物のGoogleログインでの確認はこの環境からできていません（§6-3）。
