# ゆるトレ倶楽部 v51.1 — 運営者表記・問い合わせ先の正式化

法務ページに残っていたプレースホルダー `[OPERATOR_NAME]` / `[SUPPORT_EMAIL]` を
正式な値に置き換え、メールアドレスを `mailto:` リンク化しました。
**それ以外の機能・UI・認証・Supabase・Google OAuth・SNS・パンダルーム・
リアクションパンジロー・i18n既存翻訳・画像素材・CSS には一切変更を加えていません。**

ベース: v51（v51_panjiro_reaction）

---

## 確定した値

| 項目 | 日本語版 | 英語版 |
|---|---|---|
| 運営者表記 | ゆるトレ倶楽部運営事務局 | Yurutore Club Management Office |
| 問い合わせ先 | support.yurutoreclub@gmail.com | support.yurutoreclub@gmail.com |

法人表記（株式会社HealthyWorld 等）は使用していません。

## 変更したファイル一覧（7ファイル）

| ファイル | 変更内容 |
|---|---|
| `legal/legal.js` | `YT_LEGAL_CONFIG` を `OPERATOR_NAME_JA` / `OPERATOR_NAME_EN` / `SUPPORT_EMAIL` に確定。`fillConfig()` を言語対応にし、言語切替のたびに差し込み直すよう `applyLang()` から呼ぶよう変更 |
| `terms/index.html` | 運営者5か所・メール2か所を正式値に。メールに `mailto:` を付与 |
| `privacy/index.html` | 運営者5か所・メール2か所を正式値に。メールに `mailto:` を付与 |
| `account-deletion/index.html` | 運営者5か所・メール4か所を正式値に。メールに `mailto:` を付与 |
| `contact/index.html` | 運営者3か所・メール2か所を正式値に。メールに `mailto:` を付与 |
| `community-guidelines/index.html` | フッターの運営者1か所を正式値に |
| `README_CURRENT.md` / `README_v50_legal_safety.md` | プレースホルダー表記の説明を「設定済み」に更新（全文検索0件にするため） |

削除したファイル: なし。
`index.html` / `app.js` / `style.css` / `assets/` / `supabase/` / `_headers` は**無変更**です。

## 実装のポイント

### 1. 運営者表記の日英出し分け
従来 `OPERATOR_NAME` は1つの値しか持てず、日英で表記を変えられませんでした。
`KEY_JA` / `KEY_EN` があればそちらを優先して使う方式に変更しています
（無い場合は従来どおり `KEY` を使うため、`EFFECTIVE_DATE_*` など既存の使い方は影響を受けません）。

```js
var val = YT_LEGAL_CONFIG[key + suffix];       // OPERATOR_NAME_JA / _EN
if (val === undefined) val = YT_LEGAL_CONFIG[key];
```

### 2. 言語切替への追従
`fillConfig()` は初回のみ実行していたため、日本語⇔Englishを切り替えても
運営者名が変わりませんでした。`applyLang()` の先頭で呼ぶようにして追従させています。

### 3. HTML側にも正式値を静的に記述
`<span data-legal="OPERATOR_NAME">` のフォールバック文字列も
プレースホルダーから正式値に置き換えました。これにより

- 全文検索で `[OPERATOR_NAME]` / `[SUPPORT_EMAIL]` が **0件**
- JSの読み込み前後でプレースホルダーが一瞬見える現象が起きない
- JSが無効な環境でも正しい運営者名・メールアドレス・`mailto:` が機能する

日本語ブロック（`data-lang-block="ja"`）には日本語表記、英語ブロックには英語表記、
言語ブロック外のフッターには日本語表記を静的に置き、表示言語に応じてJSが差し替えます。

### 4. mailto:
```html
<a data-legal="SUPPORT_EMAIL" href="mailto:support.yurutoreclub@gmail.com">support.yurutoreclub@gmail.com</a>
```
表示文字列はアドレスのまま。`legal.js` 側でも従来どおり `mailto:` を再設定します。

---

## 動作確認結果（Chromium 実ブラウザ / 幅390px）

| 確認項目 | 結果 |
|---|---|
| `[OPERATOR_NAME]` / `[SUPPORT_EMAIL]` の全文検索 | **0件** |
| 5ページ × 日英（計10通り）の運営者表記 | すべて期待どおり（日本語=運営事務局／英語=Management Office） |
| 表示中のメール表記（terms1／privacy1／account-deletion2／contact1 = 計5リンク×日英） | すべて `support.yurutoreclub@gmail.com` |
| `mailto:` の href | すべて `mailto:support.yurutoreclub@gmail.com` |
| 日本語⇔English 切替で運営者名が追従 | 追従する（運営事務局 → Management Office → 運営事務局） |
| JS無効時のフォールバック | 正式値が表示され、`mailto:` も機能する |
| コンソールエラー | なし（`favicon.ico` の404のみ。v50.2から存在する既存事象） |

## 申し送り

- コミュニティガイドラインには元々メールアドレスの直接表記がなく、本文・フッターから
  お問い合わせページへリンクする設計です（日英とも）。今回はその設計を変えていません。
  ガイドライン内にもメールを直接出したい場合はご指示ください。
- 法人設立後に表記を変える場合は、`legal/legal.js` の `YT_LEGAL_CONFIG` と、
  各HTMLの静的フォールバック文字列の2か所を更新してください。
