# ゆるトレ倶楽部 v51 — リアクション版パンジロー刷新

運動記録の直後に出る「大きなパンジローのリアクション」の**画像だけ**を、
承認済みの**淡いベージュTシャツ版パンジロー（6ポーズ）**に差し替えました。
リアクションの抽選ロジック・セリフ・i18n・表示時間・モーダル・CSSアニメーション・
運動記録の保存処理は変更していません。

---

## 1. 変更したファイル

| ファイル | 内容 |
|---|---|
| `app.js` | v51画像の定義と、既存リアクション → 画像の対応表を追加。`PraiseScreen` の参照先をv38→v51に変更 |
| `index.html` | 上記と同一の変更（本番はインライン版が正のため、`app.js` と完全に同期済み） |

変更箇所は4か所のみ。`style.css` / 認証 / パンダルーム / SNS / ミッション / ショップ /
i18n辞書 / 利用規約・プライバシー・ガイドライン / `_headers` / Netlify設定は**無変更**です。

## 2. 新規追加した画像（`assets/panda-room/v51/`）

```
pj51_normal.webp    通常の立ち姿（基本・優しい褒め）
pj51_happy.webp     両手を上げて大喜び
pj51_guts.webp      ガッツポーズ（応援・えらすぎ）
pj51_stretch.webp   のび／ストレッチ
pj51_sleepy.webp    クッションでゴロン（夜・深夜・まったり）
pj51_ramen.webp     ラーメン（ごほうび・飯テロ）
README.txt          素材の説明
```

- 背景透過WebP、合計約 135KB
- キャラクター以外の見出し・説明文・背景文字は含まない
- 言語依存の文字なし（TシャツのPANJIROロゴのみ）
- 下そろえ・共通余白5%で、6枚の表示サイズがそろうよう調整

**旧素材 `assets/panda-room/v38/pj38_*.webp` は削除せず残しています。**
切り戻す場合は `PraiseScreen` の `PJ51_DIR` / `PJ51` を `PJ38_DIR` / `PJ38` に戻すだけです。

## 3. 各リアクションと使用画像の対応

| 画像 | 使用するリアクション |
|---|---|
| NORMAL | zoom / act_walk / act_home / t_noon / r_news / u_speechless |
| HAPPY | jump / dash / banzai / act_run / t_morning / cb_dash / cb_hug / r_passby / r_extra / u_crown / u_parade / m7 / m10 / m30 / m50 / m100 |
| GUTS | clap / guts / act_gym / act_other / cb_tears / m3 |
| STRETCH | act_stretch |
| SLEEPY | roll / t_night / t_deep / r_wake |
| RAMEN | r_ramen |

`PJ51_BY_ID` に無いリアクションが将来増えても崩れないよう、
しぐさ（anim）→ 画像の保険マッピング `PJ51_BY_ANIM` を用意しています。

## 4. 既存コードで変更した箇所（4か所）

1. `PJ_RARE` に「ごほうび枠」`r_ramen` を1件追加（RAMEN画像の出しどころを作るため）
2. `PJ38_DIR` / `PJ38` の直後に `PJ51_DIR` / `PJ51` / `PJ51_BY_ID` / `PJ51_BY_ANIM` / `pj51Pose()` を追加
3. `PraiseScreen`: `const poseSrc=PJ38[rx.pose]||PJ38.happy;` → `const poseSrc=PJ51[pj51Pose(rx)]||PJ51.normal;`
4. `PraiseScreen`: `<img src={PJ38_DIR+...}>` → `<img src={PJ51_DIR+...}>`

既存リアクションのid・セリフ・出現率・props・紙吹雪・表示時間は無変更です。
画像が読めない場合は normal → 絵文字🐼 の順にフォールバックする挙動もそのままです。

## 5. CSSアニメーション

既存の jump / bounce / zoom / sway 等はすべて維持し、**変更していません**。
画像のポーズと不自然になる組み合わせが無いことを確認済みです
（SLEEPYはsway・wake・rollのみ、RAMENは揺れの小さいtinyのみ。回転・点滅・強い揺れは追加なし）。

## 6. 動作確認

- Welcome → オンボーディング3枚 → 登録画面 の遷移：正常
- 運動記録後リアクション：全34リアクションで正しい画像が選ばれることを確認（6画像すべて使用）
- 画面幅 320 / 360 / 375 / 412 px：はみ出し・見切れ・テキスト重なりなし
- 日本語／English 切替：正常。英語モードのリアクション画面に日本語は出ません
- コンソールエラー：なし（favicon.ico の404はv50.2から存在する既存事象）
