assets/panda-room/v42/ — パンジロー生活立ち絵（透過WebP）
=========================================================

v42.1 で本番実装済み。8ポーズすべてが入っています。

  panda42_normal.webp       部屋のまんなかで普通に過ごす（立ち・正面）
  panda42_window.webp       窓の外を眺める（後ろ姿）
  panda42_eat.webp          テーブルでラーメン
  panda42_pizza.webp        ピザ（eat のレアバリエーション／25%）
  panda42_relax_floor.webp  ラグでゴロ寝
  panda42_workout.webp      ダンベルで筋トレ
  panda42_sofa.webp         ソファでくつろぐ
  panda42_beer.webp         夜限定レア（19〜23時・sofa/eat のときだけ12%）

【元素材との対応】
  01_window_source.png           → panda42_window.webp
  02_living_pose_sheet.png       → normal / eat / relax_floor / workout / sofa（5枚を個別に切り出し）
  03_pizza_source.png            → panda42_pizza.webp
  04_beer_rare_source.png        → panda42_beer.webp
  05_life_behavior_reference.png → 参考のみ。本番では未使用（ZIPにも含めていません）

【仕様】
  ・背景透過WebP（quality 88）。表示サイズの約1.6倍の解像度で書き出し（Retina用の余裕）
  ・絵の下辺＝接地面。表示は object-fit:contain / object-position:center bottom
  ・元PNG（1536×1024・1.3〜2.9MB）は本番ZIPに含めていません

【有効化】
  PANDA42_READY（index.html / app.js 内）に載っているキーだけが v42 の絵を使います。
  現在は8ポーズすべてが登録済みです。

    const PANDA42_READY=['normal','window','eat','pizza','relax_floor','workout','sofa','beer'];

  ここから外すと v42 のパスへ img を作らなくなり（404は出ません）、
  自動的に assets/panda-room/v30/ の従来の立ち絵へ戻ります。

【位置・タップ領域・隠す家具の調整】
  すべて PANDA42_ACTIONS（index.html / app.js 内）の数値だけで変えられます。
  JSXには座標を一切ベタ書きしていません。

    left / top / width / height             … 表示ボックス（部屋画像に対する%）
    tapLeft / tapTop / tapWidth / tapHeight … タップ領域（絵ごとに個別）
    zIndex                                  … 家具(z2)より前・暖色レイヤー(z5)より後ろ
    anim                                    … 動きのCSSクラス
    hide                                    … そのポーズのあいだ隠す家具

  ★セーフバンド（重要）
    スマホでは部屋（比1.5）がカードより横に広く、中央寄せで横スクロールします。
    実測で 320px 幅の端末が最初に見せるのは stage の 28.6%〜71.4% だけです。
    そのため全ポーズを left>=29% / right<=71% に収めています。
    位置を動かすときも、この範囲から出さないでください（出すと初期表示で切れます）。

【位置合わせのしかた】
  URLに付けて開くと、そのポーズだけを固定表示できます（本番UIには何も出ません）。
    ?action=normal / window / eat / relax_floor / workout / sofa
    ?variant=ramen / pizza / beer
    例) ?debug=1&action=eat&variant=pizza
        ?debug=1&action=sofa&variant=beer
