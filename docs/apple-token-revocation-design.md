# 退会時の Apple トークン取り消し：最小設計と隔離試験の案（内部資料）

2026-10-31。**設計案のみ。** Edge Function の変更・デプロイ、Apple の鍵（.p8）や Services ID の作成、Supabase の設定、
秘密情報の登録は行っていない。実装と staging での確認は、それぞれ別に承認を得てから行う。

## 1. 目的と前提

- Sign in with Apple を使った利用者がアプリ内で退会したら、Apple から発行されたトークンを Apple の
  `POST https://appleid.apple.com/auth/revoke` で取り消す（App Store の要件）。
- 現在の退会は `supabase/functions/delete-account`（JWT で本人を確認 → Storage → 各テーブル → `auth.admin.deleteUser`）。
  Apple のトークンは扱っていない。
- アプリの Apple ログインは Supabase の OAuth（PKCE、ブラウザ方式）。Apple のトークンは Supabase のセッションに
  `provider_token` / `provider_refresh_token` として**ログインした直後だけ**含まれ、サーバーには保存されない前提
  （staging で実際に返るかは未確認。最初の確認項目にする）。

## 2. 方式の比較

| 方式 | 内容 | 判断 |
|---|---|---|
| A. 退会時に Apple で再認証する | 退会ボタンの後に Apple でもう一度サインインし、そのとき得たトークンを delete-account に渡して取り消す | **採用案**。トークンを保存しない。再認証は本人確認にもなる |
| B. ログイン時に refresh token を保存する | サーバーの専用テーブルに暗号化して保存し、退会時に使う | 見送り。秘密の保存・暗号鍵の管理・漏えい時の影響が増える |
| C. 取り消さない | — | 不可（要件を満たさない） |

## 3. 方式 A の流れ

1. 退会の確認画面で、本人の Supabase ユーザーに Apple の identity がある（`identities` に `provider: 'apple'`）ときだけ、
   「Apple で本人確認してから退会」を表示する。Apple を使っていない利用者の退会は今までどおり。
2. アプリは既存の `oauthSignIn('apple')`（PKCE・戻り先の完全一致）で再認証し、戻ってきたセッションの
   `provider_refresh_token`（なければ `provider_token`）をメモリ上だけで持つ。保存しない。
3. アプリは `delete-account` を `Authorization: Bearer <Supabase JWT>` と本文 `{ "apple_token": "...", "apple_token_type": "refresh_token" }` で呼ぶ。
4. Edge Function（追加部分）：
   - JWT から本人を特定し（既存）、その本人に Apple の identity があるかを `auth.admin.getUserById` で確認する。
   - ある場合：`apple_token` がなければ 400 `apple_reauth_required` を返し、**何も削除しない**。
   - client secret を作る：ES256 の JWT。header `{alg:"ES256", kid:APPLE_KEY_ID}`、
     claims `{iss:APPLE_TEAM_ID, iat, exp(最長でも数分), aud:"https://appleid.apple.com", sub:APPLE_SERVICES_ID}`。
     署名鍵 `APPLE_PRIVATE_KEY`（.p8）・`APPLE_KEY_ID`・`APPLE_SERVICES_ID` は Edge の secret から読む（Team ID は `9S43D53PCM`）。
   - `POST /auth/revoke`（`application/x-www-form-urlencoded`、`client_id`・`client_secret`・`token`・`token_type_hint`）を
     タイムアウト付きで呼ぶ。200 なら続行、それ以外・通信失敗なら 502 `apple_revoke_failed` を返し、**何も削除しない**（再試行できる）。
   - 取り消しに成功してから、既存の削除手順（Storage → テーブル → Auth）を行う。
   - トークン・client secret・鍵はログやレスポンスに出さない（`console.*` には手順名と結果だけ）。
5. アプリは `apple_reauth_required` / `apple_revoke_failed` を、日英の文言で「もう一度お試しください」と表示する。成功したら今までどおり。

## 4. 隔離試験の案（ネットワークなし・本物の鍵なし）

鍵は試験の中で WebCrypto により一時的に作る P-256 の鍵だけを使う（Apple の鍵ではなく、保存もしない）。

| 対象 | 試験 |
|---|---|
| client secret の作成 | header / claims（iss=Team ID、sub=Services ID、aud、exp が短いこと）、試験用の公開鍵で ES256 署名を検証できること |
| revoke の呼び出し | 差し替えた fetch で URL・メソッド・Content-Type・フォームの各値を確認。200 / 400 / 500 / タイムアウトの扱い |
| delete-account | Apple の identity がない利用者：今までどおり削除し、revoke は呼ばない |
|  | Apple の利用者でトークンなし：400、削除系の呼び出しが0回 |
|  | revoke 失敗：502、削除系の呼び出しが0回 |
|  | revoke 成功：revoke が削除より先に1回だけ呼ばれ、その後に既存の削除手順 |
|  | ログとレスポンスにトークン・secret が含まれないこと |
| アプリ | Apple の利用者だけに再認証の画面が出る。取得したトークンを localStorage・端末ファイル・セキュアストレージに書かないこと |

試験は既存の `tests/account-delete.test.cjs` と同じく、handler に admin クライアントと fetch を注入する形で書く。

## 5. 承認が必要な作業（順番）

1. Apple：App ID で Sign in with Apple を有効化、Services ID と戻り先の登録、鍵（.p8）の作成（本人）
2. Supabase staging：Apple provider の設定、Edge の secret 登録（`APPLE_KEY_ID` など。値はチャット・Git に出さない）
3. Edge Function の変更（staging）と、テスト用 Apple ID での実通信確認（Work）。provider_refresh_token が返るかを最初に確認する
4. 本番への反映（別承認）
