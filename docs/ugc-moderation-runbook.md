# 通報・ブロックの運営手順（内部資料・公開しない）

このファイルは `docs/` にあり、公開allowlist（`scripts/build-public.cjs`）に含まれないため配信されない。
ストア審査で「通報への対応体制」を説明するときの元資料にする。

## 1. 仕組みの現状

| 機能 | 利用者の操作 | 保存先 | 誰が見られるか |
|---|---|---|---|
| 投稿の通報 | 投稿の「…」→「この投稿を通報」 | `reports`（target_type=`post`） | 運営のみ |
| コメントの通報 | コメントの「通報」 | `reports`（`comment`） | 運営のみ |
| ユーザーの通報 | プロフィール画面→「このユーザーを通報」 | `reports`（`user`） | 運営のみ |
| ブロック | プロフィール画面または投稿の「…」 | `blocks` | 本人のみ（相手には分からない） |

- 理由は `harassment / inappropriate / spam / personal_info / dangerous / other` の6種類。補足は500字まで。
- 同じ人が同じ対象を通報できるのは1回だけ（重複時は「すでに通報済み」と表示）。
- クライアントは `reports` を読めず、書き換えも削除もできない。運営は Supabase ダッシュボードから
  service role 権限で確認する。
- ユーザー通報には DB の差分 `supabase/manual/store_prep_user_reports.sql` が必要。
  適用前は DB が拒否し、アプリは「通報を送れなかった」と表示する（データは壊れない）。

## 2. 確認の頻度と期限（運営が決める値）

- 提案：毎日1回以上 `status = 'open'` を確認し、受け付けから24時間以内に一次対応する。
- 実際の値は運営者が決め、審査で説明する内容と一致させる。この資料の値は案。

## 3. 確認の手順（本番データを扱うため、操作ごとに本人が行う）

1. Supabase ダッシュボードで、接続先が本番 `eszheiabjwehcbrteqza` であることを確認する。
2. SQL Editor で、未対応の通報を古い順に見る。

   ```sql
   select id, created_at, target_type, target_id, reason, note
   from public.reports where status = 'open' order by created_at limit 50;
   ```

3. 対象の中身を確認する。
   - `post`：`select id, user_id, body, image_path, is_deleted from public.posts where id = '<target_id>';`
   - `comment`：`select id, post_id, user_id, body from public.comments where id = '<target_id>';`
   - `user`：`select id, nickname, intro, hitokoto from public.profiles where id = '<target_id>';`
4. コミュニティガイドラインと利用規約（第10条）に照らして判断し、通報の状態を更新する。

   ```sql
   update public.reports set status = 'reviewed' where id = '<report_id>';   -- 確認済み・対応不要
   update public.reports set status = 'actioned' where id = '<report_id>';   -- 対応した
   update public.reports set status = 'dismissed' where id = '<report_id>';  -- 誤通報・いたずら
   ```

## 4. 対応の選択肢

| 対応 | 方法 | 注意 |
|---|---|---|
| 投稿を非表示 | `update public.posts set is_deleted = true where id = '<id>';` | 写真は残る。写真も消す場合は Storage の `post-images/<user_id>/<file>` を削除する |
| コメントを削除 | `delete from public.comments where id = '<id>';` | 取り消せない |
| プロフィール文の修正依頼 | 問い合わせ窓口から本人へ連絡 | 運営が勝手に書き換えない |
| 利用停止 | Supabase Auth のユーザー停止（ban）機能 | **アプリにも手順にも未整備**。実施前に方法と影響を確認し、承認を得る |
| アカウント削除 | 本人の依頼があった場合だけ、`account-deletion` の手順に従う | 運営判断での削除は規約の範囲を確認してから |

- 危険な内容（殺害予告・自傷の示唆など）は、状況に応じて警察などの関係機関への相談を検討する。
- 対応の記録（日時、通報ID、判断、対応内容）を運営の台帳に残す。台帳に通報者の個人情報を書き写さない。

## 5. やってはいけないこと

- 通報者を相手に知らせない（ガイドラインで「通知されない」と約束している）。
- `reports` に SELECT ポリシーを追加しない（利用者全員が通報を読めてしまう）。
- 通報の内容や個人情報をチャット・Git・ログに貼らない。
- RLS を一時的に無効にしない。

## 6. 未整備（ストア申請前に決めること）

- 通報の通知（新しい通報が来たことを運営が知る手段）。現在は運営が見に行く方式。
- 利用停止の実装と手順。
- 投稿・コメントの通報で、存在しない ID を送る通報は DB で拒否していない
  （運営の確認時に対象が見つからなければ `dismissed` にする）。
