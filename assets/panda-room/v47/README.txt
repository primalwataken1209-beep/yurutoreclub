assets/panda-room/v47/ — パンジロー 正式デザイン(15ポーズ)
=========================================================

支給された panjiro_assets_01-15_FINAL_MASTER の15枚が正式アセットです。
描き直し・トリミング・拡大縮小は一切していません。
Web配信用に PNG → WebP(quality 92) へコンテナだけ変換してあります
(画素の寸法・切り抜き位置は元PNGと完全に同じ。19MB → 2.6MB)。

  01_panjiro_room_normal    正面・通常
  02_panjiro_room_side      横向き
  03_panjiro_room_back      後ろ姿
  04_panjiro_room_sit       座る
  05_panjiro_room_mug       マグカップ
  06_panjiro_room_phone     スマホを見る
  07_panjiro_room_goron     ゴロン
  08_panjiro_room_drowsy    ウトウト
  09_panjiro_room_sleep     寝る
  10_panjiro_room_stretch   座った状態で伸びる
  11_panjiro_room_window    座った後ろ姿で窓を見る
  12_panjiro_training       ダンベルでトレーニング
  13_panjiro_room_question  「ん？」(タップ反応)
  14_panjiro_room_cheer     応援(運動記録連動)
  15_panjiro_room_ramen     ラーメンを食べる

【表示のしくみ】
  座標・タップ領域は index.html / app.js の PJ47_POSES だけが持ちます。
  JSXには数値をベタ書きしていません。

  ・全ポーズとも「絵の下端＝床(ステージの84.5%)」に来るよう top/height を算出済み。
    画像ごとに縦横比が違っても、表示ボックスの縦横比を画像と同じにしてあるので
    object-fit:contain で歪まず、ポーズが変わっても足元が上下に跳ねません。
  ・セーフバンド: スマホは部屋画像の 28.6%〜71.4% しか初期表示されません。
    全ポーズの実体をこの範囲に収めてあります。位置を変えるときも必ず守ってください。

【調整・確認のしかた】
  URLに ?pose=goron のように付けると、そのポーズだけを固定表示できます
  (本番UIには何も出ません)。?hour=1 と併用すると時間帯の見え方も確認できます。

【元に戻したいとき】
  index.html / app.js の PJ47_ENABLED=false にすると、v42の挙動へ戻ります
  (v42のコードは消していません。ただしv42の画像素材はこのZIPには含めていません)。
