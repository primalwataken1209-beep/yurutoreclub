# ゆるトレ倶楽部 v43 CLEAN

公開・確認しやすいように整理した版です。

## 最新の変更（v43）
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
- supabase/migrations/ : DBマイグレーション（v43のSNSテーブル）
- style.css : スタイル
- app.js : 同期用コード
- supabase_v28_events.sql : Supabase関連SQL（必要時のみ）

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
