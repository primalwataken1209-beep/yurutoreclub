# 退会時の Apple 認可の取り消し：設計と隔離試験（内部資料）

2026-11-01 改訂（Work のレビュー 20c9a38 を反映）。**下書きのモジュールと隔離試験だけ。** Edge Function の変更・デプロイ、
Apple の鍵（.p8）や Services ID の作成、Supabase の設定、秘密情報の登録はしていない。
**実装方式は確定しない**：2章の「未確認事項」を staging で確認してから決める。

- 下書きモジュール：`supabase/drafts/apple-revoke/apple_revoke.mjs`（どの Edge Function からも import していない）
- 隔離試験：`tests/apple-revoke.test.cjs`（Apple の代わりをメモリ上で動かす。鍵はその試験の実行中だけ作る一時的なもので、Apple の鍵ではない）

## 1. 公式資料で確認したこと（2026-11-01）

| 出典 | 内容 | 設計への影響 |
|---|---|---|
| Apple「Token revocation」（Sign in with Apple REST API） | `POST https://appleid.apple.com/auth/revoke`。`client_id` は App ID または Services ID で、**認可したときの値と一致**が必要。トークンを無効にしたとき、**または元から無効だったとき**に 200（本文なし） | 200 だけでは本人の認可を失効させた証明にならない |
| RFC 7009 §2.2 | 無効なトークンの取り消し要求にも 200 を返す | 同上 |
| Apple「Token validation」 | `POST /auth/token`。認可コードは**1回限り・5分間有効**。コードの交換で `id_token`・`access_token`・`refresh_token`、refresh token の検証で `id_token`・`access_token` が返る。client secret は ES256（P-256）の JWT（header `alg`/`kid`、claims `iss`=Team ID・`iat`・`exp`・`aud`=`https://appleid.apple.com`・`sub`=client_id） | サーバーが Apple から直接 `id_token` を受け取れば、トークンと Apple アカウント（`sub`）を結び付けられる |
| Apple「Verifying a user」 | identity token は公開鍵での署名・`nonce`・`iss`=`https://appleid.apple.com`・`aud`=client_id・`exp` を検証する | 端末から渡される identity token はこの検証の後でだけ使う |
| Supabase「Login with Apple」 | Web（OAuth）は Services ID を使う。ネイティブの `signInWithIdToken` ではハッシュ化した nonce を Apple に渡し、生の nonce を Supabase に渡す（Flutter の例）。Supabase Auth は Apple の Server-to-Server 通知に非対応 | ネイティブとブラウザ方式では client_id が異なりうる |
| Supabase「Social Login」 | provider token と provider refresh token は OAuth サインインで返されることがあるが、**プロジェクトのデータベースには保存しない**。返らないこともある | Apple で refresh token が返るかは未確認。返らないなら refresh 方式は使えない |

## 2. 未確認事項（実装方式の決定前に staging で確認する）

1. Supabase の OAuth（ブラウザ方式）で Apple にサインインしたとき、セッションに `provider_refresh_token` が入るか。
2. ネイティブの Sign in with Apple（端末の認可画面）を使う場合、client_id は Bundle ID（`club.yurutore.app`）になる。
   Services ID でブラウザ方式のログインをした利用者の認可を、Bundle ID で得たトークンの取り消しで失効させられるか
   （同じ primary App ID のグループに入っていれば同じ認可として扱われるはず、という想定。未確認）。
3. 取り消し後の refresh 検証が `invalid_grant` になるまでの時間（直後に確認して失敗しないか）。
4. Apple の refresh 検証の回数制限（1日1回程度を超えると制限される場合がある、と公式資料にある）。退会では最大2回使う。

1 が「返る」なら方式 R、「返らない」なら方式 N（ネイティブの Sign in with Apple のプラグイン追加が必要＝依存の追加も別判断）を採る。

## 3. 結び付けと検証の流れ（両方式で共通の部分）

退会の要求は `Authorization: Bearer <Supabase JWT>` で本人を特定する（既存）。Apple を使った利用者
（`identities` に `provider: 'apple'` がある）だけ、次をすべて満たしたときに削除へ進む。どれかが満たされなければ**何も削除しない**。

1. **Supabase の本人の一致**：退会する JWT の利用者と、再認証で得た利用者が同じ（方式 R：再認証後のセッションの user ID）。
   再認証が新しいこと（JWT の認証時刻が 10 分以内）。
2. **Apple アカウントの一致**：Supabase に記録された Apple の `sub`（`provider_id` と `identity_data.sub`。食い違えば拒否）と、
   **サーバーが Apple から受け取った `id_token` の `sub`** が一致する。`id_token` は Apple の公開鍵（JWKS）で署名を確認し、
   `iss`・`aud`（= client_id）・`exp`・`iat`（新しいこと）を検証する。
3. **トークンの結び付け**：
   - 方式 N：端末の identity token を先に検証（署名・`iss`・`aud`・`exp`・`iat`・`nonce`=生の nonce の SHA-256・`sub`）。
     その後でサーバーが認可コードを `/auth/token`（`authorization_code`）で交換し、返った `id_token` も2の検証をする。
     コードは1回限りなので、使い回されたコードは Apple が拒否する。
   - 方式 R：サーバーが refresh token を `/auth/token`（`refresh_token`）で検証し、返った `id_token` で2の検証をする。
     Apple が id_token を返すのは、この client に対して発行した有効な refresh token だけなので、任意の文字列や他人のトークンは通らない。
4. **取り消し**：`/auth/revoke`（`token_type_hint=refresh_token`）。200 以外は失敗。
5. **失効の確認**：同じ refresh token で `/auth/token`（`refresh_token`）をもう一度呼び、`400 invalid_grant` になることを確認する。
   200 が返ったら「取り消しを確認できない」として止める。
6. ここまで成功してから、既存の削除（Storage → テーブル → Auth）を行う。
7. Apple への各呼び出しにはタイムアウトを付け、タイムアウトや通信失敗は削除しない。トークン・コード・client secret・鍵は、
   戻り値・ログ・例外のどこにも出さない。結果は理由コードだけを返す。

client secret は Edge の secret（`APPLE_PRIVATE_KEY`・`APPLE_KEY_ID`、client_id）から毎回 5 分有効で作る。Team ID は `9S43D53PCM`。

## 4. 下書きモジュールの関数

| 関数 | 役割 |
|---|---|
| `createClientSecret` | ES256 の client secret（有効 5 分） |
| `verifyIdentityToken` | Apple の JWKS（RS256 / ES256）での署名、`iss`・`aud`・`exp`・`iat`・`nonce`・`sub` の検証 |
| `appleSubOf` | Supabase の利用者から Apple の `sub` を取り出す（記録が食い違えば拒否、Apple を使っていなければ null） |
| `revokeAppleAuthorization` | 3章の 1〜5。`{ok:true, revoked:true}` / `{ok:true, skipped:'no_apple_identity'}` / `{ok:false, code}` |
| `deleteAccountWithApple` | 取り消しが証明されたとき（または Apple 未使用のとき）だけ削除処理を呼ぶ |

理由コード：`apple_reauth_required`・`reauth_too_old`・`reauth_user_mismatch`・`apple_config_missing`・`apple_proof_invalid`・
`apple_identity_mismatch`・`apple_code_rejected`・`apple_refresh_rejected`・`apple_revoke_failed`・`apple_revoke_unconfirmed`・`apple_timeout`。

## 5. 隔離試験（`tests/apple-revoke.test.cjs`、14件）

- client secret の header・claims と短い有効期限、試験用の公開鍵での署名の確認
- 方式 N の成功：コードの交換 → 取り消し → 失効の確認 → 削除、の順で、削除は1回だけ
- 方式 R の成功：Apple が返す id_token で結び付けて取り消し、失効を確認してから削除
- Apple を使っていない利用者：Apple への呼び出しなしで削除
- 削除しないこと：再認証なし、古い再認証、別の Supabase 利用者で再認証、別の Apple アカウントで再認証、
  任意の refresh token、他人の refresh token、使い回した認可コード、nonce・aud・iss・exp・iat・署名の不正、
  JWT でない文字列、取り消しが 200 でも失効していない場合、各段階のタイムアウト、サーバー設定の欠け、Apple の記録の食い違い
- 戻り値とログにトークン・コード・nonce が出ないこと、モジュールが console・localStorage・環境変数を使わないこと
- 変異試験：失効の確認・`sub` の一致・nonce・再認証した利用者の一致・署名の各検証を外すと、それぞれ試験が失敗する

## 6. 承認が必要な作業（順番）

1. staging で2章の未確認事項を確かめる（Apple の Sign in with Apple の有効化、Services ID・鍵の作成、Supabase の Apple provider 設定を含む。本人と Work）
2. 方式の決定（方式 N ならネイティブのプラグイン追加の判断も）
3. Edge Function への組み込みとアプリの再認証画面（staging）、テスト用 Apple ID での実通信確認（Work）
4. 本番への反映（別承認）
