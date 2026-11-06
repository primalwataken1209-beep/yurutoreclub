# プライバシー説明とストア申告の整合案（下書き・内部資料）

2026-10-31。**公開ページ（`privacy/index.html`）は変更していない。** 下の文案を反映するには、公開ファイルの変更と
Netlify 公開の承認が必要。ストアの申告内容は Work の `privacy-declarations-draft.txt` と合わせて確定する。

## 1. 実装で確認した送信（現行の Web 版と、それを同梱するモバイル版で同じ）

| 送信先 | 内容 | 条件 | 根拠 |
|---|---|---|---|
| Supabase `user_progress` | 端末の状態の控え（運動記録・メモ・日時・進捗・ミッション・ポイントなど）。写真は中身を送らず、縦横サイズと「端末のみ」の目印だけ | ログイン中だけ（体験版は送らない）。保存のたびに上書き | `app.js` `saveSt` → `syncStateToSupabase`（`ytStripLocalPhotos`） |
| Supabase `app_events` | 利用イベント5種類（`app_open`・`panda_room_open`・`panda_tap`・`exercise_recorded`・`mission_completed`）と、DB 側で付く日時・ユーザー ID | ログイン中だけ | `app.js` `trackEvent` |
| Supabase の SNS テーブル・Storage | 投稿・コメント・リアクション・フォロー・通報・ブロック、選んだ写真 | 利用者が操作したとき | 既存の SNS 機能 |

したがって「運動記録はすべて端末内だけ」とは説明しない。端末内だけなのは**運動記録に添付した写真の中身**と、
**体験版（ログインなし）のデータ**。Work の確認で、staging には `user_progress` と `app_events` の両テーブルが実在する。

## 2. モバイル版で増える端末内の保存

- 記録の写し：アプリ専用領域のファイル（iOS `Library/NoCloud`、Android の files 領域）。OS のバックアップと機種変更の転送からは除外。
- ログイン情報：iOS の Keychain（この端末のみ）、Android の Keystore で暗号化。ログアウトで消去。
- いずれも端末の外へは送らない。アプリを削除すると消える（iOS の Keychain は、再インストール後の初回起動で消す）。

## 3. `privacy/index.html` への追記案

### 6. 運動記録・アプリ利用情報（末尾に追加）

日本語：
> ログインしている場合、運動記録・メモ・進捗などの情報の控えを、端末内の保存に加えて Supabase 上にも保存します（運動記録に添付した写真の中身は送信せず、写真があることと縦横のサイズだけを保存します）。アプリ利用イベントも、ログインしている場合にのみ送信します。体験版（ログインしていない状態）では、これらの情報はサーバーへ送信しません。

English:
> If you are signed in, a copy of your activity logs, notes and progress is also stored on Supabase in addition to your device (the contents of photos attached to activity logs are not sent; only the fact that a photo exists and its dimensions are stored). App usage events are also sent only while you are signed in. In trial mode (not signed in), none of this is sent to our servers.

### 9. 端末内に保存される情報（末尾に追加）

日本語：
> スマートフォンアプリ版では、アプリデータの写しを端末内のアプリ専用領域にも保存し、端末のバックアップや機種変更時の転送の対象外にしています。ログイン情報は、iOS ではキーチェーン、Android では Keystore を使って暗号化して保存し、ログアウトすると消去します。これらは端末の外へ送信されず、アプリを削除すると消去されます。

English:
> In the smartphone app, a copy of your app data is also kept in the app's private storage on your device and is excluded from device backups and device-to-device transfer. Your sign-in information is stored encrypted using the Keychain on iOS or the Keystore on Android, and is removed when you sign out. None of this leaves your device, and it is removed when you delete the app.

### 2. 取得する情報 → 画像（文言の調整）

- 現行「運動記録に添付した写真（現在の実装では、利用者の端末内にのみ保存されます）」は維持してよい（実装と一致）。

## 4. ストア申告への影響（候補）

- Apple：Fitness（運動記録）を「アプリの機能」「本人に紐づく」「追跡なし」として申告する。`PrivacyInfo.xcprivacy` の下書きと一致させる。
  利用状況（Product Interaction：`app_events`）の項目を追加するかを、Work が公式の分類で確認する。
- Google Play：データセーフティで、アクティビティ（運動記録）とアプリの操作（利用イベント）を「収集する」「送信時は暗号化」として扱う。
  体験版では送らないことは補足できるが、「収集しない」にはしない。
- 既存機能（`user_progress`・`app_events`）の削除や本番の変更は提案しない。
