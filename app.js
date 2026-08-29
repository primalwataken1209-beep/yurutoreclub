/* app.js — index.html のインラインと同一（v43 実ユーザーSNS基盤）本番は inline 版。 */
const {useState,useEffect,useRef,createContext,useContext}=React;

/* ═══════════════ Supabase設定 ═══════════════ */
// ここにはSupabaseの「Anon(Public) Key」だけを書いてください。
// Service Role Key（秘密鍵）は絶対にフロントエンドのコードに書かないでください。
const SUPABASE_URL='https://eszheiabjwehcbrteqza.supabase.co';
const SUPABASE_ANON_KEY='sb_publishable_XINCdNEKIrUVQJY8tZlOPw_wp8eJ7CW';
const supabaseClient = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

/* ═══════════════ 認証: 入力チェック（新規追加） ═══════════════ */
// 【修正内容】メールアドレス・パスワードのチェックをこの2つの関数に集約しました。
// 登録画面・ログイン画面のどちらからも、この関数を呼ぶだけでチェックできます。

// メールアドレスの形式が正しいかどうかを判定する簡易チェック
function isValidEmail(email){
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email||'').trim());
}

// メールアドレスとパスワードの入力内容をチェックし、
// 問題があればエラーメッセージの文字列を返す。問題なければ null を返す。
function validateAuthInput(email,pass){
  const e=String(email||'').trim();
  const p=String(pass||'');
  if(!e) return 'メールアドレスを入力してください';
  if(!isValidEmail(e)) return '正しいメールアドレスを入力してください';
  if(!p) return 'パスワードを入力してください';
  if(p.length<6) return 'パスワードは6文字以上で入力してください';
  return null;
}


/* ═══════════════ 定数 ═══════════════ */
const ACTS=[
  {id:'walk',   label:'ウォーキング',icon:'🚶'},
  {id:'run',    label:'ランニング',  icon:'🏃'},
  {id:'stretch',label:'ストレッチ',  icon:'🧘'},
  {id:'gym',    label:'ジム',       icon:'🏋️'},
  {id:'home',   label:'自宅トレ',    icon:'💪'},
  {id:'other',  label:'その他',      icon:'✨'},
];
const FREQS=[{id:'1-2',label:'週1〜2回'},{id:'3-4',label:'週3〜4回'},{id:'daily',label:'毎日少しずつ'}];

const SUPPORT_CATS=[
  {id:'walk',label:'ウォーキング',icon:'🚶'},
  {id:'run',label:'ランニング',icon:'🏃'},
  {id:'gym',label:'ジム',icon:'🏋️'},
  {id:'home',label:'自宅トレ',icon:'💪'},
  {id:'stretch',label:'ストレッチ',icon:'🧘'},
  {id:'other',label:'その他',icon:'✨'},
];



const MOODS=[
  {id:'genki',emoji:'😊',panda:'happy',label:'元気！',tone:'やる気まんまん',message:'やる気まんまん！今日もいけるよ〜🐼✨',goal:'いつもより＋3分だけ動いてみる',cat:'walk'},
  {id:'tired',emoji:'😵',panda:'tired',label:'疲れた…',tone:'ゆるっといこ',message:'無理しなくて大丈夫〜。開いただけで、もうえらいよ〜',goal:'肩回し30秒か深呼吸だけ',cat:'stretch'},
  {id:'sleepy',emoji:'😴',panda:'sleepy',label:'眠い…',tone:'軽めでOK',message:'ねむねむモード…。今日は軽めでOK〜。寝る準備もゆるトレだよ💤',goal:'寝る前ストレッチ1分',cat:'stretch'},
  {id:'ate',emoji:'🍜',panda:'food',label:'食べすぎた！',tone:'チャラでOK',message:'おいしいものは正義〜。3分歩けば今日は大勝利🍜',goal:'食後に3分だけ歩く',cat:'walk'},
];

function moodInfo(id){return MOODS.find(m=>m.id===id)||MOODS[0];}


function timeBand(){
  const h=new Date().getHours();
  if(h>=5&&h<10)return 'morning';
  if(h>=10&&h<17)return 'day';
  if(h>=17&&h<22)return 'night';
  return 'late';
}
function pandaEmotion({moodId,streak=0,visits=1,todayDone=false,isComeback=false}){
  const band=timeBand();
  if(todayDone)return{variant:'done',title:'ごきげんパンダ',tag:'記録完了！',line:'気持ちよかった〜！今日の記録ありがとう。ゆるパンダ、かなり喜んでるよ〜',tip:'今日はもう合格。追加するならストレッチ1分だけでOK',bg:'linear-gradient(135deg,#fff7d8,#e9fff5)',border:'#f0d98c'};
  if(isComeback)return{variant:'comeback',title:'おかえりパンダ',tag:'待ってたよ〜',line:'少し空いても大丈夫。また来てくれたのが一番うれしいよ。',tip:'今日は30秒だけで十分。戻れた自分を褒めよう',bg:'linear-gradient(135deg,#fff1ed,#fff8e8)',border:'#ffc9b5'};
  if(moodId==='sleepy'||band==='late')return{variant:'sleepy',title:'ねむねむパンダ',tag:'回復優先',line:'ねむねむモード…。今日は軽めでOK〜。寝る準備も立派なゆるトレだよ。',tip:'おすすめは寝る前ストレッチ1分だけ',bg:'linear-gradient(135deg,#eef4ff,#fff7fb)',border:'#cbd8ff'};
  if(moodId==='tired')return{variant:'tired',title:'よりそいパンダ',tag:'ゆるっといこ',line:'疲れてるのに開いたの、ほんと偉い。無理しなくて大丈夫〜',tip:'肩回し・深呼吸・水を飲むだけでも勝ち',bg:'linear-gradient(135deg,#f2fff9,#fffdf4)',border:'#cfeee0'};
  if(moodId==='ate')return{variant:'food',title:'もぐもぐパンダ',tag:'罪悪感ゼロ',line:'おいしいものは正義〜。動いたらチャラだよ〜！',tip:'食後に3分だけ歩くか、記録だけ残そう',bg:'linear-gradient(135deg,#fff7e8,#fff1f1)',border:'#ffd79d'};
  if(streak>=7)return{variant:'crown',title:'常連パンダ',tag:'かなり継続中',line:'このペース、もう習慣の入口にいるよ。無理せず続けるのが強い！',tip:'今日は流れを切らない程度に軽くでOK',bg:'linear-gradient(135deg,#eafff6,#f2fff0)',border:'#b7ead2'};
  if(streak>=3)return{variant:'happy',title:'応援パンダ',tag:'いい流れ',line:'いい感じに続いてるね。今日はちょっとだけ動けたら最高！',tip:'いつもより＋1分だけやってみよう',bg:'linear-gradient(135deg,#f4fff9,#fffdf2)',border:'#d7efd5'};
  if(band==='morning')return{variant:'morning',title:'朝活パンダ',tag:'おはよ〜',line:'朝に開けたのすごい！今日もいい日になるよ〜',tip:'外の空気を吸うだけでも合格',bg:'linear-gradient(135deg,#fff8d8,#eafff8)',border:'#f1dc8c'};
  if(band==='night')return{variant:'night',title:'夜の見守りパンダ',tag:'おつかれさま',line:'今日も一日おつかれさま。夜は軽めに整えるだけで十分だよ。',tip:'寝る前に首・肩をゆっくり回そう',bg:'linear-gradient(135deg,#eef4ff,#f6fff9)',border:'#ccd8ff'};
  return{variant:'comeback',title:'おかえりパンダ',tag:`来店${visits||1}日目`,line:'今日も来てくれてうれしい！まずは気分を選ぶだけで一歩前進だよ。',tip:'30秒ストレッチか、記録だけでもOK',bg:'linear-gradient(135deg,#ffffff,#f4fff9)',border:'#dceee8'};
}
function PandaMascot({variant='happy',size='lg'}){
  return (
    <div className={`panda-mascot panda-${variant} panda-${size}`} aria-hidden="true">
      <div className="panda-ear left"></div><div className="panda-ear right"></div>
      <div className="panda-head">
        <div className="panda-eye-patch left"><span></span></div><div className="panda-eye-patch right"><span></span></div>
        <div className="panda-blush left"></div><div className="panda-blush right"></div>
        <div className="panda-nose"></div><div className="panda-mouth"></div>
      </div>
      <div className="panda-body"><div className="panda-belly"></div></div>
      <div className="panda-paw left"></div><div className="panda-paw right"></div>
      <div className="panda-prop"></div><div className="panda-badge-mark"></div>
    </div>
  );
}

function MoodPandaFace({variant='happy'}){
  return (
    <div className={`mood-panda-face mood-face-${variant}`}>
      <PandaMascot variant={variant} size="sm"/>
    </div>
  );
}

function PandaEmotionCard({emotion}){
  return(
    <div className="panda-emotion-card fade-up" style={{background:emotion.bg,borderColor:emotion.border}}>
      <div className="panda-emotion-face-wrap">
        <PandaMascot key={emotion.variant} variant={emotion.variant} size="lg"/>
        <div className="panda-emotion-sparkle">✨</div>
      </div>
      <div style={{flex:1,minWidth:0}}>
        <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:4,flexWrap:'wrap'}}>
          <div className="panda-emotion-title">{emotion.title}</div>
          <span className="panda-emotion-tag">{emotion.tag}</span>
        </div>
        <div className="panda-emotion-line">{emotion.line}</div>
        <div className="panda-emotion-tip">次の一歩：{emotion.tip}</div>
      </div>
    </div>
  );
}

const DAILY_SUPPORT={
  walk:[
    {goal:'外の空気を吸えたらOK',word:'ちょっと歩いただけでも、ちゃんと前進してるよ🐼'},
    {goal:'5分だけでも外に出る',word:'玄関出た時点で今日は勝ち！'},
    {goal:'景色を1つ見つける',word:'空見ただけでもリフレッシュ☁️'},
    {goal:'無理せず歩く',word:'ゆっくりでも続けるのが最強！'},
    {goal:'コンビニまで歩く',word:'その一歩、ちゃんと意味あるよ🐼'},
    {goal:'イヤホンつけて気分転換',word:'好きな音楽と歩く日も大事🎧'},
    {goal:'少し体を動かす',word:'0より1がえらい！'},
    {goal:'疲れる前にやめる',word:'今日は“続けるための日”✨'},
    {goal:'太陽を浴びる',word:'日光浴びるだけでも体喜んでる☀️'},
    {goal:'のんびり散歩する',word:'競争しない運動も最高だよ🐼'},
  ],
  run:[
    {goal:'ゆっくり走ってみる',word:'速さより、今日走ったことが大事🏃‍♂️'},
    {goal:'5分だけ走る',word:'短くてもちゃんと積み上がってる！'},
    {goal:'無理せずペース維持',word:'今日は“気持ちよく”が正解🐼'},
    {goal:'外の風を感じる',word:'走ると頭もスッキリするね🌿'},
    {goal:'疲れる前に終わる',word:'続けられる走り方が最強！'},
    {goal:'音楽と一緒に走る',word:'お気に入りBGMで気分アップ🎧'},
    {goal:'フォームを意識する',word:'今日は丁寧ランニングDAY✨'},
    {goal:'景色を楽しむ',word:'タイムより景色派でもいい🐼'},
    {goal:'少し汗をかく',word:'今日もちゃんと動けてえらい！'},
    {goal:'明日も走れる程度にする',word:'燃え尽きないのが“ゆるトレ流”🏃'},
  ],
  gym:[
    {goal:'行けたら100点',word:'ジム来ただけで強い！'},
    {goal:'1種目だけやる',word:'今日は軽めでも全然OK👌'},
    {goal:'マシン1個触る',word:'継続してる自分がすごい！'},
    {goal:'無理しない',word:'追い込みすぎないのも大事🐼'},
    {goal:'着替えて来る',word:'その行動力がもう偉い！'},
    {goal:'少し汗かく',word:'体動かしただけで優勝🏆'},
    {goal:'ストレッチだけでもOK',word:'今日は回復デーでもある✨'},
    {goal:'気楽にやる',word:'ガチ勢にならなくて大丈夫！'},
    {goal:'1回でも動く',word:'続ける人が最後に勝つ🐼'},
    {goal:'来月も続ける',word:'短期より“ずっと”が強い！'},
  ],
  home:[
    {goal:'1種目だけやる',word:'1回でもやれば今日は勝ち🐼'},
    {goal:'5分だけ動く',word:'短時間でもちゃんと意味ある！'},
    {goal:'スクワット少しやる',word:'未来の自分が感謝してる🦵'},
    {goal:'寝転ぶ前に軽く運動',word:'そのひと踏ん張りがえらい✨'},
    {goal:'動画1本だけやる',word:'再生ボタン押した時点で優勝🏆'},
    {goal:'ストレッチ混ぜる',word:'ゆるく続けるの大事！'},
    {goal:'ながら運動する',word:'テレビ見ながらでもOK📺'},
    {goal:'筋肉に挨拶する',word:'今日は“起こすだけ”でも十分🐼'},
    {goal:'無理しない範囲でやる',word:'継続できる強さが一番！'},
    {goal:'終わったら自分を褒める',word:'その習慣、かなり大事✨'},
  ],
  stretch:[
    {goal:'深呼吸する',word:'呼吸だけでも整うよ🌿'},
    {goal:'肩をゆるめる',word:'がんばりすぎてない？🐼'},
    {goal:'5分だけ伸ばす',word:'少しでも体は喜ぶ！'},
    {goal:'体をほぐす',word:'今日は回復の日✨'},
    {goal:'首を回してみる',word:'スマホ疲れ、たまってるかも📱'},
    {goal:'寝る前にゆっくり',word:'いい睡眠にもつながるよ💤'},
    {goal:'姿勢を整える',word:'背筋伸びると気分も変わる！'},
    {goal:'痛気持ちいい所まで',word:'無理は禁止ね🐼'},
    {goal:'足を伸ばす',word:'今日も一日おつかれさま！'},
    {goal:'自分を甘やかす',word:'休ませるのもトレーニング✨'},
  ],
  other:[
    {goal:'ピザーラを楽しむ🍕',word:'今日はチートデーってことで！'},
    {goal:'ラーメン二郎で生還する',word:'全マシマシは戦い⚔️'},
    {goal:'海外旅行を満喫する✈️',word:'それ、移動だけで運動説ある🐼'},
    {goal:'お布団と仲良くする',word:'今日は布団が離してくれない！'},
    {goal:'アイスを食べる🍨',word:'たまには甘やかしも必要✨'},
    {goal:'Netflixを見すぎる',word:'次の話、止まらないやつだ📺'},
    {goal:'ファミチキを食べる',word:'タンパク質だから実質トレーニング🐼'},
    {goal:'ゲームで夜更かしする🎮',word:'ラスボス前で寝れない！'},
    {goal:'何もしない',word:'逆に高度な技かもしれない…'},
    {goal:'好き勝手に生きる',word:'ゆるトレは自由でOK🐼'},
  ],
};


function dailySupport(cat){
  const list = DAILY_SUPPORT[cat] || DAILY_SUPPORT.walk;
  const todayKey = Math.floor(Date.now() / 86400000);
  return list[todayKey % list.length];
}


const DAILY_365_MESSAGES = [
  "新年はゆるく始めればOK🎍 🐼",
  "寒い日は部屋ストレッチで合格 🐼",
  "お正月明けは戻れたら勝ち 🐼",
  "寒さに勝たなくていい、室内でOK 🐼",
  "バレンタインの甘さも人生の栄養🍫 🐼",
  "春を待ちながら肩回し 🐼",
  "春の気配、散歩チャンス🌸 🐼",
  "年度末は疲れて当然、深呼吸しよ 🐼",
  "花粉の日は無理せず室内で 🐼",
  "新年度は1分習慣から🌱 🐼",
  "春の散歩はそれだけでごほうび 🐼",
  "環境が変わる時こそゆるく 🐼",
  "新緑を見たら健康ポイント🌿 🐼",
  "連休明けは開いただけでえらい 🐼",
  "気持ちいい季節、3分だけ外へ 🐼",
  "雨の日は室内ストレッチでOK☔ 🐼",
  "梅雨は気分も重くて普通だよ 🐼",
  "湿気に負けず深呼吸だけ 🐼",
  "暑い日は涼しい場所でゆるトレ☀️ 🐼",
  "夏は水分補給も運動の仲間 🐼",
  "汗をかく前に休んでもOK 🐼",
  "真夏は無理しないのが正解 🐼",
  "アイスの日も人生には必要🍨 🐼",
  "涼しい時間に1分だけ 🐼",
  "秋の始まり、散歩が気持ちいい🍂 🐼",
  "夏疲れはゆっくり回復 🐼",
  "夜風を感じたら大成功 🐼",
  "秋は食べても歩けば優勝🍜 🐼",
  "ハロウィン前に肩回し🎃 🐼",
  "気温がいい日は外の空気だけ 🐼",
  "寒くなる前に体をほぐそう 🐼",
  "秋の終わりは温かくしてOK 🐼",
  "年末前のゆる習慣づくり 🐼",
  "年末は生きてるだけで偉い🎄 🐼",
  "忙しい日は30秒で合格 🐼",
  "今年の自分に拍手しよう 🐼",
  "今日は1分だけでも勝ち🐼✨",
  "昨日より一歩で十分🐼✨",
  "開いただけでえらい🐼✨",
  "深呼吸できたら合格🐼✨",
  "歩けたら天才、歩けなくても大丈夫🐼✨",
  "体を伸ばせたら優勝🐼✨",
  "ゆるく続ける人が最強🐼✨",
  "休むのも立派な作戦🐼✨",
  "食べた分、幸せも増えた🐼✨",
  "ラーメンは明日の元気🐼✨",
  "ピザの日も人生には必要🐼✨",
  "水を一口飲んだら健康ポイント🐼✨",
  "肩を回したらもう前進🐼✨",
  "今日は自分に甘くてOK🐼✨",
  "三日坊主でも四日目に戻れば勝ち🐼✨",
  "サボっても帰ってきたら大優勝🐼✨",
  "5分歩けば伝説🐼✨",
  "布団から出ただけでえらい🐼✨",
  "完璧じゃなくて続くほうが強い🐼✨",
  "ゆっくりでも前進🐼✨",
  "小さな運動が未来を変える🐼✨",
  "今日の自分を責めない🐼✨",
  "軽めに動く日も大切🐼✨",
  "食後の3分散歩で実質勝利🐼✨",
  "気分が乗らない日こそ30秒🐼✨",
  "夜は整えるだけでOK🐼✨",
  "朝に伸びたら一日が始まる🐼✨",
  "疲れた日は回復のプロ🐼✨",
  "スマホ置いて首を回そう🐼✨",
  "階段1回でこっそり勝利🐼✨",
  "コンビニまで歩いたら英雄🐼✨",
  "ストレッチだけでも十分🐼✨",
  "ジムに行けたら拍手🐼✨",
  "家トレ1回で花丸🐼✨",
  "ランニングはゆっくりでOK🐼✨",
  "今日は心のウォーミングアップ🐼✨",
  "笑えたらそれも健康🐼✨",
  "ごほうび先行でもOK🐼✨",
  "自分のペースがいちばん🐼✨",
  "ゆるパンダは今日も味方🐼✨",
  "今日は1分だけでも勝ち。それでいいんだよ〜",
  "昨日より一歩で十分。それでいいんだよ〜",
  "開いただけでえらい。それでいいんだよ〜",
  "深呼吸できたら合格。それでいいんだよ〜",
  "歩けたら天才、歩けなくても大丈夫。それでいいんだよ〜",
  "体を伸ばせたら優勝。それでいいんだよ〜",
  "ゆるく続ける人が最強。それでいいんだよ〜",
  "休むのも立派な作戦。それでいいんだよ〜",
  "食べた分、幸せも増えた。それでいいんだよ〜",
  "ラーメンは明日の元気。それでいいんだよ〜",
  "ピザの日も人生には必要。それでいいんだよ〜",
  "水を一口飲んだら健康ポイント。それでいいんだよ〜",
  "肩を回したらもう前進。それでいいんだよ〜",
  "今日は自分に甘くてOK。それでいいんだよ〜",
  "三日坊主でも四日目に戻れば勝ち。それでいいんだよ〜",
  "サボっても帰ってきたら大優勝。それでいいんだよ〜",
  "5分歩けば伝説。それでいいんだよ〜",
  "布団から出ただけでえらい。それでいいんだよ〜",
  "完璧じゃなくて続くほうが強い。それでいいんだよ〜",
  "ゆっくりでも前進。それでいいんだよ〜",
  "小さな運動が未来を変える。それでいいんだよ〜",
  "今日の自分を責めない。それでいいんだよ〜",
  "軽めに動く日も大切。それでいいんだよ〜",
  "食後の3分散歩で実質勝利。それでいいんだよ〜",
  "気分が乗らない日こそ30秒。それでいいんだよ〜",
  "夜は整えるだけでOK。それでいいんだよ〜",
  "朝に伸びたら一日が始まる。それでいいんだよ〜",
  "疲れた日は回復のプロ。それでいいんだよ〜",
  "スマホ置いて首を回そう。それでいいんだよ〜",
  "階段1回でこっそり勝利。それでいいんだよ〜",
  "コンビニまで歩いたら英雄。それでいいんだよ〜",
  "ストレッチだけでも十分。それでいいんだよ〜",
  "ジムに行けたら拍手。それでいいんだよ〜",
  "家トレ1回で花丸。それでいいんだよ〜",
  "ランニングはゆっくりでOK。それでいいんだよ〜",
  "今日は心のウォーミングアップ。それでいいんだよ〜",
  "笑えたらそれも健康。それでいいんだよ〜",
  "ごほうび先行でもOK。それでいいんだよ〜",
  "自分のペースがいちばん。それでいいんだよ〜",
  "ゆるパンダは今日も味方。それでいいんだよ〜",
  "今日は1分だけでも勝ち。未来の自分が喜ぶよ",
  "昨日より一歩で十分。未来の自分が喜ぶよ",
  "開いただけでえらい。未来の自分が喜ぶよ",
  "深呼吸できたら合格。未来の自分が喜ぶよ",
  "歩けたら天才、歩けなくても大丈夫。未来の自分が喜ぶよ",
  "体を伸ばせたら優勝。未来の自分が喜ぶよ",
  "ゆるく続ける人が最強。未来の自分が喜ぶよ",
  "休むのも立派な作戦。未来の自分が喜ぶよ",
  "食べた分、幸せも増えた。未来の自分が喜ぶよ",
  "ラーメンは明日の元気。未来の自分が喜ぶよ",
  "ピザの日も人生には必要。未来の自分が喜ぶよ",
  "水を一口飲んだら健康ポイント。未来の自分が喜ぶよ",
  "肩を回したらもう前進。未来の自分が喜ぶよ",
  "今日は自分に甘くてOK。未来の自分が喜ぶよ",
  "三日坊主でも四日目に戻れば勝ち。未来の自分が喜ぶよ",
  "サボっても帰ってきたら大優勝。未来の自分が喜ぶよ",
  "5分歩けば伝説。未来の自分が喜ぶよ",
  "布団から出ただけでえらい。未来の自分が喜ぶよ",
  "完璧じゃなくて続くほうが強い。未来の自分が喜ぶよ",
  "ゆっくりでも前進。未来の自分が喜ぶよ",
  "小さな運動が未来を変える。未来の自分が喜ぶよ",
  "今日の自分を責めない。未来の自分が喜ぶよ",
  "軽めに動く日も大切。未来の自分が喜ぶよ",
  "食後の3分散歩で実質勝利。未来の自分が喜ぶよ",
  "気分が乗らない日こそ30秒。未来の自分が喜ぶよ",
  "夜は整えるだけでOK。未来の自分が喜ぶよ",
  "朝に伸びたら一日が始まる。未来の自分が喜ぶよ",
  "疲れた日は回復のプロ。未来の自分が喜ぶよ",
  "スマホ置いて首を回そう。未来の自分が喜ぶよ",
  "階段1回でこっそり勝利。未来の自分が喜ぶよ",
  "コンビニまで歩いたら英雄。未来の自分が喜ぶよ",
  "ストレッチだけでも十分。未来の自分が喜ぶよ",
  "ジムに行けたら拍手。未来の自分が喜ぶよ",
  "家トレ1回で花丸。未来の自分が喜ぶよ",
  "ランニングはゆっくりでOK。未来の自分が喜ぶよ",
  "今日は心のウォーミングアップ。未来の自分が喜ぶよ",
  "笑えたらそれも健康。未来の自分が喜ぶよ",
  "ごほうび先行でもOK。未来の自分が喜ぶよ",
  "自分のペースがいちばん。未来の自分が喜ぶよ",
  "ゆるパンダは今日も味方。未来の自分が喜ぶよ",
  "今日は1分だけでも勝ち。無理しないでね",
  "昨日より一歩で十分。無理しないでね",
  "開いただけでえらい。無理しないでね",
  "深呼吸できたら合格。無理しないでね",
  "歩けたら天才、歩けなくても大丈夫。無理しないでね",
  "体を伸ばせたら優勝。無理しないでね",
  "ゆるく続ける人が最強。無理しないでね",
  "休むのも立派な作戦。無理しないでね",
  "食べた分、幸せも増えた。無理しないでね",
  "ラーメンは明日の元気。無理しないでね",
  "ピザの日も人生には必要。無理しないでね",
  "水を一口飲んだら健康ポイント。無理しないでね",
  "肩を回したらもう前進。無理しないでね",
  "今日は自分に甘くてOK。無理しないでね",
  "三日坊主でも四日目に戻れば勝ち。無理しないでね",
  "サボっても帰ってきたら大優勝。無理しないでね",
  "5分歩けば伝説。無理しないでね",
  "布団から出ただけでえらい。無理しないでね",
  "完璧じゃなくて続くほうが強い。無理しないでね",
  "ゆっくりでも前進。無理しないでね",
  "小さな運動が未来を変える。無理しないでね",
  "今日の自分を責めない。無理しないでね",
  "軽めに動く日も大切。無理しないでね",
  "食後の3分散歩で実質勝利。無理しないでね",
  "気分が乗らない日こそ30秒。無理しないでね",
  "夜は整えるだけでOK。無理しないでね",
  "朝に伸びたら一日が始まる。無理しないでね",
  "疲れた日は回復のプロ。無理しないでね",
  "スマホ置いて首を回そう。無理しないでね",
  "階段1回でこっそり勝利。無理しないでね",
  "コンビニまで歩いたら英雄。無理しないでね",
  "ストレッチだけでも十分。無理しないでね",
  "ジムに行けたら拍手。無理しないでね",
  "家トレ1回で花丸。無理しないでね",
  "ランニングはゆっくりでOK。無理しないでね",
  "今日は心のウォーミングアップ。無理しないでね",
  "笑えたらそれも健康。無理しないでね",
  "ごほうび先行でもOK。無理しないでね",
  "自分のペースがいちばん。無理しないでね",
  "ゆるパンダは今日も味方。無理しないでね",
  "今日は1分だけでも勝ち。ゆるトレ的には満点",
  "昨日より一歩で十分。ゆるトレ的には満点",
  "開いただけでえらい。ゆるトレ的には満点",
  "深呼吸できたら合格。ゆるトレ的には満点",
  "歩けたら天才、歩けなくても大丈夫。ゆるトレ的には満点",
  "体を伸ばせたら優勝。ゆるトレ的には満点",
  "ゆるく続ける人が最強。ゆるトレ的には満点",
  "休むのも立派な作戦。ゆるトレ的には満点",
  "食べた分、幸せも増えた。ゆるトレ的には満点",
  "ラーメンは明日の元気。ゆるトレ的には満点",
  "ピザの日も人生には必要。ゆるトレ的には満点",
  "水を一口飲んだら健康ポイント。ゆるトレ的には満点",
  "肩を回したらもう前進。ゆるトレ的には満点",
  "今日は自分に甘くてOK。ゆるトレ的には満点",
  "三日坊主でも四日目に戻れば勝ち。ゆるトレ的には満点",
  "サボっても帰ってきたら大優勝。ゆるトレ的には満点",
  "5分歩けば伝説。ゆるトレ的には満点",
  "布団から出ただけでえらい。ゆるトレ的には満点",
  "完璧じゃなくて続くほうが強い。ゆるトレ的には満点",
  "ゆっくりでも前進。ゆるトレ的には満点",
  "小さな運動が未来を変える。ゆるトレ的には満点",
  "今日の自分を責めない。ゆるトレ的には満点",
  "軽めに動く日も大切。ゆるトレ的には満点",
  "食後の3分散歩で実質勝利。ゆるトレ的には満点",
  "気分が乗らない日こそ30秒。ゆるトレ的には満点",
  "夜は整えるだけでOK。ゆるトレ的には満点",
  "朝に伸びたら一日が始まる。ゆるトレ的には満点",
  "疲れた日は回復のプロ。ゆるトレ的には満点",
  "スマホ置いて首を回そう。ゆるトレ的には満点",
  "階段1回でこっそり勝利。ゆるトレ的には満点",
  "コンビニまで歩いたら英雄。ゆるトレ的には満点",
  "ストレッチだけでも十分。ゆるトレ的には満点",
  "ジムに行けたら拍手。ゆるトレ的には満点",
  "家トレ1回で花丸。ゆるトレ的には満点",
  "ランニングはゆっくりでOK。ゆるトレ的には満点",
  "今日は心のウォーミングアップ。ゆるトレ的には満点",
  "笑えたらそれも健康。ゆるトレ的には満点",
  "ごほうび先行でもOK。ゆるトレ的には満点",
  "自分のペースがいちばん。ゆるトレ的には満点",
  "ゆるパンダは今日も味方。ゆるトレ的には満点",
  "今日は1分だけでも勝ち。ちゃんと積み上がってる",
  "昨日より一歩で十分。ちゃんと積み上がってる",
  "開いただけでえらい。ちゃんと積み上がってる",
  "深呼吸できたら合格。ちゃんと積み上がってる",
  "歩けたら天才、歩けなくても大丈夫。ちゃんと積み上がってる",
  "体を伸ばせたら優勝。ちゃんと積み上がってる",
  "ゆるく続ける人が最強。ちゃんと積み上がってる",
  "休むのも立派な作戦。ちゃんと積み上がってる",
  "食べた分、幸せも増えた。ちゃんと積み上がってる",
  "ラーメンは明日の元気。ちゃんと積み上がってる",
  "ピザの日も人生には必要。ちゃんと積み上がってる",
  "水を一口飲んだら健康ポイント。ちゃんと積み上がってる",
  "肩を回したらもう前進。ちゃんと積み上がってる",
  "今日は自分に甘くてOK。ちゃんと積み上がってる",
  "三日坊主でも四日目に戻れば勝ち。ちゃんと積み上がってる",
  "サボっても帰ってきたら大優勝。ちゃんと積み上がってる",
  "5分歩けば伝説。ちゃんと積み上がってる",
  "布団から出ただけでえらい。ちゃんと積み上がってる",
  "完璧じゃなくて続くほうが強い。ちゃんと積み上がってる",
  "ゆっくりでも前進。ちゃんと積み上がってる",
  "小さな運動が未来を変える。ちゃんと積み上がってる",
  "今日の自分を責めない。ちゃんと積み上がってる",
  "軽めに動く日も大切。ちゃんと積み上がってる",
  "食後の3分散歩で実質勝利。ちゃんと積み上がってる",
  "気分が乗らない日こそ30秒。ちゃんと積み上がってる",
  "夜は整えるだけでOK。ちゃんと積み上がってる",
  "朝に伸びたら一日が始まる。ちゃんと積み上がってる",
  "疲れた日は回復のプロ。ちゃんと積み上がってる",
  "スマホ置いて首を回そう。ちゃんと積み上がってる",
  "階段1回でこっそり勝利。ちゃんと積み上がってる",
  "コンビニまで歩いたら英雄。ちゃんと積み上がってる",
  "ストレッチだけでも十分。ちゃんと積み上がってる",
  "ジムに行けたら拍手。ちゃんと積み上がってる",
  "家トレ1回で花丸。ちゃんと積み上がってる",
  "ランニングはゆっくりでOK。ちゃんと積み上がってる",
  "今日は心のウォーミングアップ。ちゃんと積み上がってる",
  "笑えたらそれも健康。ちゃんと積み上がってる",
  "ごほうび先行でもOK。ちゃんと積み上がってる",
  "自分のペースがいちばん。ちゃんと積み上がってる",
  "ゆるパンダは今日も味方。ちゃんと積み上がってる",
  "今日は1分だけでも勝ち。今日はそれだけで十分",
  "昨日より一歩で十分。今日はそれだけで十分",
  "開いただけでえらい。今日はそれだけで十分",
  "深呼吸できたら合格。今日はそれだけで十分",
  "歩けたら天才、歩けなくても大丈夫。今日はそれだけで十分",
  "体を伸ばせたら優勝。今日はそれだけで十分",
  "ゆるく続ける人が最強。今日はそれだけで十分",
  "休むのも立派な作戦。今日はそれだけで十分",
  "食べた分、幸せも増えた。今日はそれだけで十分",
  "ラーメンは明日の元気。今日はそれだけで十分",
  "ピザの日も人生には必要。今日はそれだけで十分",
  "水を一口飲んだら健康ポイント。今日はそれだけで十分",
  "肩を回したらもう前進。今日はそれだけで十分",
  "今日は自分に甘くてOK。今日はそれだけで十分",
  "三日坊主でも四日目に戻れば勝ち。今日はそれだけで十分",
  "サボっても帰ってきたら大優勝。今日はそれだけで十分",
  "5分歩けば伝説。今日はそれだけで十分",
  "布団から出ただけでえらい。今日はそれだけで十分",
  "完璧じゃなくて続くほうが強い。今日はそれだけで十分",
  "ゆっくりでも前進。今日はそれだけで十分",
  "小さな運動が未来を変える。今日はそれだけで十分",
  "今日の自分を責めない。今日はそれだけで十分",
  "軽めに動く日も大切。今日はそれだけで十分",
  "食後の3分散歩で実質勝利。今日はそれだけで十分",
  "気分が乗らない日こそ30秒。今日はそれだけで十分",
  "夜は整えるだけでOK。今日はそれだけで十分",
  "朝に伸びたら一日が始まる。今日はそれだけで十分",
  "疲れた日は回復のプロ。今日はそれだけで十分",
  "スマホ置いて首を回そう。今日はそれだけで十分",
  "階段1回でこっそり勝利。今日はそれだけで十分",
  "コンビニまで歩いたら英雄。今日はそれだけで十分",
  "ストレッチだけでも十分。今日はそれだけで十分",
  "ジムに行けたら拍手。今日はそれだけで十分",
  "家トレ1回で花丸。今日はそれだけで十分",
  "ランニングはゆっくりでOK。今日はそれだけで十分",
  "今日は心のウォーミングアップ。今日はそれだけで十分",
  "笑えたらそれも健康。今日はそれだけで十分",
  "ごほうび先行でもOK。今日はそれだけで十分",
  "自分のペースがいちばん。今日はそれだけで十分",
  "ゆるパンダは今日も味方。今日はそれだけで十分",
  "今日は1分だけでも勝ち。焦らずいこう",
  "昨日より一歩で十分。焦らずいこう",
  "開いただけでえらい。焦らずいこう",
  "深呼吸できたら合格。焦らずいこう",
  "歩けたら天才、歩けなくても大丈夫。焦らずいこう",
  "体を伸ばせたら優勝。焦らずいこう",
  "ゆるく続ける人が最強。焦らずいこう",
  "休むのも立派な作戦。焦らずいこう",
  "食べた分、幸せも増えた。焦らずいこう",
  "ラーメンは明日の元気。焦らずいこう",
  "ピザの日も人生には必要。焦らずいこう",
  "水を一口飲んだら健康ポイント。焦らずいこう",
  "肩を回したらもう前進。焦らずいこう",
  "今日は自分に甘くてOK。焦らずいこう",
  "三日坊主でも四日目に戻れば勝ち。焦らずいこう",
  "サボっても帰ってきたら大優勝。焦らずいこう",
  "5分歩けば伝説。焦らずいこう",
  "布団から出ただけでえらい。焦らずいこう",
  "完璧じゃなくて続くほうが強い。焦らずいこう",
  "ゆっくりでも前進。焦らずいこう",
  "小さな運動が未来を変える。焦らずいこう",
  "今日の自分を責めない。焦らずいこう",
  "軽めに動く日も大切。焦らずいこう",
  "食後の3分散歩で実質勝利。焦らずいこう",
  "気分が乗らない日こそ30秒。焦らずいこう",
  "夜は整えるだけでOK。焦らずいこう",
  "朝に伸びたら一日が始まる。焦らずいこう",
  "疲れた日は回復のプロ。焦らずいこう",
  "スマホ置いて首を回そう。焦らずいこう",
  "階段1回でこっそり勝利。焦らずいこう",
  "コンビニまで歩いたら英雄。焦らずいこう",
  "ストレッチだけでも十分。焦らずいこう",
  "ジムに行けたら拍手。焦らずいこう",
  "家トレ1回で花丸。焦らずいこう",
  "ランニングはゆっくりでOK。焦らずいこう",
  "今日は心のウォーミングアップ。焦らずいこう",
  "笑えたらそれも健康。焦らずいこう",
  "ごほうび先行でもOK。焦らずいこう",
  "自分のペースがいちばん。焦らずいこう",
  "ゆるパンダは今日も味方。焦らずいこう",
  "今日は1分だけでも勝ち。大丈夫、戻れるから",
  "昨日より一歩で十分。大丈夫、戻れるから",
  "開いただけでえらい。大丈夫、戻れるから",
  "深呼吸できたら合格。大丈夫、戻れるから",
  "歩けたら天才、歩けなくても大丈夫。大丈夫、戻れるから",
  "体を伸ばせたら優勝。大丈夫、戻れるから",
  "ゆるく続ける人が最強。大丈夫、戻れるから",
  "休むのも立派な作戦。大丈夫、戻れるから",
  "食べた分、幸せも増えた。大丈夫、戻れるから"
];


function getDayOfYear(date=new Date()){
  const start=new Date(date.getFullYear(),0,0);
  const diff=date-start;
  const oneDay=1000*60*60*24;
  return Math.floor(diff/oneDay);
}
function daily365Message(date=new Date()){
  const idx=(getDayOfYear(date)-1)%DAILY_365_MESSAGES.length;
  return {text:DAILY_365_MESSAGES[idx], day:idx+1, total:DAILY_365_MESSAGES.length};
}

const DAILY_365_MISSIONS = [
  {id:'ym001',icon:'🚶',title:'新年ゆる始動',text:'外の空気を吸いながら3分だけ歩く',points:5,cat:'walk'},
  {id:'ym002',icon:'🧘',title:'肩まわし',text:'肩を前後に10回ずつ回す',points:5,cat:'stretch'},
  {id:'ym003',icon:'💧',title:'水分チャージ',text:'水をコップ1杯飲む',points:5,cat:'health'},
  {id:'ym004',icon:'🌿',title:'深呼吸',text:'ゆっくり深呼吸を3回する',points:5,cat:'mental'},
  {id:'ym005',icon:'🍜',title:'食後リセット',text:'食後に1分だけ立つ',points:5,cat:'food'},
  {id:'ym006',icon:'🪜',title:'階段チャレンジ',text:'1回だけ階段を使う',points:5,cat:'walk'},
  {id:'ym007',icon:'😴',title:'早寝準備',text:'寝る前にスマホを1分置く',points:5,cat:'rest'},
  {id:'ym008',icon:'🐼',title:'自分ほめ',text:'今日の自分を1つ褒める',points:5,cat:'mental'},
  {id:'ym009',icon:'🦶',title:'足首ぐるぐる',text:'足首を左右10回ずつ回す',points:5,cat:'stretch'},
  {id:'ym010',icon:'🚪',title:'玄関ミッション',text:'玄関の外に一歩だけ出る',points:5,cat:'walk'},
  {id:'ym011',icon:'🍵',title:'一息タイム',text:'温かい飲み物で一息つく',points:5,cat:'rest'},
  {id:'ym012',icon:'📸',title:'思い出メモ＋',text:'今日の気分を一言メモする',points:5,cat:'memory'},
  {id:'ym013',icon:'🧍',title:'姿勢リセット',text:'背筋を伸ばして10秒キープ',points:5,cat:'health'},
  {id:'ym014',icon:'🍚',title:'よく噛む',text:'最初の一口だけゆっくり味わう',points:5,cat:'food'},
  {id:'ym015',icon:'🌙',title:'夜のゆる伸び',text:'寝る前に首を左右に倒す',points:5,cat:'stretch'},
  {id:'ym016',icon:'👏',title:'誰か応援',text:'心の中で誰かにおつかれと言う',points:5,cat:'social'},
  {id:'ym017',icon:'🧦',title:'つま先上げ',text:'つま先を10回上げ下げする',points:5,cat:'health'},
  {id:'ym018',icon:'🛌',title:'寒い日は室内でOK',text:'今日は無理しないと決める',points:5,cat:'rest'},
  {id:'ym019',icon:'🏠',title:'部屋ちょい歩き',text:'部屋の中を30秒だけ歩く',points:5,cat:'walk'},
  {id:'ym020',icon:'✨',title:'記録だけ',text:'運動ゼロでも気分だけ残す',points:5,cat:'memory'},
  {id:'ym021',icon:'🚶',title:'3分さんぽ',text:'外の空気を吸いながら3分だけ歩く',points:5,cat:'walk'},
  {id:'ym022',icon:'🧘',title:'肩まわし',text:'肩を前後に10回ずつ回す',points:5,cat:'stretch'},
  {id:'ym023',icon:'💧',title:'水分チャージ＋',text:'水をコップ1杯飲む',points:5,cat:'health'},
  {id:'ym024',icon:'🌿',title:'深呼吸',text:'ゆっくり深呼吸を3回する',points:5,cat:'mental'},
  {id:'ym025',icon:'🍜',title:'食後リセット',text:'食後に1分だけ立つ',points:5,cat:'food'},
  {id:'ym026',icon:'🪜',title:'階段チャレンジ',text:'1回だけ階段を使う',points:5,cat:'walk'},
  {id:'ym027',icon:'😴',title:'早寝準備',text:'寝る前にスマホを1分置く',points:5,cat:'rest'},
  {id:'ym028',icon:'🐼',title:'自分ほめ',text:'今日の自分を1つ褒める',points:5,cat:'mental'},
  {id:'ym029',icon:'🦶',title:'足首ぐるぐる',text:'足首を左右10回ずつ回す',points:5,cat:'stretch'},
  {id:'ym030',icon:'🚪',title:'玄関ミッション',text:'玄関の外に一歩だけ出る',points:5,cat:'walk'},
  {id:'ym031',icon:'🍵',title:'一息タイム',text:'温かい飲み物で一息つく',points:5,cat:'rest'},
  {id:'ym032',icon:'📸',title:'思い出メモ',text:'今日の気分を一言メモする',points:5,cat:'memory'},
  {id:'ym033',icon:'🧍',title:'姿勢リセット',text:'背筋を伸ばして10秒キープ',points:5,cat:'health'},
  {id:'ym034',icon:'🍚',title:'よく噛む＋',text:'最初の一口だけゆっくり味わう',points:5,cat:'food'},
  {id:'ym035',icon:'🌙',title:'チョコ分ほぐし',text:'寝る前に首を左右に倒す',points:5,cat:'stretch'},
  {id:'ym036',icon:'👏',title:'誰か応援',text:'心の中で誰かにおつかれと言う',points:5,cat:'social'},
  {id:'ym037',icon:'🧦',title:'つま先上げ',text:'つま先を10回上げ下げする',points:5,cat:'health'},
  {id:'ym038',icon:'🛌',title:'回復宣言',text:'今日は無理しないと決める',points:5,cat:'rest'},
  {id:'ym039',icon:'🏠',title:'部屋ちょい歩き',text:'部屋の中を30秒だけ歩く',points:5,cat:'walk'},
  {id:'ym040',icon:'✨',title:'記録だけ',text:'運動ゼロでも気分だけ残す',points:5,cat:'memory'},
  {id:'ym041',icon:'🚶',title:'3分さんぽ',text:'外の空気を吸いながら3分だけ歩く',points:5,cat:'walk'},
  {id:'ym042',icon:'🧘',title:'肩まわし',text:'肩を前後に10回ずつ回す',points:5,cat:'stretch'},
  {id:'ym043',icon:'💧',title:'水分チャージ',text:'水をコップ1杯飲む',points:5,cat:'health'},
  {id:'ym044',icon:'🌿',title:'深呼吸',text:'ゆっくり深呼吸を3回する',points:5,cat:'mental'},
  {id:'ym045',icon:'🍜',title:'食後リセット＋',text:'食後に1分だけ立つ',points:5,cat:'food'},
  {id:'ym046',icon:'🪜',title:'階段チャレンジ',text:'1回だけ階段を使う',points:5,cat:'walk'},
  {id:'ym047',icon:'😴',title:'早寝準備',text:'寝る前にスマホを1分置く',points:5,cat:'rest'},
  {id:'ym048',icon:'🐼',title:'自分ほめ',text:'今日の自分を1つ褒める',points:5,cat:'mental'},
  {id:'ym049',icon:'🦶',title:'足首ぐるぐる',text:'足首を左右10回ずつ回す',points:5,cat:'stretch'},
  {id:'ym050',icon:'🚪',title:'玄関ミッション',text:'玄関の外に一歩だけ出る',points:5,cat:'walk'},
  {id:'ym051',icon:'🍵',title:'一息タイム',text:'温かい飲み物で一息つく',points:5,cat:'rest'},
  {id:'ym052',icon:'📸',title:'冬の肩こりを逃がそう',text:'今日の気分を一言メモする',points:5,cat:'memory'},
  {id:'ym053',icon:'🧍',title:'姿勢リセット',text:'背筋を伸ばして10秒キープ',points:5,cat:'health'},
  {id:'ym054',icon:'🍚',title:'よく噛む',text:'最初の一口だけゆっくり味わう',points:5,cat:'food'},
  {id:'ym055',icon:'🌙',title:'夜のゆる伸び',text:'寝る前に首を左右に倒す',points:5,cat:'stretch'},
  {id:'ym056',icon:'👏',title:'誰か応援＋',text:'心の中で誰かにおつかれと言う',points:5,cat:'social'},
  {id:'ym057',icon:'🧦',title:'つま先上げ',text:'つま先を10回上げ下げする',points:5,cat:'health'},
  {id:'ym058',icon:'🛌',title:'回復宣言',text:'今日は無理しないと決める',points:5,cat:'rest'},
  {id:'ym059',icon:'🏠',title:'部屋ちょい歩き',text:'部屋の中を30秒だけ歩く',points:5,cat:'walk'},
  {id:'ym060',icon:'✨',title:'記録だけ',text:'運動ゼロでも気分だけ残す',points:5,cat:'memory'},
  {id:'ym061',icon:'🚶',title:'3分さんぽ',text:'外の空気を吸いながら3分だけ歩く',points:5,cat:'walk'},
  {id:'ym062',icon:'🧘',title:'肩まわし',text:'肩を前後に10回ずつ回す',points:5,cat:'stretch'},
  {id:'ym063',icon:'💧',title:'水分チャージ',text:'水をコップ1杯飲む',points:5,cat:'health'},
  {id:'ym064',icon:'🌿',title:'深呼吸',text:'ゆっくり深呼吸を3回する',points:5,cat:'mental'},
  {id:'ym065',icon:'🍜',title:'食後リセット',text:'食後に1分だけ立つ',points:5,cat:'food'},
  {id:'ym066',icon:'🪜',title:'階段チャレンジ',text:'1回だけ階段を使う',points:5,cat:'walk'},
  {id:'ym067',icon:'😴',title:'早寝準備＋',text:'寝る前にスマホを1分置く',points:5,cat:'rest'},
  {id:'ym068',icon:'🐼',title:'自分ほめ',text:'今日の自分を1つ褒める',points:5,cat:'mental'},
  {id:'ym069',icon:'🦶',title:'春待ち深呼吸',text:'足首を左右10回ずつ回す',points:5,cat:'stretch'},
  {id:'ym070',icon:'🚪',title:'玄関ミッション',text:'玄関の外に一歩だけ出る',points:5,cat:'walk'},
  {id:'ym071',icon:'🍵',title:'一息タイム',text:'温かい飲み物で一息つく',points:5,cat:'rest'},
  {id:'ym072',icon:'📸',title:'思い出メモ',text:'今日の気分を一言メモする',points:5,cat:'memory'},
  {id:'ym073',icon:'🧍',title:'姿勢リセット',text:'背筋を伸ばして10秒キープ',points:5,cat:'health'},
  {id:'ym074',icon:'🍚',title:'よく噛む',text:'最初の一口だけゆっくり味わう',points:5,cat:'food'},
  {id:'ym075',icon:'🌙',title:'夜のゆる伸び',text:'寝る前に首を左右に倒す',points:5,cat:'stretch'},
  {id:'ym076',icon:'👏',title:'誰か応援',text:'心の中で誰かにおつかれと言う',points:5,cat:'social'},
  {id:'ym077',icon:'🧦',title:'つま先上げ',text:'つま先を10回上げ下げする',points:5,cat:'health'},
  {id:'ym078',icon:'🛌',title:'回復宣言＋',text:'今日は無理しないと決める',points:5,cat:'rest'},
  {id:'ym079',icon:'🏠',title:'部屋ちょい歩き',text:'部屋の中を30秒だけ歩く',points:5,cat:'walk'},
  {id:'ym080',icon:'✨',title:'記録だけ',text:'運動ゼロでも気分だけ残す',points:5,cat:'memory'},
  {id:'ym081',icon:'🚶',title:'3分さんぽ',text:'外の空気を吸いながら3分だけ歩く',points:5,cat:'walk'},
  {id:'ym082',icon:'🧘',title:'肩まわし',text:'肩を前後に10回ずつ回す',points:5,cat:'stretch'},
  {id:'ym083',icon:'💧',title:'水分チャージ',text:'水をコップ1杯飲む',points:5,cat:'health'},
  {id:'ym084',icon:'🌿',title:'深呼吸',text:'ゆっくり深呼吸を3回する',points:5,cat:'mental'},
  {id:'ym085',icon:'🍜',title:'食後リセット',text:'食後に1分だけ立つ',points:5,cat:'food'},
  {id:'ym086',icon:'🪜',title:'花粉の日は室内ミッション',text:'1回だけ階段を使う',points:5,cat:'walk'},
  {id:'ym087',icon:'😴',title:'早寝準備',text:'寝る前にスマホを1分置く',points:5,cat:'rest'},
  {id:'ym088',icon:'🐼',title:'自分ほめ',text:'今日の自分を1つ褒める',points:5,cat:'mental'},
  {id:'ym089',icon:'🦶',title:'足首ぐるぐる＋',text:'足首を左右10回ずつ回す',points:5,cat:'stretch'},
  {id:'ym090',icon:'🚪',title:'玄関ミッション',text:'玄関の外に一歩だけ出る',points:5,cat:'walk'},
  {id:'ym091',icon:'🍵',title:'一息タイム',text:'温かい飲み物で一息つく',points:5,cat:'rest'},
  {id:'ym092',icon:'📸',title:'思い出メモ',text:'今日の気分を一言メモする',points:5,cat:'memory'},
  {id:'ym093',icon:'🧍',title:'姿勢リセット',text:'背筋を伸ばして10秒キープ',points:5,cat:'health'},
  {id:'ym094',icon:'🍚',title:'よく噛む',text:'最初の一口だけゆっくり味わう',points:5,cat:'food'},
  {id:'ym095',icon:'🌙',title:'夜のゆる伸び',text:'寝る前に首を左右に倒す',points:5,cat:'stretch'},
  {id:'ym096',icon:'👏',title:'誰か応援',text:'心の中で誰かにおつかれと言う',points:5,cat:'social'},
  {id:'ym097',icon:'🧦',title:'つま先上げ',text:'つま先を10回上げ下げする',points:5,cat:'health'},
  {id:'ym098',icon:'🛌',title:'回復宣言',text:'今日は無理しないと決める',points:5,cat:'rest'},
  {id:'ym099',icon:'🏠',title:'部屋ちょい歩き',text:'部屋の中を30秒だけ歩く',points:5,cat:'walk'},
  {id:'ym100',icon:'✨',title:'記録だけ＋',text:'運動ゼロでも気分だけ残す',points:5,cat:'memory'},
  {id:'ym101',icon:'🚶',title:'3分さんぽ',text:'外の空気を吸いながら3分だけ歩く',points:5,cat:'walk'},
  {id:'ym102',icon:'🧘',title:'肩まわし',text:'肩を前後に10回ずつ回す',points:5,cat:'stretch'},
  {id:'ym103',icon:'💧',title:'新年度リセット',text:'水をコップ1杯飲む',points:5,cat:'health'},
  {id:'ym104',icon:'🌿',title:'深呼吸',text:'ゆっくり深呼吸を3回する',points:5,cat:'mental'},
  {id:'ym105',icon:'🍜',title:'食後リセット',text:'食後に1分だけ立つ',points:5,cat:'food'},
  {id:'ym106',icon:'🪜',title:'階段チャレンジ',text:'1回だけ階段を使う',points:5,cat:'walk'},
  {id:'ym107',icon:'😴',title:'早寝準備',text:'寝る前にスマホを1分置く',points:5,cat:'rest'},
  {id:'ym108',icon:'🐼',title:'自分ほめ',text:'今日の自分を1つ褒める',points:5,cat:'mental'},
  {id:'ym109',icon:'🦶',title:'足首ぐるぐる',text:'足首を左右10回ずつ回す',points:5,cat:'stretch'},
  {id:'ym110',icon:'🚪',title:'玄関ミッション',text:'玄関の外に一歩だけ出る',points:5,cat:'walk'},
  {id:'ym111',icon:'🍵',title:'一息タイム＋',text:'温かい飲み物で一息つく',points:5,cat:'rest'},
  {id:'ym112',icon:'📸',title:'思い出メモ',text:'今日の気分を一言メモする',points:5,cat:'memory'},
  {id:'ym113',icon:'🧍',title:'姿勢リセット',text:'背筋を伸ばして10秒キープ',points:5,cat:'health'},
  {id:'ym114',icon:'🍚',title:'よく噛む',text:'最初の一口だけゆっくり味わう',points:5,cat:'food'},
  {id:'ym115',icon:'🌙',title:'夜のゆる伸び',text:'寝る前に首を左右に倒す',points:5,cat:'stretch'},
  {id:'ym116',icon:'👏',title:'誰か応援',text:'心の中で誰かにおつかれと言う',points:5,cat:'social'},
  {id:'ym117',icon:'🧦',title:'つま先上げ',text:'つま先を10回上げ下げする',points:5,cat:'health'},
  {id:'ym118',icon:'🛌',title:'回復宣言',text:'今日は無理しないと決める',points:5,cat:'rest'},
  {id:'ym119',icon:'🏠',title:'部屋ちょい歩き',text:'部屋の中を30秒だけ歩く',points:5,cat:'walk'},
  {id:'ym120',icon:'✨',title:'新しい道を1分歩く',text:'運動ゼロでも気分だけ残す',points:5,cat:'memory'},
  {id:'ym121',icon:'🚶',title:'3分さんぽ',text:'外の空気を吸いながら3分だけ歩く',points:5,cat:'walk'},
  {id:'ym122',icon:'🧘',title:'肩まわし＋',text:'肩を前後に10回ずつ回す',points:5,cat:'stretch'},
  {id:'ym123',icon:'💧',title:'水分チャージ',text:'水をコップ1杯飲む',points:5,cat:'health'},
  {id:'ym124',icon:'🌿',title:'深呼吸',text:'ゆっくり深呼吸を3回する',points:5,cat:'mental'},
  {id:'ym125',icon:'🍜',title:'食後リセット',text:'食後に1分だけ立つ',points:5,cat:'food'},
  {id:'ym126',icon:'🪜',title:'階段チャレンジ',text:'1回だけ階段を使う',points:5,cat:'walk'},
  {id:'ym127',icon:'😴',title:'早寝準備',text:'寝る前にスマホを1分置く',points:5,cat:'rest'},
  {id:'ym128',icon:'🐼',title:'自分ほめ',text:'今日の自分を1つ褒める',points:5,cat:'mental'},
  {id:'ym129',icon:'🦶',title:'足首ぐるぐる',text:'足首を左右10回ずつ回す',points:5,cat:'stretch'},
  {id:'ym130',icon:'🚪',title:'玄関ミッション',text:'玄関の外に一歩だけ出る',points:5,cat:'walk'},
  {id:'ym131',icon:'🍵',title:'一息タイム',text:'温かい飲み物で一息つく',points:5,cat:'rest'},
  {id:'ym132',icon:'📸',title:'思い出メモ',text:'今日の気分を一言メモする',points:5,cat:'memory'},
  {id:'ym133',icon:'🧍',title:'姿勢リセット＋',text:'背筋を伸ばして10秒キープ',points:5,cat:'health'},
  {id:'ym134',icon:'🍚',title:'よく噛む',text:'最初の一口だけゆっくり味わう',points:5,cat:'food'},
  {id:'ym135',icon:'🌙',title:'夜のゆる伸び',text:'寝る前に首を左右に倒す',points:5,cat:'stretch'},
  {id:'ym136',icon:'👏',title:'誰か応援',text:'心の中で誰かにおつかれと言う',points:5,cat:'social'},
  {id:'ym137',icon:'🧦',title:'新緑さんぽ',text:'つま先を10回上げ下げする',points:5,cat:'health'},
  {id:'ym138',icon:'🛌',title:'回復宣言',text:'今日は無理しないと決める',points:5,cat:'rest'},
  {id:'ym139',icon:'🏠',title:'部屋ちょい歩き',text:'部屋の中を30秒だけ歩く',points:5,cat:'walk'},
  {id:'ym140',icon:'✨',title:'記録だけ',text:'運動ゼロでも気分だけ残す',points:5,cat:'memory'},
  {id:'ym141',icon:'🚶',title:'3分さんぽ',text:'外の空気を吸いながら3分だけ歩く',points:5,cat:'walk'},
  {id:'ym142',icon:'🧘',title:'肩まわし',text:'肩を前後に10回ずつ回す',points:5,cat:'stretch'},
  {id:'ym143',icon:'💧',title:'水分チャージ',text:'水をコップ1杯飲む',points:5,cat:'health'},
  {id:'ym144',icon:'🌿',title:'深呼吸＋',text:'ゆっくり深呼吸を3回する',points:5,cat:'mental'},
  {id:'ym145',icon:'🍜',title:'食後リセット',text:'食後に1分だけ立つ',points:5,cat:'food'},
  {id:'ym146',icon:'🪜',title:'階段チャレンジ',text:'1回だけ階段を使う',points:5,cat:'walk'},
  {id:'ym147',icon:'😴',title:'早寝準備',text:'寝る前にスマホを1分置く',points:5,cat:'rest'},
  {id:'ym148',icon:'🐼',title:'自分ほめ',text:'今日の自分を1つ褒める',points:5,cat:'mental'},
  {id:'ym149',icon:'🦶',title:'足首ぐるぐる',text:'足首を左右10回ずつ回す',points:5,cat:'stretch'},
  {id:'ym150',icon:'🚪',title:'玄関ミッション',text:'玄関の外に一歩だけ出る',points:5,cat:'walk'},
  {id:'ym151',icon:'🍵',title:'一息タイム',text:'温かい飲み物で一息つく',points:5,cat:'rest'},
  {id:'ym152',icon:'📸',title:'思い出メモ',text:'今日の気分を一言メモする',points:5,cat:'memory'},
  {id:'ym153',icon:'🧍',title:'姿勢リセット',text:'背筋を伸ばして10秒キープ',points:5,cat:'health'},
  {id:'ym154',icon:'🍚',title:'雨音を聞きながら伸びる',text:'最初の一口だけゆっくり味わう',points:5,cat:'food'},
  {id:'ym155',icon:'🌙',title:'夜のゆる伸び＋',text:'寝る前に首を左右に倒す',points:5,cat:'stretch'},
  {id:'ym156',icon:'👏',title:'誰か応援',text:'心の中で誰かにおつかれと言う',points:5,cat:'social'},
  {id:'ym157',icon:'🧦',title:'つま先上げ',text:'つま先を10回上げ下げする',points:5,cat:'health'},
  {id:'ym158',icon:'🛌',title:'回復宣言',text:'今日は無理しないと決める',points:5,cat:'rest'},
  {id:'ym159',icon:'🏠',title:'部屋ちょい歩き',text:'部屋の中を30秒だけ歩く',points:5,cat:'walk'},
  {id:'ym160',icon:'✨',title:'記録だけ',text:'運動ゼロでも気分だけ残す',points:5,cat:'memory'},
  {id:'ym161',icon:'🚶',title:'3分さんぽ',text:'外の空気を吸いながら3分だけ歩く',points:5,cat:'walk'},
  {id:'ym162',icon:'🧘',title:'肩まわし',text:'肩を前後に10回ずつ回す',points:5,cat:'stretch'},
  {id:'ym163',icon:'💧',title:'水分チャージ',text:'水をコップ1杯飲む',points:5,cat:'health'},
  {id:'ym164',icon:'🌿',title:'深呼吸',text:'ゆっくり深呼吸を3回する',points:5,cat:'mental'},
  {id:'ym165',icon:'🍜',title:'食後リセット',text:'食後に1分だけ立つ',points:5,cat:'food'},
  {id:'ym166',icon:'🪜',title:'階段チャレンジ＋',text:'1回だけ階段を使う',points:5,cat:'walk'},
  {id:'ym167',icon:'😴',title:'早寝準備',text:'寝る前にスマホを1分置く',points:5,cat:'rest'},
  {id:'ym168',icon:'🐼',title:'自分ほめ',text:'今日の自分を1つ褒める',points:5,cat:'mental'},
  {id:'ym169',icon:'🦶',title:'足首ぐるぐる',text:'足首を左右10回ずつ回す',points:5,cat:'stretch'},
  {id:'ym170',icon:'🚪',title:'玄関ミッション',text:'玄関の外に一歩だけ出る',points:5,cat:'walk'},
  {id:'ym171',icon:'🍵',title:'梅雨の室内トレ',text:'温かい飲み物で一息つく',points:5,cat:'rest'},
  {id:'ym172',icon:'📸',title:'思い出メモ',text:'今日の気分を一言メモする',points:5,cat:'memory'},
  {id:'ym173',icon:'🧍',title:'姿勢リセット',text:'背筋を伸ばして10秒キープ',points:5,cat:'health'},
  {id:'ym174',icon:'🍚',title:'よく噛む',text:'最初の一口だけゆっくり味わう',points:5,cat:'food'},
  {id:'ym175',icon:'🌙',title:'夜のゆる伸び',text:'寝る前に首を左右に倒す',points:5,cat:'stretch'},
  {id:'ym176',icon:'👏',title:'誰か応援',text:'心の中で誰かにおつかれと言う',points:5,cat:'social'},
  {id:'ym177',icon:'🧦',title:'つま先上げ＋',text:'つま先を10回上げ下げする',points:5,cat:'health'},
  {id:'ym178',icon:'🛌',title:'回復宣言',text:'今日は無理しないと決める',points:5,cat:'rest'},
  {id:'ym179',icon:'🏠',title:'部屋ちょい歩き',text:'部屋の中を30秒だけ歩く',points:5,cat:'walk'},
  {id:'ym180',icon:'✨',title:'記録だけ',text:'運動ゼロでも気分だけ残す',points:5,cat:'memory'},
  {id:'ym181',icon:'🚶',title:'3分さんぽ',text:'外の空気を吸いながら3分だけ歩く',points:5,cat:'walk'},
  {id:'ym182',icon:'🧘',title:'肩まわし',text:'肩を前後に10回ずつ回す',points:5,cat:'stretch'},
  {id:'ym183',icon:'💧',title:'水分チャージ',text:'水をコップ1杯飲む',points:5,cat:'health'},
  {id:'ym184',icon:'🌿',title:'深呼吸',text:'ゆっくり深呼吸を3回する',points:5,cat:'mental'},
  {id:'ym185',icon:'🍜',title:'食後リセット',text:'食後に1分だけ立つ',points:5,cat:'food'},
  {id:'ym186',icon:'🪜',title:'階段チャレンジ',text:'1回だけ階段を使う',points:5,cat:'walk'},
  {id:'ym187',icon:'😴',title:'早寝準備',text:'寝る前にスマホを1分置く',points:5,cat:'rest'},
  {id:'ym188',icon:'🐼',title:'暑い日は休むのも勝ち',text:'今日の自分を1つ褒める',points:5,cat:'mental'},
  {id:'ym189',icon:'🦶',title:'足首ぐるぐる',text:'足首を左右10回ずつ回す',points:5,cat:'stretch'},
  {id:'ym190',icon:'🚪',title:'玄関ミッション',text:'玄関の外に一歩だけ出る',points:5,cat:'walk'},
  {id:'ym191',icon:'🍵',title:'一息タイム',text:'温かい飲み物で一息つく',points:5,cat:'rest'},
  {id:'ym192',icon:'📸',title:'思い出メモ',text:'今日の気分を一言メモする',points:5,cat:'memory'},
  {id:'ym193',icon:'🧍',title:'姿勢リセット',text:'背筋を伸ばして10秒キープ',points:5,cat:'health'},
  {id:'ym194',icon:'🍚',title:'よく噛む',text:'最初の一口だけゆっくり味わう',points:5,cat:'food'},
  {id:'ym195',icon:'🌙',title:'夜のゆる伸び',text:'寝る前に首を左右に倒す',points:5,cat:'stretch'},
  {id:'ym196',icon:'👏',title:'誰か応援',text:'心の中で誰かにおつかれと言う',points:5,cat:'social'},
  {id:'ym197',icon:'🧦',title:'つま先上げ',text:'つま先を10回上げ下げする',points:5,cat:'health'},
  {id:'ym198',icon:'🛌',title:'回復宣言',text:'今日は無理しないと決める',points:5,cat:'rest'},
  {id:'ym199',icon:'🏠',title:'部屋ちょい歩き＋',text:'部屋の中を30秒だけ歩く',points:5,cat:'walk'},
  {id:'ym200',icon:'✨',title:'記録だけ',text:'運動ゼロでも気分だけ残す',points:5,cat:'memory'},
  {id:'ym201',icon:'🚶',title:'3分さんぽ',text:'外の空気を吸いながら3分だけ歩く',points:5,cat:'walk'},
  {id:'ym202',icon:'🧘',title:'肩まわし',text:'肩を前後に10回ずつ回す',points:5,cat:'stretch'},
  {id:'ym203',icon:'💧',title:'水分チャージ',text:'水をコップ1杯飲む',points:5,cat:'health'},
  {id:'ym204',icon:'🌿',title:'深呼吸',text:'ゆっくり深呼吸を3回する',points:5,cat:'mental'},
  {id:'ym205',icon:'🍜',title:'夏の水分補給',text:'食後に1分だけ立つ',points:5,cat:'food'},
  {id:'ym206',icon:'🪜',title:'階段チャレンジ',text:'1回だけ階段を使う',points:5,cat:'walk'},
  {id:'ym207',icon:'😴',title:'早寝準備',text:'寝る前にスマホを1分置く',points:5,cat:'rest'},
  {id:'ym208',icon:'🐼',title:'自分ほめ',text:'今日の自分を1つ褒める',points:5,cat:'mental'},
  {id:'ym209',icon:'🦶',title:'足首ぐるぐる',text:'足首を左右10回ずつ回す',points:5,cat:'stretch'},
  {id:'ym210',icon:'🚪',title:'玄関ミッション＋',text:'玄関の外に一歩だけ出る',points:5,cat:'walk'},
  {id:'ym211',icon:'🍵',title:'一息タイム',text:'温かい飲み物で一息つく',points:5,cat:'rest'},
  {id:'ym212',icon:'📸',title:'思い出メモ',text:'今日の気分を一言メモする',points:5,cat:'memory'},
  {id:'ym213',icon:'🧍',title:'姿勢リセット',text:'背筋を伸ばして10秒キープ',points:5,cat:'health'},
  {id:'ym214',icon:'🍚',title:'よく噛む',text:'最初の一口だけゆっくり味わう',points:5,cat:'food'},
  {id:'ym215',icon:'🌙',title:'夜のゆる伸び',text:'寝る前に首を左右に倒す',points:5,cat:'stretch'},
  {id:'ym216',icon:'👏',title:'誰か応援',text:'心の中で誰かにおつかれと言う',points:5,cat:'social'},
  {id:'ym217',icon:'🧦',title:'つま先上げ',text:'つま先を10回上げ下げする',points:5,cat:'health'},
  {id:'ym218',icon:'🛌',title:'回復宣言',text:'今日は無理しないと決める',points:5,cat:'rest'},
  {id:'ym219',icon:'🏠',title:'部屋ちょい歩き',text:'部屋の中を30秒だけ歩く',points:5,cat:'walk'},
  {id:'ym220',icon:'✨',title:'記録だけ',text:'運動ゼロでも気分だけ残す',points:5,cat:'memory'},
  {id:'ym221',icon:'🚶',title:'3分さんぽ＋',text:'外の空気を吸いながら3分だけ歩く',points:5,cat:'walk'},
  {id:'ym222',icon:'🧘',title:'アイス後に1分立つ',text:'肩を前後に10回ずつ回す',points:5,cat:'stretch'},
  {id:'ym223',icon:'💧',title:'水分チャージ',text:'水をコップ1杯飲む',points:5,cat:'health'},
  {id:'ym224',icon:'🌿',title:'深呼吸',text:'ゆっくり深呼吸を3回する',points:5,cat:'mental'},
  {id:'ym225',icon:'🍜',title:'食後リセット',text:'食後に1分だけ立つ',points:5,cat:'food'},
  {id:'ym226',icon:'🪜',title:'階段チャレンジ',text:'1回だけ階段を使う',points:5,cat:'walk'},
  {id:'ym227',icon:'😴',title:'早寝準備',text:'寝る前にスマホを1分置く',points:5,cat:'rest'},
  {id:'ym228',icon:'🐼',title:'自分ほめ',text:'今日の自分を1つ褒める',points:5,cat:'mental'},
  {id:'ym229',icon:'🦶',title:'足首ぐるぐる',text:'足首を左右10回ずつ回す',points:5,cat:'stretch'},
  {id:'ym230',icon:'🚪',title:'玄関ミッション',text:'玄関の外に一歩だけ出る',points:5,cat:'walk'},
  {id:'ym231',icon:'🍵',title:'一息タイム',text:'温かい飲み物で一息つく',points:5,cat:'rest'},
  {id:'ym232',icon:'📸',title:'思い出メモ＋',text:'今日の気分を一言メモする',points:5,cat:'memory'},
  {id:'ym233',icon:'🧍',title:'姿勢リセット',text:'背筋を伸ばして10秒キープ',points:5,cat:'health'},
  {id:'ym234',icon:'🍚',title:'よく噛む',text:'最初の一口だけゆっくり味わう',points:5,cat:'food'},
  {id:'ym235',icon:'🌙',title:'夜のゆる伸び',text:'寝る前に首を左右に倒す',points:5,cat:'stretch'},
  {id:'ym236',icon:'👏',title:'誰か応援',text:'心の中で誰かにおつかれと言う',points:5,cat:'social'},
  {id:'ym237',icon:'🧦',title:'つま先上げ',text:'つま先を10回上げ下げする',points:5,cat:'health'},
  {id:'ym238',icon:'🛌',title:'回復宣言',text:'今日は無理しないと決める',points:5,cat:'rest'},
  {id:'ym239',icon:'🏠',title:'真夏の涼みトレ',text:'部屋の中を30秒だけ歩く',points:5,cat:'walk'},
  {id:'ym240',icon:'✨',title:'記録だけ',text:'運動ゼロでも気分だけ残す',points:5,cat:'memory'},
  {id:'ym241',icon:'🚶',title:'3分さんぽ',text:'外の空気を吸いながら3分だけ歩く',points:5,cat:'walk'},
  {id:'ym242',icon:'🧘',title:'肩まわし',text:'肩を前後に10回ずつ回す',points:5,cat:'stretch'},
  {id:'ym243',icon:'💧',title:'水分チャージ＋',text:'水をコップ1杯飲む',points:5,cat:'health'},
  {id:'ym244',icon:'🌿',title:'深呼吸',text:'ゆっくり深呼吸を3回する',points:5,cat:'mental'},
  {id:'ym245',icon:'🍜',title:'食後リセット',text:'食後に1分だけ立つ',points:5,cat:'food'},
  {id:'ym246',icon:'🪜',title:'階段チャレンジ',text:'1回だけ階段を使う',points:5,cat:'walk'},
  {id:'ym247',icon:'😴',title:'早寝準備',text:'寝る前にスマホを1分置く',points:5,cat:'rest'},
  {id:'ym248',icon:'🐼',title:'自分ほめ',text:'今日の自分を1つ褒める',points:5,cat:'mental'},
  {id:'ym249',icon:'🦶',title:'足首ぐるぐる',text:'足首を左右10回ずつ回す',points:5,cat:'stretch'},
  {id:'ym250',icon:'🚪',title:'玄関ミッション',text:'玄関の外に一歩だけ出る',points:5,cat:'walk'},
  {id:'ym251',icon:'🍵',title:'一息タイム',text:'温かい飲み物で一息つく',points:5,cat:'rest'},
  {id:'ym252',icon:'📸',title:'思い出メモ',text:'今日の気分を一言メモする',points:5,cat:'memory'},
  {id:'ym253',icon:'🧍',title:'姿勢リセット',text:'背筋を伸ばして10秒キープ',points:5,cat:'health'},
  {id:'ym254',icon:'🍚',title:'よく噛む＋',text:'最初の一口だけゆっくり味わう',points:5,cat:'food'},
  {id:'ym255',icon:'🌙',title:'夜のゆる伸び',text:'寝る前に首を左右に倒す',points:5,cat:'stretch'},
  {id:'ym256',icon:'👏',title:'夏疲れをゆっくり回復',text:'心の中で誰かにおつかれと言う',points:5,cat:'social'},
  {id:'ym257',icon:'🧦',title:'つま先上げ',text:'つま先を10回上げ下げする',points:5,cat:'health'},
  {id:'ym258',icon:'🛌',title:'回復宣言',text:'今日は無理しないと決める',points:5,cat:'rest'},
  {id:'ym259',icon:'🏠',title:'部屋ちょい歩き',text:'部屋の中を30秒だけ歩く',points:5,cat:'walk'},
  {id:'ym260',icon:'✨',title:'記録だけ',text:'運動ゼロでも気分だけ残す',points:5,cat:'memory'},
  {id:'ym261',icon:'🚶',title:'3分さんぽ',text:'外の空気を吸いながら3分だけ歩く',points:5,cat:'walk'},
  {id:'ym262',icon:'🧘',title:'肩まわし',text:'肩を前後に10回ずつ回す',points:5,cat:'stretch'},
  {id:'ym263',icon:'💧',title:'水分チャージ',text:'水をコップ1杯飲む',points:5,cat:'health'},
  {id:'ym264',icon:'🌿',title:'深呼吸',text:'ゆっくり深呼吸を3回する',points:5,cat:'mental'},
  {id:'ym265',icon:'🍜',title:'食後リセット＋',text:'食後に1分だけ立つ',points:5,cat:'food'},
  {id:'ym266',icon:'🪜',title:'階段チャレンジ',text:'1回だけ階段を使う',points:5,cat:'walk'},
  {id:'ym267',icon:'😴',title:'早寝準備',text:'寝る前にスマホを1分置く',points:5,cat:'rest'},
  {id:'ym268',icon:'🐼',title:'自分ほめ',text:'今日の自分を1つ褒める',points:5,cat:'mental'},
  {id:'ym269',icon:'🦶',title:'足首ぐるぐる',text:'足首を左右10回ずつ回す',points:5,cat:'stretch'},
  {id:'ym270',icon:'🚪',title:'玄関ミッション',text:'玄関の外に一歩だけ出る',points:5,cat:'walk'},
  {id:'ym271',icon:'🍵',title:'一息タイム',text:'温かい飲み物で一息つく',points:5,cat:'rest'},
  {id:'ym272',icon:'📸',title:'思い出メモ',text:'今日の気分を一言メモする',points:5,cat:'memory'},
  {id:'ym273',icon:'🧍',title:'食欲の秋リセット',text:'背筋を伸ばして10秒キープ',points:5,cat:'health'},
  {id:'ym274',icon:'🍚',title:'よく噛む',text:'最初の一口だけゆっくり味わう',points:5,cat:'food'},
  {id:'ym275',icon:'🌙',title:'夜のゆる伸び',text:'寝る前に首を左右に倒す',points:5,cat:'stretch'},
  {id:'ym276',icon:'👏',title:'誰か応援＋',text:'心の中で誰かにおつかれと言う',points:5,cat:'social'},
  {id:'ym277',icon:'🧦',title:'つま先上げ',text:'つま先を10回上げ下げする',points:5,cat:'health'},
  {id:'ym278',icon:'🛌',title:'回復宣言',text:'今日は無理しないと決める',points:5,cat:'rest'},
  {id:'ym279',icon:'🏠',title:'部屋ちょい歩き',text:'部屋の中を30秒だけ歩く',points:5,cat:'walk'},
  {id:'ym280',icon:'✨',title:'記録だけ',text:'運動ゼロでも気分だけ残す',points:5,cat:'memory'},
  {id:'ym281',icon:'🚶',title:'3分さんぽ',text:'外の空気を吸いながら3分だけ歩く',points:5,cat:'walk'},
  {id:'ym282',icon:'🧘',title:'肩まわし',text:'肩を前後に10回ずつ回す',points:5,cat:'stretch'},
  {id:'ym283',icon:'💧',title:'水分チャージ',text:'水をコップ1杯飲む',points:5,cat:'health'},
  {id:'ym284',icon:'🌿',title:'深呼吸',text:'ゆっくり深呼吸を3回する',points:5,cat:'mental'},
  {id:'ym285',icon:'🍜',title:'食後リセット',text:'食後に1分だけ立つ',points:5,cat:'food'},
  {id:'ym286',icon:'🪜',title:'階段チャレンジ',text:'1回だけ階段を使う',points:5,cat:'walk'},
  {id:'ym287',icon:'😴',title:'早寝準備＋',text:'寝る前にスマホを1分置く',points:5,cat:'rest'},
  {id:'ym288',icon:'🐼',title:'自分ほめ',text:'今日の自分を1つ褒める',points:5,cat:'mental'},
  {id:'ym289',icon:'🦶',title:'足首ぐるぐる',text:'足首を左右10回ずつ回す',points:5,cat:'stretch'},
  {id:'ym290',icon:'🚪',title:'ハロウィン前に肩回し',text:'玄関の外に一歩だけ出る',points:5,cat:'walk'},
  {id:'ym291',icon:'🍵',title:'一息タイム',text:'温かい飲み物で一息つく',points:5,cat:'rest'},
  {id:'ym292',icon:'📸',title:'思い出メモ',text:'今日の気分を一言メモする',points:5,cat:'memory'},
  {id:'ym293',icon:'🧍',title:'姿勢リセット',text:'背筋を伸ばして10秒キープ',points:5,cat:'health'},
  {id:'ym294',icon:'🍚',title:'よく噛む',text:'最初の一口だけゆっくり味わう',points:5,cat:'food'},
  {id:'ym295',icon:'🌙',title:'夜のゆる伸び',text:'寝る前に首を左右に倒す',points:5,cat:'stretch'},
  {id:'ym296',icon:'👏',title:'誰か応援',text:'心の中で誰かにおつかれと言う',points:5,cat:'social'},
  {id:'ym297',icon:'🧦',title:'つま先上げ',text:'つま先を10回上げ下げする',points:5,cat:'health'},
  {id:'ym298',icon:'🛌',title:'回復宣言＋',text:'今日は無理しないと決める',points:5,cat:'rest'},
  {id:'ym299',icon:'🏠',title:'部屋ちょい歩き',text:'部屋の中を30秒だけ歩く',points:5,cat:'walk'},
  {id:'ym300',icon:'✨',title:'記録だけ',text:'運動ゼロでも気分だけ残す',points:5,cat:'memory'},
  {id:'ym301',icon:'🚶',title:'3分さんぽ',text:'外の空気を吸いながら3分だけ歩く',points:5,cat:'walk'},
  {id:'ym302',icon:'🧘',title:'肩まわし',text:'肩を前後に10回ずつ回す',points:5,cat:'stretch'},
  {id:'ym303',icon:'💧',title:'水分チャージ',text:'水をコップ1杯飲む',points:5,cat:'health'},
  {id:'ym304',icon:'🌿',title:'深呼吸',text:'ゆっくり深呼吸を3回する',points:5,cat:'mental'},
  {id:'ym305',icon:'🍜',title:'食後リセット',text:'食後に1分だけ立つ',points:5,cat:'food'},
  {id:'ym306',icon:'🪜',title:'階段チャレンジ',text:'1回だけ階段を使う',points:5,cat:'walk'},
  {id:'ym307',icon:'😴',title:'冷え対策ほぐし',text:'寝る前にスマホを1分置く',points:5,cat:'rest'},
  {id:'ym308',icon:'🐼',title:'自分ほめ',text:'今日の自分を1つ褒める',points:5,cat:'mental'},
  {id:'ym309',icon:'🦶',title:'足首ぐるぐる＋',text:'足首を左右10回ずつ回す',points:5,cat:'stretch'},
  {id:'ym310',icon:'🚪',title:'玄関ミッション',text:'玄関の外に一歩だけ出る',points:5,cat:'walk'},
  {id:'ym311',icon:'🍵',title:'一息タイム',text:'温かい飲み物で一息つく',points:5,cat:'rest'},
  {id:'ym312',icon:'📸',title:'思い出メモ',text:'今日の気分を一言メモする',points:5,cat:'memory'},
  {id:'ym313',icon:'🧍',title:'姿勢リセット',text:'背筋を伸ばして10秒キープ',points:5,cat:'health'},
  {id:'ym314',icon:'🍚',title:'よく噛む',text:'最初の一口だけゆっくり味わう',points:5,cat:'food'},
  {id:'ym315',icon:'🌙',title:'夜のゆる伸び',text:'寝る前に首を左右に倒す',points:5,cat:'stretch'},
  {id:'ym316',icon:'👏',title:'誰か応援',text:'心の中で誰かにおつかれと言う',points:5,cat:'social'},
  {id:'ym317',icon:'🧦',title:'つま先上げ',text:'つま先を10回上げ下げする',points:5,cat:'health'},
  {id:'ym318',icon:'🛌',title:'回復宣言',text:'今日は無理しないと決める',points:5,cat:'rest'},
  {id:'ym319',icon:'🏠',title:'部屋ちょい歩き',text:'部屋の中を30秒だけ歩く',points:5,cat:'walk'},
  {id:'ym320',icon:'✨',title:'記録だけ＋',text:'運動ゼロでも気分だけ残す',points:5,cat:'memory'},
  {id:'ym321',icon:'🚶',title:'3分さんぽ',text:'外の空気を吸いながら3分だけ歩く',points:5,cat:'walk'},
  {id:'ym322',icon:'🧘',title:'肩まわし',text:'肩を前後に10回ずつ回す',points:5,cat:'stretch'},
  {id:'ym323',icon:'💧',title:'水分チャージ',text:'水をコップ1杯飲む',points:5,cat:'health'},
  {id:'ym324',icon:'🌿',title:'年末前のゆる準備',text:'ゆっくり深呼吸を3回する',points:5,cat:'mental'},
  {id:'ym325',icon:'🍜',title:'食後リセット',text:'食後に1分だけ立つ',points:5,cat:'food'},
  {id:'ym326',icon:'🪜',title:'階段チャレンジ',text:'1回だけ階段を使う',points:5,cat:'walk'},
  {id:'ym327',icon:'😴',title:'早寝準備',text:'寝る前にスマホを1分置く',points:5,cat:'rest'},
  {id:'ym328',icon:'🐼',title:'自分ほめ',text:'今日の自分を1つ褒める',points:5,cat:'mental'},
  {id:'ym329',icon:'🦶',title:'足首ぐるぐる',text:'足首を左右10回ずつ回す',points:5,cat:'stretch'},
  {id:'ym330',icon:'🚪',title:'玄関ミッション',text:'玄関の外に一歩だけ出る',points:5,cat:'walk'},
  {id:'ym331',icon:'🍵',title:'一息タイム＋',text:'温かい飲み物で一息つく',points:5,cat:'rest'},
  {id:'ym332',icon:'📸',title:'思い出メモ',text:'今日の気分を一言メモする',points:5,cat:'memory'},
  {id:'ym333',icon:'🧍',title:'姿勢リセット',text:'背筋を伸ばして10秒キープ',points:5,cat:'health'},
  {id:'ym334',icon:'🍚',title:'よく噛む',text:'最初の一口だけゆっくり味わう',points:5,cat:'food'},
  {id:'ym335',icon:'🌙',title:'夜のゆる伸び',text:'寝る前に首を左右に倒す',points:5,cat:'stretch'},
  {id:'ym336',icon:'👏',title:'誰か応援',text:'心の中で誰かにおつかれと言う',points:5,cat:'social'},
  {id:'ym337',icon:'🧦',title:'つま先上げ',text:'つま先を10回上げ下げする',points:5,cat:'health'},
  {id:'ym338',icon:'🛌',title:'回復宣言',text:'今日は無理しないと決める',points:5,cat:'rest'},
  {id:'ym339',icon:'🏠',title:'部屋ちょい歩き',text:'部屋の中を30秒だけ歩く',points:5,cat:'walk'},
  {id:'ym340',icon:'✨',title:'記録だけ',text:'運動ゼロでも気分だけ残す',points:5,cat:'memory'},
  {id:'ym341',icon:'🚶',title:'今年の自分に拍手',text:'外の空気を吸いながら3分だけ歩く',points:5,cat:'walk'},
  {id:'ym342',icon:'🧘',title:'肩まわし＋',text:'肩を前後に10回ずつ回す',points:5,cat:'stretch'},
  {id:'ym343',icon:'💧',title:'水分チャージ',text:'水をコップ1杯飲む',points:5,cat:'health'},
  {id:'ym344',icon:'🌿',title:'深呼吸',text:'ゆっくり深呼吸を3回する',points:5,cat:'mental'},
  {id:'ym345',icon:'🍜',title:'食後リセット',text:'食後に1分だけ立つ',points:5,cat:'food'},
  {id:'ym346',icon:'🪜',title:'階段チャレンジ',text:'1回だけ階段を使う',points:5,cat:'walk'},
  {id:'ym347',icon:'😴',title:'早寝準備',text:'寝る前にスマホを1分置く',points:5,cat:'rest'},
  {id:'ym348',icon:'🐼',title:'自分ほめ',text:'今日の自分を1つ褒める',points:5,cat:'mental'},
  {id:'ym349',icon:'🦶',title:'足首ぐるぐる',text:'足首を左右10回ずつ回す',points:5,cat:'stretch'},
  {id:'ym350',icon:'🚪',title:'玄関ミッション',text:'玄関の外に一歩だけ出る',points:5,cat:'walk'},
  {id:'ym351',icon:'🍵',title:'一息タイム',text:'温かい飲み物で一息つく',points:5,cat:'rest'},
  {id:'ym352',icon:'📸',title:'思い出メモ',text:'今日の気分を一言メモする',points:5,cat:'memory'},
  {id:'ym353',icon:'🧍',title:'姿勢リセット＋',text:'背筋を伸ばして10秒キープ',points:5,cat:'health'},
  {id:'ym354',icon:'🍚',title:'よく噛む',text:'最初の一口だけゆっくり味わう',points:5,cat:'food'},
  {id:'ym355',icon:'🌙',title:'夜のゆる伸び',text:'寝る前に首を左右に倒す',points:5,cat:'stretch'},
  {id:'ym356',icon:'👏',title:'誰か応援',text:'心の中で誰かにおつかれと言う',points:5,cat:'social'},
  {id:'ym357',icon:'🧦',title:'つま先上げ',text:'つま先を10回上げ下げする',points:5,cat:'health'},
  {id:'ym358',icon:'🛌',title:'忙しい日は30秒で合格',text:'今日は無理しないと決める',points:5,cat:'rest'},
  {id:'ym359',icon:'🏠',title:'部屋ちょい歩き',text:'部屋の中を30秒だけ歩く',points:5,cat:'walk'},
  {id:'ym360',icon:'✨',title:'記録だけ',text:'運動ゼロでも気分だけ残す',points:5,cat:'memory'},
  {id:'ym361',icon:'🚶',title:'3分さんぽ',text:'外の空気を吸いながら3分だけ歩く',points:5,cat:'walk'},
  {id:'ym362',icon:'🧘',title:'肩まわし',text:'肩を前後に10回ずつ回す',points:5,cat:'stretch'},
  {id:'ym363',icon:'💧',title:'水分チャージ',text:'水をコップ1杯飲む',points:5,cat:'health'},
  {id:'ym364',icon:'🌿',title:'深呼吸＋',text:'ゆっくり深呼吸を3回する',points:5,cat:'mental'},
  {id:'ym365',icon:'🍜',title:'食後リセット',text:'食後に1分だけ立つ',points:5,cat:'food'}
];

function daily365Mission(date=new Date()){
  const idx=(getDayOfYear(date)-1)%DAILY_365_MISSIONS.length;
  const m=DAILY_365_MISSIONS[idx];
  return {...m, day:idx+1, total:DAILY_365_MISSIONS.length};
}
function missionDayKey(date=new Date()){
  return dk(date);
}
function missionDoneToday(state,date=new Date()){
  const key=missionDayKey(date);
  return !!(state.completedMissions||{})[key];
}
function missionCount(state){
  return Object.keys(state.completedMissions||{}).length;
}
function pandaPointCount(state){
  return state.pandaPoints||0;
}



const PRAISE_MESSAGES={
  walk:[
    '今日も歩けたのえらい！足も心もちゃんと前に進んでるよ🐼',
    'その一歩、未来の自分がめっちゃ感謝してる！',
    'ゆっくりでもOK！続けてるのが本当にすごい✨',
    '外に出ただけでも今日は大優勝☀️',
    '歩いた分だけ、ちゃんとリフレッシュできてるよ！',
    'ナイスおさんぽ！パンダも後ろでついて行ってた🐼',
    '今日も“0じゃない”のが本当に偉い！',
    '景色見ながら歩くの、最高のゆるトレだね🌿',
    '疲れる前に終われたのもセンスある！',
    '今日の君、ちゃんと健康ポイント積んでる✨',
  ],
  run:[
    '走った自分、かなりすごい！🏃‍♂️',
    '速さより“やった”が大優勝✨',
    '今日もちゃんと前に進めてるよ🐼',
    'その汗、未来の自分への投資だ！',
    'ナイスラン！パンダは途中でバテてた🐼💦',
    '短くても走れた時点で強い！',
    '呼吸を整えながら走れたの最高👏',
    '今日は気持ちよく走れた？それが一番大事！',
    'ちゃんと継続してるの、本当にかっこいい✨',
    '無理しすぎないランニング、かなり理想的！',
  ],
  gym:[
    'ジム行けた時点で今日は勝ち💪',
    'マシン1個でも十分えらい！',
    'その継続力、かなり強い🐼',
    '今日も未来の自分を育成中だね✨',
    'ちゃんと体動かしてるの最高！',
    'ナイス筋トレ！パンダは休憩多めだった🐼',
    '少しでもやれたなら100点！',
    '続けてる人が最後に勝つんだよね🏋️',
    '今日も“やる気待ち”に勝利👏',
    '追い込みすぎないのも大事な才能✨',
  ],
  home:[
    '家で動けたの天才すぎる🐼',
    '誘惑だらけの中でよくやった！',
    '5分でもやれたら今日は成功✨',
    '自宅トレ継続勢、かなり強い💪',
    'ベッドの誘惑に勝ったね👏',
    'ちゃんと体動かしててえらい！',
    '動画再生した時点で優勝🏆',
    'ゆるく続けるのが一番すごい！',
    '今日もコツコツ積み上げてるね🐼',
    '“少しだけやる”って実は最強✨',
  ],
  stretch:[
    '今日も体を大事にできてえらい🌿',
    'ほぐせたの最高！体が喜んでる✨',
    '深呼吸できただけでもナイス🐼',
    '回復するのも立派なトレーニング！',
    'ストレッチ勢、未来で差が出る👏',
    '無理しない運動、かなり理想的！',
    '今日の体、少し軽くなったかも✨',
    'ちゃんと自分をいたわれてるね🐼',
    'コリを倒した！経験値アップ⬆️',
    'ゆっくり整える日も大切🌿',
  ],
  other:[
    '今日は自由枠！ピザでもOK🍕',
    'ラーメン全マシマシ、おつかれさま🍜🐼',
    '海外旅行中かな？移動だけで運動説✈️',
    '今日は“好き勝手DAY”ってことで✨',
    'ファミチキ食べた？タンパク質だからOK🐼',
    'ゲームしながらでもアプリ開いたの偉い🎮',
    'Netflix止まらない日、あるよね📺',
    '今日は布団が離してくれなかったか〜🐼',
    'アイス食べながら見るゆるトレ、最高🍨',
    '戻ってきてくれただけでパンダ大歓喜🐼🎉',
  ],
};
function pickPraiseMessage(aid){
  const list=PRAISE_MESSAGES[aid]||PRAISE_MESSAGES.other;
  return list[Math.floor(Math.random()*list.length)];
}




/* ═══════════════ 【v38新規追加】パンジローの全力リアクション ═══════════════
   運動を記録した瞬間に「パンジローが全力で褒めに来る」ための定義。
   ・新しい保存データ・localStorageキーは一切増やしていません（すべてその場で抽選）
   ・文章は1〜3行の短文のみ。責める/煽る/比較する表現は入れません
   ・anim は CSS の .pj-a-* に対応（transform中心の軽量アニメ）                */

/* 通常リアクション（7種） */
const PJ_NORMAL=[
  {id:'jump',   anim:'jump',  pose:'happy', tag:'ジャンプ',   lines:['やったーーー！！🐼']},
  {id:'clap',   anim:'clap',  pose:'happy', tag:'拍手',       lines:['えらい！えらすぎる！'],props:{l:'👏',r:'👏'}},
  {id:'dash',   anim:'dash',  pose:'happy', tag:'ダッシュ',   lines:['運動したって聞いて','飛んできた！！'],props:{l:'💨'}},
  {id:'zoom',   anim:'zoom',  pose:'happy', tag:'ドアップ',   lines:['ちょっと待って……','えらくない？'],big:true},
  {id:'roll',   anim:'roll',  pose:'happy', tag:'ゴロゴロ',   lines:['嬉しくて転がっちゃう']},
  {id:'guts',   anim:'guts',  pose:'normal',tag:'ガッツポーズ',lines:['今日も一歩進んだね！'],props:{r:'✊'}},
  {id:'banzai', anim:'banzai',pose:'happy', tag:'万歳',       lines:['今日の自分、優勝〜！'],props:{l:'🙌',r:'🙌'}},
];

/* 運動種類別リアクション（6種／ACTSのidと対応） */
const PJ_BY_ACT={
  walk:   {id:'act_walk',   anim:'walk',   pose:'normal',tag:'おさんぽ',  props:{r:'🚶'},lines:['歩いたの！？','それだけでも十分えらい！'],alt:[['今日は何歩分の','冒険したの〜？']]},
  run:    {id:'act_run',    anim:'pant',   pose:'happy', tag:'ラン',      props:{l:'💨',r:'🏃'},lines:['待って……速い……！'],alt:[['走ったの！？','今日はもう優勝！']]},
  stretch:{id:'act_stretch',anim:'stretch',pose:'normal',tag:'ストレッチ',props:{top:'🧘'},lines:['のび〜〜〜🐼'],alt:[['体ほぐしただけでも','大成功！']]},
  gym:    {id:'act_gym',    anim:'lift',   pose:'normal',tag:'ジム',      props:{l:'🏋️',r:'💪'},lines:['筋肉さん、','おつかれさまです！'],alt:[['ガチ勢……じゃなくて、','ゆる勢発見！']]},
  home:   {id:'act_home',   anim:'tiny',   pose:'normal',tag:'自宅トレ',  props:{r:'🏠'},lines:['家でやったの！？','それ一番えらいやつ！'],alt:[['おうちでこっそり、','一番むずかしいのに！']]},
  other:  {id:'act_other',  anim:'guts',   pose:'happy', tag:'ゆるトレ',  props:{top:'✨'},lines:['何したかより、','動いたことが大事！'],alt:[['それも立派な','ゆるトレだよ〜']]},
};

/* 時間帯リアクション（4種） */
const PJ_BY_TIME={
  morning:{id:'t_morning',anim:'banzai',pose:'happy', tag:'朝',  props:{top:'☀️'},lines:['朝から動いたの！？','今日はいい日になるぞ〜']},
  noon:   {id:'t_noon',   anim:'walk',  pose:'happy', tag:'昼',  props:{top:'🌤'},lines:['昼に運動！','いい流れだね〜']},
  night:  {id:'t_night',  anim:'sway',  pose:'sleepy',tag:'夜',  props:{top:'🌙'},lines:['こんな時間に動いたの！？','えらい！もう寝よ〜']},
  deep:   {id:'t_deep',   anim:'sway',  pose:'sleepy',tag:'深夜',props:{top:'😴'},lines:['まさか今運動したの！？','すごいけど無理はしないでね🐼']},
};

/* 久しぶりリアクション（3種・絶対に責めない） */
const PJ_COMEBACK=[
  {id:'cb_dash', anim:'dash', pose:'happy',tag:'おかえり',props:{l:'💨'},lines:['おかえりーーー！！🐼']},
  {id:'cb_tears',anim:'guts', pose:'happy',tag:'おかえり',props:{r:'🥹'},lines:['待ってたよ！','でも休んでたのも全然OK！']},
  {id:'cb_hug',  anim:'jump', pose:'happy',tag:'おかえり',props:{top:'💗'},lines:['久しぶりでも、今日動いた。','それが最高！']},
];

/* レアリアクション（約25%） */
const PJ_RARE=[
  {id:'r_passby',anim:'passby',pose:'happy', tag:'レア',props:{l:'💨'},lines:['ごめん！','嬉しすぎて通り過ぎた！']},
  {id:'r_news',  anim:'zoom',  pose:'normal',tag:'レア',big:true,lines:['速報です。','今日、運動した人がいます。','あなたです。']},
  {id:'r_extra', anim:'jump',  pose:'happy', tag:'レア',props:{l:'🎉',r:'🎉'},lines:['パンジロー臨時ニュース！','本日も運動が確認されました！']},
  {id:'r_wake',  anim:'wake',  pose:'sleepy',tag:'レア',props:{top:'💤'},lines:['えっ！？','運動した！？']},
];

/* 激レアリアクション（約5%・紙吹雪あり。派手すぎないよう短く） */
const PJ_ULTRA=[
  {id:'u_crown',   anim:'crown',pose:'happy',tag:'激レア',confetti:true,props:{top:'👑'},lines:['本日のMVP、','決まりました。','あなたです🐼']},
  {id:'u_parade',  anim:'jump', pose:'happy',tag:'激レア',confetti:true,props:{l:'🎊',r:'🎊'},lines:['わーーーっ！！','今日はお祭りだ〜！']},
  {id:'u_speechless',anim:'sway',pose:'happy',tag:'激レア',confetti:true,props:{top:'✨'},lines:['パンジロー、感動のあまり','言葉が出ない……']},
];

/* 節目リアクション（連続記録の節目だけ特別。切れてもネガティブ表示はしない） */
const PJ_MILESTONES={
  3:  {id:'m3',  anim:'guts',  pose:'happy',tag:'3日',  props:{top:'🌱'},lines:['3日そろったよ！','いい感じのゆるさ〜']},
  7:  {id:'m7',  anim:'banzai',pose:'happy',tag:'7日',  props:{l:'🎉',r:'🎉'},lines:['7回も積み重なったよ！','頑張りすぎてないのに続いてる。','これ理想！']},
  10: {id:'m10', anim:'jump',  pose:'happy',tag:'10日', props:{top:'🌟'},lines:['10回だって！','数えてたのパンジローです']},
  30: {id:'m30', anim:'crown', pose:'happy',tag:'30日', confetti:true,props:{top:'🧣'},lines:['30回……','しれっとすごいことしてるよ']},
  50: {id:'m50', anim:'crown', pose:'happy',tag:'50日', confetti:true,props:{top:'🏅'},lines:['50回！','もう生活の一部だね〜']},
  100:{id:'m100',anim:'crown', pose:'happy',tag:'100日',confetti:true,props:{top:'👑'},lines:['100回。','言葉にならないよ🐼']},
};

/* 【v38.1新規追加】リアクション専用のパンジロー素材。
   部屋用(assets/panda-room/v30/panda30_*.webp)は1536x1024の部屋レイヤーで、
   パンダ本体が画面幅の約16%しかないため大きく表示できなかった。
   ここでは本体だけを切り出した軽量素材(合計約98KB)を使う。
   読み込めない場合は normal → 絵文字🐼 の順に安全にフォールバックする。 */
const PJ38_DIR='assets/panda-room/v38/';
const PJ38={normal:'pj38_normal.webp',happy:'pj38_happy.webp',sleepy:'pj38_sleepy.webp',ramen:'pj38_ramen.webp'};

const pjRand=arr=>arr[Math.floor(Math.random()*arr.length)];
function pjTimeBand(h){
  if(h>=5&&h<11)return 'morning';
  if(h>=11&&h<17)return 'noon';
  if(h>=17&&h<23)return 'night';
  return 'deep';
}
/* 種目別リアクションはセリフのバリエーションをその場で差し替える */
function pjWithAltLines(base){
  if(!base)return base;
  const pool=[base.lines].concat(base.alt||[]);
  return {...base,lines:pjRand(pool)};
}

/* リアクション抽選。
   優先順位: 節目 → 久しぶり → 激レア(5%) → レア(25%) → 通常(種目/時間帯/汎用)
   ※完全ランダムではなく、運動種類・時間帯・継続状態で出方が変わる */
function pickPanjiroReaction({aid,streak,ds,isComeback,hour}){
  const h=(hour===undefined?new Date().getHours():hour);
  if(streak&&PJ_MILESTONES[streak])return {...PJ_MILESTONES[streak],kind:'milestone'};
  if(isComeback)return {...pjRand(PJ_COMEBACK),kind:'comeback'};
  const r=Math.random();
  if(r<0.05)return {...pjRand(PJ_ULTRA),kind:'ultra'};
  if(r<0.30)return {...pjRand(PJ_RARE),kind:'rare'};
  const band=pjTimeBand(h);
  // 深夜・夜は時間帯リアクションを出やすくする（深夜は煽らない文言のみ）
  const timeWeight=(band==='deep')?0.55:(band==='night'?0.35:0.2);
  const r2=Math.random();
  if(r2<timeWeight)return {...PJ_BY_TIME[band],kind:'time'};
  if(r2<timeWeight+0.45){
    const act=PJ_BY_ACT[aid]||PJ_BY_ACT.other;
    return {...pjWithAltLines(act),kind:'act'};
  }
  return {...pjRand(PJ_NORMAL),kind:'normal'};
}

/* パンジローが覚えていてくれる「ひとこと」。
   監視感を出さないよう短文・1つだけ・毎回は出さない。 */
function pjMemoryLine({prevReports,aid,ds}){
  const rs=prevReports||[];
  const label=(ACTS.find(a=>a.id===aid)||{}).label||'運動';
  const cands=[];
  const prev=rs.length?rs[rs.length-1]:null;
  if(prev&&prev.aid===aid)cands.push(`この前も${label}だったね！`);
  const now=new Date();
  const monthN=rs.filter(r=>{const d=new Date(r.ts);return d.getFullYear()===now.getFullYear()&&d.getMonth()===now.getMonth();}).length+1;
  if(monthN>=3)cands.push(`今月もう${monthN}回目だよ。地味にすごい！`);
  const recent=rs.slice(-5);
  if(recent.length>=3&&recent.filter(r=>r.aid===aid).length>=3)cands.push(`最近${label}多いね〜！`);
  if(ds>=2&&ds<4)cands.push('また会えてうれしい！');
  if(rs.length===0)cands.push('はじめての記録、ちゃんと見てたよ🐼');
  if(!cands.length)return null;
  return Math.random()<0.7?pjRand(cands):null;
}

const YURU_REACTIONS=[
  {key:'panda',emoji:'🐼',label:'えらすぎ！',line:'えらすぎる〜！その一歩、パンダが見てたよ🐼'},
  {key:'ramen',emoji:'🍜',label:'飯テロ',line:'これは飯テロ認定！おいしく食べたら明日ちょい活で優勝🍜'},
  {key:'zero',emoji:'🔥',label:'実質ゼロ',line:'動いたから実質ゼロ！ゆるトレ的には完全勝利🔥'},
  {key:'night',emoji:'🌙',label:'深夜部',line:'深夜部、入部確認！無理せずゆるくいこ〜🌙'},
  {key:'yuru',emoji:'😴',label:'ゆるくいこ〜',line:'今日はゆるくて大正解。休む勇気もトレーニング😴'},
];
const getReaction=(key)=>YURU_REACTIONS.find(r=>r.key===key)||YURU_REACTIONS[0];
/* 【v43メモ】投稿内容から出すリアクションを絞り込む関数。
   v43のタイムラインは YURU_REACTIONS の5つを常に並べる形にしたため未使用。
   将来「この投稿に合うリアクションを上に出す」を戻したくなったとき用に残している。 */
const suggestReactions=(post,act)=>{
  const text=((post.note||'')+' '+(act?.label||'')).toLowerCase();
  const list=[];
  const add=k=>{if(!list.includes(k))list.push(k)};
  if(/[ラーメン|らーめん|麺|ご飯|飯|ピザ|焼肉|カレー|寿司|スイーツ|ケーキ|アイス|ファミチキ|酒|ビール]/.test(text)) add('ramen');
  if(/[夜|深夜|寝る前|ナイト]/.test(text)) add('night');
  if(/[疲|だる|眠|休|ストレッチ|回復]/.test(text)) add('yuru');
  if(/[ジム|筋トレ|走|ラン|汗|ガチ]/.test(text)) add('zero');
  ['panda','ramen','zero','night','yuru'].forEach(add);
  return list.slice(0,5).map(getReaction);
};

/* ═══════════════ 【v43変更】ダミー投稿は本番から除外 ═══════════════
   v42まではこのサンプルがタイムラインに混ざって表示されていたが、
   v43で「実ユーザーの実投稿だけを出す」ようにしたため本番描画からは外した。
   参照しているのは DevSnsDemo（?debug=sns のときだけ描画）だけで、
   本番のタイムラインからは一切読まれない。削除はせず、開発用として残している。 */
const DEV_SAMPLE_USERS=[
  {id:'u1',name:'みちこ', initial:'み',color:'#5DCBA8'},
  {id:'u2',name:'けんさん',initial:'け',color:'#6baed6'},
  {id:'u3',name:'さちこ', initial:'さ',color:'#fc8d62'},
];
const DEV_SAMPLE_POSTS=[
  {id:'p1',uid:'u1',aid:'walk', note:'天気がよかったので公園まで歩いた。30分でヘトヘトど気持ちいい笑',mago:9, likes:4, comments:[]},
  {id:'p2',uid:'u2',aid:'home', note:'2週間ぶりに戻ってきました。焦らずやっていきます！それだけでOK！',mago:63,likes:11,comments:[{name:'みちこ',text:'おかえりー！'}]},
  {id:'p3',uid:'u3',aid:'gym',  note:'寝る前10分だけ。これぐらいがちょうどいい',mago:142,likes:7,comments:[]},
];

/* ═══════════════ ストレージ ═══════════════ */
const DEF={auth:null,user:null,reports:[],likes:{},reactions:{},myComments:{},onboard:false,posted:[],lastOpen:null,visits:0,mood:null,pandaChats:[],completedMissions:{},missionHistory:[],pandaPoints:0,timeCapsules:[]};
function storageKey(devId,userId){
  return 'yurutore-v6-'+devId+'-'+(userId||'guest');
}
async function loadSt(devId,userId){
  try{
    const key=storageKey(devId,userId);
    if(window.storage){
      const r=await window.storage.get(key);
      if(!r||!r.value)return DEF;
      return{...DEF,...JSON.parse(r.value)};
    }
    const raw=localStorage.getItem(key);
    if(!raw)return DEF;
    return{...DEF,...JSON.parse(raw)};
  }catch{return DEF;}
}
async function saveSt(devId,userId,s){
  try{
    const key=storageKey(devId,userId);
    if(window.storage){await window.storage.set(key,JSON.stringify(s));return;}
    localStorage.setItem(key,JSON.stringify(s));
  }catch{}
  // 【新規追加】ログイン中のユーザー（guest以外）は、可能ならSupabaseにも保存しておく。
  // "user_progress" テーブルが未作成の場合はエラーになるが、try/catchで無視するので
  // 既存のlocalStorage/window.storage保存には影響しない（アプリは壊れない）。
  syncStateToSupabase(userId,s);
}

// 【新規追加】認証済みユーザーの運動記録などをSupabaseへ保存する関数（将来の移行用）。
// Supabase側で以下のテーブルを作成すると有効になります（README参照）。
//   create table user_progress (
//     user_id uuid primary key references auth.users(id),
//     data jsonb,
//     updated_at timestamptz default now()
//   );
async function syncStateToSupabase(userId,s){
  try{
    if(!supabaseClient)return;
    if(!userId||userId==='guest')return; // 体験版（未ログイン）は同期しない
    await supabaseClient.from('user_progress').upsert({
      user_id:userId,
      data:s,
      updated_at:new Date().toISOString()
    });
  }catch(e){
    // テーブル未作成など想定される失敗は静かに無視する（既存動作に影響させない）
  }
}

/* ═══════════════ 【v25新規追加】プロフィール ═══════════════ */
// 好きな運動の選択肢（複数選択可）
const FAV_ACT_OPTIONS=[
  {id:'walk',label:'🚶 ウォーキング'},
  {id:'stretch',label:'🧘 ストレッチ'},
  {id:'gym',label:'🏋️ ジム'},
  {id:'home',label:'🏠 自宅トレ'},
  {id:'run',label:'🏃 ランニング'},
  {id:'yoga',label:'🧎 ヨガ'},
  {id:'sports',label:'⚽ スポーツ'},
  {id:'other',label:'✨ その他'}
];
// 活動ペースの選択肢（単一選択）
const PACE_OPTIONS=[
  {id:'whenever',label:'気が向いたとき'},
  {id:'weekly1',label:'週1回くらい'},
  {id:'weekly2_3',label:'週2〜3回'},
  {id:'almost_daily',label:'ほぼ毎日'}
];
// 居住地域（任意・都道府県まで）
const PREF_LIST=['未設定','北海道','青森県','岩手県','宮城県','秋田県','山形県','福島県','茨城県','栃木県','群馬県','埼玉県','千葉県','東京都','神奈川県','新潟県','富山県','石川県','福井県','山梨県','長野県','岐阜県','静岡県','愛知県','三重県','滋賀県','京都府','大阪府','兵庫県','奈良県','和歌山県','鳥取県','島根県','岡山県','広島県','山口県','徳島県','香川県','愛媛県','高知県','福岡県','佐賀県','長崎県','熊本県','大分県','宮崎県','鹿児島県','沖縄県','海外'];

// プロフィール画像の読み込み処理。
// ・jpg / jpeg / png / webp のみ対応
// ・8MBを超える画像はエラー（日本語メッセージ）
// ・中央を正方形にトリミング → 256pxに縮小 → JPEGに圧縮（丸型アイコン用）
const AVATAR_MAX_BYTES=8*1024*1024;
const AVATAR_TYPES=['image/jpeg','image/png','image/webp'];
function readAvatarFile(file){
  return new Promise((resolve,reject)=>{
    if(!file){resolve(null);return;}
    if(!file.type||!AVATAR_TYPES.includes(file.type)){reject(new Error('jpg / png / webp の画像を選んでね🐼'));return;}
    if(file.size>AVATAR_MAX_BYTES){reject(new Error('画像が大きすぎるみたい（8MBまで）。別の写真を選んでね🐼'));return;}
    const reader=new FileReader();
    reader.onload=()=>{
      const img=new Image();
      img.onload=()=>{
        try{
          // 中央を正方形に切り出す
          const side=Math.min(img.width,img.height);
          const sx=Math.round((img.width-side)/2);
          const sy=Math.round((img.height-side)/2);
          const out=256; // アイコン用なので256pxで十分（容量も小さくなる）
          const canvas=document.createElement('canvas');
          canvas.width=out;canvas.height=out;
          const ctx=canvas.getContext('2d');
          ctx.drawImage(img,sx,sy,side,side,0,0,out,out);
          resolve(canvas.toDataURL('image/jpeg',0.85));
        }catch(e){reject(new Error('画像の読み込みに失敗したよ。別の写真で試してね🐼'));}
      };
      img.onerror=()=>reject(new Error('画像の読み込みに失敗したよ。別の写真で試してね🐼'));
      img.src=reader.result;
    };
    reader.onerror=()=>reject(new Error('画像の読み込みに失敗したよ🐼'));
    reader.readAsDataURL(file);
  });
}

// dataURL → Blob 変換（Supabase Storageアップロード用）
function dataUrlToBlob(dataUrl){
  const [head,body]=dataUrl.split(',');
  const mime=(head.match(/data:(.*?);/)||[])[1]||'image/jpeg';
  const bin=atob(body);
  const arr=new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++)arr[i]=bin.charCodeAt(i);
  return new Blob([arr],{type:mime});
}

// プロフィール画像をSupabase Storage（avatarsバケット）へアップロードする。
// バケット未作成・未ログイン時は null を返し、アプリ側はローカル画像(dataURL)で動き続ける。
async function uploadAvatarToSupabase(userId,dataUrl){
  try{
    if(!supabaseClient||!userId||userId==='guest'||!dataUrl)return null;
    const blob=dataUrlToBlob(dataUrl);
    const path=`${userId}/avatar.jpg`; // 本人フォルダ配下のみ書き込み可（RLSで制限）
    const {error}=await supabaseClient.storage.from('avatars').upload(path,blob,{upsert:true,contentType:'image/jpeg'});
    if(error)return null;
    const {data}=supabaseClient.storage.from('avatars').getPublicUrl(path);
    return (data&&data.publicUrl)?`${data.publicUrl}?v=${Date.now()}`:null;
  }catch(e){return null;}
}

// プロフィールをSupabaseのprofilesテーブルへ保存する（将来の他ユーザー表示用）。
// テーブル未作成・未ログインでも失敗は静かに無視し、ローカル保存(saveSt)は必ず生きる。
async function syncProfileToSupabase(userId,user){
  try{
    if(!supabaseClient||!userId||userId==='guest'||!user)return;
    await supabaseClient.from('profiles').upsert({
      id:userId,
      nickname:user.name||'',
      hitokoto:user.bio||'',
      intro:user.intro||'',
      avatar_url:user.avatarUrl||null,
      fav_acts:user.favActs||[],
      pace:user.pace||null,
      region:user.region||null,
      is_public:user.isPublic!==false,
      updated_at:new Date().toISOString()
    });
  }catch(e){/* テーブル未作成などは無視（既存動作に影響させない） */}
}

/* ═══════════════════════════════════════════════════════════════════════════
   【v43新規追加】実ユーザーSNS基盤 — Supabaseアクセス層

   ここだけがSupabaseのSNSテーブルに触れる。画面(JSX)からSQLを直接書かない。
   使うテーブルは supabase/migrations/20260101000000_v43_real_sns.sql で作る:
     profiles / posts / post_reactions / comments / follows

   方針:
   ・認証は既存のSupabase認証をそのまま使う。新しい認証方式は作らない。
     SNSのユーザーIDは常に auth.uid()（＝アプリ側の state.auth）。
   ・戻り値は必ず {data, error} の形。error は「ユーザーに見せる日本語」。
     画面側は error を出して再試行ボタンを見せるだけでよい（§17）。
   ・埋め込み(select の join)は使わず、必要なテーブルを個別に引く。
     マイグレーション直後にPostgRESTのスキーマキャッシュが古いと
     join構文が失敗することがあるため、確実に動くほうを選んでいる。
   ═══════════════════════════════════════════════════════════════════════════ */
const SNS_PAGE_SIZE=30;              // タイムライン1ページの件数
const SNS_POST_MAX=300;              // 投稿本文の上限(DBのCHECKと同じ)
const SNS_COMMENT_MAX=200;           // コメントの上限(DBのCHECKと同じ)

/* Supabaseのエラーを、ユーザーに見せる短い日本語へ変換する。
   原因の詳細はコンソールにだけ出す(画面には出さない)。 */
function snsErrMsg(e,fallback){
  try{ if(e)console.warn('[sns]',e); }catch(_){}
  const code=(e&&(e.code||e.status))||'';
  const msg=String((e&&e.message)||'');
  if(!supabaseClient)return 'いまはSNSにつながらないみたい🐼';
  if(code==='42P01'||/relation .* does not exist|Could not find the table/i.test(msg))
    return 'SNSの準備がまだのようです（DBのセットアップを確認してね）🐼';
  if(code==='42501'||/row-level security|permission denied/i.test(msg))
    return 'この操作はできないみたい🐼';
  if(code==='23505'||/duplicate key/i.test(msg))
    return 'すでに登録ずみだよ🐼';
  if(/Failed to fetch|NetworkError|network/i.test(msg))
    return 'つながらなかったみたい。電波を確認してね🐼';
  return fallback||'うまくいかなかったみたい🐼';
}
const snsOk =(data)=>({data,error:null});
const snsNg =(e,fb)=>({data:null,error:snsErrMsg(e,fb)});
/* ログインしていない(体験版)ときの共通の返し方 */
const SNS_NEED_LOGIN='ログインすると、みんなの投稿が見られるよ🐼';
function snsGuard(uid){
  if(!supabaseClient)return 'いまはSNSにつながらないみたい🐼';
  if(!uid||uid==='guest')return SNS_NEED_LOGIN;
  return null;
}

/* ── プロフィール ────────────────────────────────────────────────────────
   投稿・コメント・フォローは profiles を参照するため、行が無いと書き込めない。
   サインアップ時のトリガーでも作られるが、既存ユーザーのために毎回念のため入れる。

   full=false（既定・投稿やリアクションの直前に呼ばれる）:
     「行があることを保証する」のが目的。中身が入っている項目だけを書き、
     空の値でサーバー側のプロフィールを上書きしない。
     ※ここを無条件upsertにすると、端末のstate.userが空のときに
       サーバーの自己紹介や都道府県を消してしまう。
   full=true（プロフィール編集画面の保存）:
     ユーザーが自分で消した項目も反映したいので、空も含めてそのまま書く。 */
async function snsEnsureProfile(uid,user,opts){
  const g=snsGuard(uid); if(g)return {data:null,error:g};
  const full=!!(opts&&opts.full);
  try{
    const row={id:uid,updated_at:new Date().toISOString()};
    const put=(key,val,max)=>{
      const v=(val===null||val===undefined)?null:String(val).slice(0,max);
      if(full){row[key]=v;return;}
      if(v&&v.trim())row[key]=v;      // 中身があるときだけ書く（空で上書きしない）
    };
    if(user){
      put('nickname',user.name,40);
      put('hitokoto',user.bio,60);
      put('intro',user.intro,300);
      if(full||user.avatarUrl)row.avatar_url=user.avatarUrl||null;
      if(full||user.region)row.region=user.region||null;   // 都道府県まで。任意
    }
    const {error}=await supabaseClient.from('profiles').upsert(row);
    if(error)throw error;
    return snsOk(true);
  }catch(e){return snsNg(e,'プロフィールの準備でつまずいたみたい🐼');}
}

async function snsFetchProfile(uid,targetId){
  const g=snsGuard(uid); if(g)return {data:null,error:g};
  try{
    const {data,error}=await supabaseClient.from('profiles')
      .select('id,nickname,avatar_url,intro,hitokoto,region,created_at')
      .eq('id',targetId).maybeSingle();
    if(error)throw error;
    return snsOk(data||null);
  }catch(e){return snsNg(e,'プロフィールを読めなかったみたい🐼');}
}

/* 投稿数・フォロー数・フォロワー数。3つまとめて数える。 */
async function snsFetchUserCounts(uid,targetId){
  const g=snsGuard(uid); if(g)return {data:null,error:g};
  try{
    const H={count:'exact',head:true};
    const [p,fo,fw]=await Promise.all([
      supabaseClient.from('posts').select('id',H).eq('user_id',targetId).eq('is_deleted',false),
      supabaseClient.from('follows').select('follower_id',H).eq('follower_id',targetId),
      supabaseClient.from('follows').select('following_id',H).eq('following_id',targetId)
    ]);
    if(p.error)throw p.error;
    return snsOk({posts:p.count||0, following:fo.count||0, followers:fw.count||0});
  }catch(e){return snsNg(e,'カウントを読めなかったみたい🐼');}
}

/* ── タイムライン ────────────────────────────────────────────────────────
   mode: 'all'（新着順の全体） / 'following'（フォロー中の人だけ）
   将来 'recommend'（おすすめ）や 'region'（地域）を足せるよう、
   ここで候補のuser_idを絞ってから同じ描画に流す形にしてある(§10)。 */
async function snsFetchTimeline(uid,mode){
  const g=snsGuard(uid); if(g)return {data:null,error:g};
  try{
    let userIds=null;
    if(mode==='following'){
      const f=await supabaseClient.from('follows').select('following_id').eq('follower_id',uid);
      if(f.error)throw f.error;
      userIds=(f.data||[]).map(r=>r.following_id);
      if(!userIds.length)return snsOk({posts:[],profiles:{},empty:'following'});
    }
    let q=supabaseClient.from('posts')
      .select('id,user_id,body,activity_type,created_at')
      .eq('is_deleted',false)
      .order('created_at',{ascending:false})
      .limit(SNS_PAGE_SIZE);
    if(userIds)q=q.in('user_id',userIds);
    const {data:posts,error}=await q;
    if(error)throw error;
    const list=posts||[];
    if(!list.length)return snsOk({posts:[],profiles:{},empty:mode});
    const extra=await snsFetchPostExtras(uid,list);
    return snsOk({posts:list,...extra});
  }catch(e){return snsNg(e,'タイムラインを読めなかったみたい🐼');}
}

/* 投稿一覧に付ける「投稿者・リアクション・コメント数」をまとめて取る。
   投稿ページ(最大30件)ぶんだけをまとめて引くので、N+1にならない。 */
async function snsFetchPostExtras(uid,list){
  const ids=list.map(p=>p.id);
  const authorIds=[...new Set(list.map(p=>p.user_id))];
  const [pf,rx,cm]=await Promise.all([
    supabaseClient.from('profiles').select('id,nickname,avatar_url,region').in('id',authorIds),
    supabaseClient.from('post_reactions').select('post_id,user_id,reaction_type').in('post_id',ids),
    supabaseClient.from('comments').select('post_id').in('post_id',ids).eq('is_deleted',false)
  ]);
  const profiles={};
  (pf.data||[]).forEach(r=>{profiles[r.id]=r;});
  const reactions={};   // postId -> {type:{count,mine}}
  (rx.data||[]).forEach(r=>{
    const m=reactions[r.post_id]||(reactions[r.post_id]={});
    const c=m[r.reaction_type]||(m[r.reaction_type]={count:0,mine:false});
    c.count++; if(r.user_id===uid)c.mine=true;
  });
  const commentCounts={};
  (cm.data||[]).forEach(r=>{commentCounts[r.post_id]=(commentCounts[r.post_id]||0)+1;});
  return {profiles,reactions,commentCounts};
}

/* あるユーザーの投稿一覧（プロフィール画面用） */
async function snsFetchUserPosts(uid,targetId){
  const g=snsGuard(uid); if(g)return {data:null,error:g};
  try{
    const {data,error}=await supabaseClient.from('posts')
      .select('id,user_id,body,activity_type,created_at')
      .eq('user_id',targetId).eq('is_deleted',false)
      .order('created_at',{ascending:false}).limit(SNS_PAGE_SIZE);
    if(error)throw error;
    const list=data||[];
    if(!list.length)return snsOk({posts:[],profiles:{},reactions:{},commentCounts:{}});
    const extra=await snsFetchPostExtras(uid,list);
    return snsOk({posts:list,...extra});
  }catch(e){return snsNg(e,'投稿を読めなかったみたい🐼');}
}

/* ── 投稿 ───────────────────────────────────────────────────────────────
   user_id はクライアントから渡すが、RLSの with check (user_id = auth.uid())
   により、他人になりすました投稿はサーバー側で必ず弾かれる。 */
async function snsCreatePost(uid,{body,activityType},user){
  const g=snsGuard(uid); if(g)return {data:null,error:(g===SNS_NEED_LOGIN?'投稿するにはログインしてね🐼':g)};
  const text=String(body||'').trim().slice(0,SNS_POST_MAX);
  if(!text&&!activityType)return {data:null,error:'ひとことか運動の種類を選んでね🐼'};
  try{
    await snsEnsureProfile(uid,user);   // プロフィール行が無いと外部キーで失敗するため
    const {data,error}=await supabaseClient.from('posts')
      .insert({user_id:uid,body:text,activity_type:activityType||null})
      .select('id,user_id,body,activity_type,created_at').single();
    if(error)throw error;
    return snsOk(data);
  }catch(e){return snsNg(e,'投稿できなかったみたい🐼');}
}

/* 投稿の削除は物理削除ではなく is_deleted を立てる（ソフトデリート・§14）。 */
async function snsSoftDeletePost(uid,postId){
  const g=snsGuard(uid); if(g)return {data:null,error:g};
  try{
    const {error}=await supabaseClient.from('posts')
      .update({is_deleted:true}).eq('id',postId).eq('user_id',uid);
    if(error)throw error;
    return snsOk(true);
  }catch(e){return snsNg(e,'削除できなかったみたい🐼');}
}

/* ── ゆるリアクション ────────────────────────────────────────────────────
   付ける/外すのトグル。同じ種類の連打はDBの主キー(post_id,user_id,reaction_type)
   で弾かれるので、二重に増えることはない。種類が違えば複数つけられる。 */
async function snsToggleReaction(uid,postId,type,turnOn,user){
  const g=snsGuard(uid); if(g)return {data:null,error:(g===SNS_NEED_LOGIN?'リアクションするにはログインしてね🐼':g)};
  try{
    if(turnOn){
      await snsEnsureProfile(uid,user);
      const {error}=await supabaseClient.from('post_reactions')
        .upsert({post_id:postId,user_id:uid,reaction_type:type},
                {onConflict:'post_id,user_id,reaction_type',ignoreDuplicates:true});
      if(error)throw error;
    }else{
      const {error}=await supabaseClient.from('post_reactions')
        .delete().eq('post_id',postId).eq('user_id',uid).eq('reaction_type',type);
      if(error)throw error;
    }
    return snsOk(true);
  }catch(e){return snsNg(e,'リアクションを送れなかったみたい🐼');}
}

/* ── コメント ───────────────────────────────────────────────────────────
   v43では返信ツリーなし（フラットな一覧）。 */
async function snsFetchComments(uid,postId){
  const g=snsGuard(uid); if(g)return {data:null,error:g};
  try{
    const {data,error}=await supabaseClient.from('comments')
      .select('id,post_id,user_id,body,created_at')
      .eq('post_id',postId).eq('is_deleted',false)
      .order('created_at',{ascending:true}).limit(100);
    if(error)throw error;
    const list=data||[];
    let profiles={};
    if(list.length){
      const ids=[...new Set(list.map(c=>c.user_id))];
      const pf=await supabaseClient.from('profiles').select('id,nickname,avatar_url').in('id',ids);
      (pf.data||[]).forEach(r=>{profiles[r.id]=r;});
    }
    return snsOk({comments:list,profiles});
  }catch(e){return snsNg(e,'コメントを読めなかったみたい🐼');}
}

async function snsAddComment(uid,postId,body,user){
  const g=snsGuard(uid); if(g)return {data:null,error:(g===SNS_NEED_LOGIN?'コメントするにはログインしてね🐼':g)};
  const text=String(body||'').trim().slice(0,SNS_COMMENT_MAX);
  if(!text)return {data:null,error:'コメントを入力してね🐼'};
  try{
    await snsEnsureProfile(uid,user);
    const {data,error}=await supabaseClient.from('comments')
      .insert({post_id:postId,user_id:uid,body:text})
      .select('id,post_id,user_id,body,created_at').single();
    if(error)throw error;
    return snsOk(data);
  }catch(e){return snsNg(e,'コメントを送れなかったみたい🐼');}
}

async function snsSoftDeleteComment(uid,commentId){
  const g=snsGuard(uid); if(g)return {data:null,error:g};
  try{
    const {error}=await supabaseClient.from('comments')
      .update({is_deleted:true}).eq('id',commentId).eq('user_id',uid);
    if(error)throw error;
    return snsOk(true);
  }catch(e){return snsNg(e,'削除できなかったみたい🐼');}
}

/* ── フォロー ───────────────────────────────────────────────────────────
   重複フォローは主キー、自分自身のフォローはCHECK制約とRLSで禁止済み。
   画面側でもボタンを出さないが、二重に防いでいる。 */
async function snsIsFollowing(uid,targetId){
  const g=snsGuard(uid); if(g)return {data:null,error:g};
  try{
    const {data,error}=await supabaseClient.from('follows')
      .select('follower_id').eq('follower_id',uid).eq('following_id',targetId).maybeSingle();
    if(error)throw error;
    return snsOk(!!data);
  }catch(e){return snsNg(e,'フォロー状態を読めなかったみたい🐼');}
}

async function snsSetFollow(uid,targetId,on,user){
  const g=snsGuard(uid); if(g)return {data:null,error:(g===SNS_NEED_LOGIN?'フォローするにはログインしてね🐼':g)};
  if(uid===targetId)return {data:null,error:'自分はフォローできないよ🐼'};
  try{
    if(on){
      await snsEnsureProfile(uid,user);
      const {error}=await supabaseClient.from('follows')
        .upsert({follower_id:uid,following_id:targetId},
                {onConflict:'follower_id,following_id',ignoreDuplicates:true});
      if(error)throw error;
    }else{
      const {error}=await supabaseClient.from('follows')
        .delete().eq('follower_id',uid).eq('following_id',targetId);
      if(error)throw error;
    }
    return snsOk(true);
  }catch(e){return snsNg(e,'フォローを更新できなかったみたい🐼');}
}

/* 表示用の小さなヘルパー */
function snsDisplayName(prof,fallback){
  const n=(prof&&prof.nickname||'').trim();
  return n||fallback||'ゆるトレ仲間';
}
function snsInitial(prof,fallback){
  const n=snsDisplayName(prof,fallback);
  return n.slice(0,1);
}
/* user_idから安定した色を作る（アバター未設定でも人ごとに色が変わる） */
function snsColorOf(id){
  const palette=['#5DCBA8','#6baed6','#fc8d62','#b39ddb','#f2a65a','#7fb069','#e8879b','#69b3c9'];
  return palette[fnv1a(String(id||''))%palette.length];
}
function snsTimeText(iso){
  try{
    const t=new Date(iso).getTime();
    if(!Number.isFinite(t))return '';
    return fmtM(Math.max(0,Math.floor((Date.now()-t)/60000)));
  }catch(e){return '';}
}
/* 【開発用】?debug=sns のときだけSNSの状態を画面隅に出す。本番UIには出さない。 */
function snsDebugOn(){
  try{return new URLSearchParams(window.location.search).get('debug')==='sns';}catch(e){return false;}
}

/* ═══════════════ AI ═══════════════ */
const FB={
  back:['戻ってきてくれてうれしい。やめなかった、それが一番だよ。','おかえり。また動けたのがえらい。'],
  streak:['続いてるね、その調子でゆるくいこう。','コツコツ動ける人、それで十分だよ。'],
  norm:['今日もちゃんと動けたの、いい感じだね。','その一歩が続く人は強いよ。'],
};
async function genPraise({aid,streak,ds,note}){
  return pickPraiseMessage(aid);
}

/* ═══════════════ ユーティリティ ═══════════════ */
const dk=ts=>{const d=new Date(ts);return`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`};
const tk=()=>dk(Date.now());
function calcStreak(rs){
  if(!rs.length)return 0;
  const s=new Set(rs.map(r=>dk(r.ts)));
  let n=0,d=new Date();d.setHours(0,0,0,0);
  if(!s.has(dk(d))){d.setDate(d.getDate()-1);if(!s.has(dk(d)))return 0;}
  while(s.has(dk(d))){n++;d.setDate(d.getDate()-1);}
  return n;
}
const dSince=ts=>Math.floor((Date.now()-ts)/86400000);
const fmtM=m=>m<60?`${m}分前`:m<1440?`${Math.floor(m/60)}時間前`:`${Math.floor(m/1440)}日前`;
const fmtTs=ts=>fmtM(Math.floor((Date.now()-ts)/60000));

const monthKey=ts=>{const d=new Date(ts);return`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;};
const fmtDateJP=ts=>{const d=new Date(ts);return`${d.getFullYear()}年${d.getMonth()+1}月${d.getDate()}日`;};
function rewardInfo(state,streak){
  const total=state.reports.length;
  if(streak>=100)return {rank:'legend',emoji:'👑',title:'王冠パンダ',label:'100日級の常連さん',next:'次は365日の思い出づくり',color:'#f2c94c'};
  if(streak>=30)return {rank:'scarf',emoji:'🧣',title:'マフラーパンダ',label:'30日継続のごほうび',next:'次は100日で王冠パンダ',color:'#ff8aa0'};
  if(streak>=7)return {rank:'cheek',emoji:'🌸',title:'ほっぺピンクパンダ',label:'7日継続のごほうび',next:'次は30日でマフラー追加',color:'#ff9bb2'};
  if(total>=1)return {rank:'normal',emoji:'🐼',title:'ゆるトレパンダ',label:'はじめの一歩達成',next:'7日続くと、ほっぺがピンクに',color:'#4DB89E'};
  return {rank:'baby',emoji:'🥚',title:'たまごパンダ',label:'これから育つよ',next:'最初の記録でパンダ誕生',color:'#9bb8b0'};
}
function plantInfo(streak,total){
  if(streak>=100||total>=150)return{emoji:'🌳',name:'ゆる大樹',msg:'長く続けた証。根っこがしっかり育ってるよ。'};
  if(streak>=30||total>=50)return{emoji:'🌸',name:'満開のゆる花',msg:'かなり育ってきたね。無理せず咲いてる感じが最高。'};
  if(streak>=7||total>=15)return{emoji:'🌷',name:'ゆる花',msg:'つぼみから花へ。少しずつ生活に馴染んできたよ。'};
  if(total>=3)return{emoji:'🌱',name:'ゆる芽',msg:'ちゃんと芽が出てるよ。水やり感覚でゆるく続けよう。'};
  return{emoji:'🪴',name:'ゆる鉢',msg:'まだ小さいけど、ここから育つのが楽しみ。'};
}
function activeDaysInMonth(reports,year,month){
  const s=new Set(reports.filter(r=>{const d=new Date(r.ts);return d.getFullYear()===year&&d.getMonth()===month;}).map(r=>dk(r.ts)));
  return s.size;
}
function monthActivitySummary(reports,offset=0){
  const d=new Date();d.setDate(1);d.setMonth(d.getMonth()+offset);
  const y=d.getFullYear(),m=d.getMonth();
  const rows=reports.filter(r=>{const x=new Date(r.ts);return x.getFullYear()===y&&x.getMonth()===m;});
  const days=new Set(rows.map(r=>dk(r.ts))).size;
  const by={};rows.forEach(r=>by[r.aid]=(by[r.aid]||0)+1);
  const top=Object.entries(by).sort((a,b)=>b[1]-a[1])[0];
  const act=top?ACTS.find(a=>a.id===top[0]):null;
  return {year:y,month:m+1,rows,days,top:act?`${act.icon} ${act.label}`:'まだ記録なし'};
}

function readPhotoFile(file){
  return new Promise((resolve,reject)=>{
    if(!file){resolve(null);return;}
    if(!file.type||!file.type.startsWith('image/')){reject(new Error('画像ファイルを選んでね'));return;}
    const reader=new FileReader();
    reader.onload=()=>{
      const img=new Image();
      img.onload=()=>{
        const max=900;
        let w=img.width,h=img.height;
        if(w>h&&w>max){h=Math.round(h*max/w);w=max;}
        else if(h>=w&&h>max){w=Math.round(w*max/h);h=max;}
        const canvas=document.createElement('canvas');
        canvas.width=w;canvas.height=h;
        const ctx=canvas.getContext('2d');
        ctx.drawImage(img,0,0,w,h);
        const dataUrl=canvas.toDataURL('image/jpeg',0.78);
        resolve({dataUrl,name:file.name||'photo.jpg',type:'image/jpeg',w,h});
      };
      img.onerror=()=>reject(new Error('画像を読み込めなかったよ'));
      img.src=reader.result;
    };
    reader.onerror=()=>reject(new Error('画像を読み込めなかったよ'));
    reader.readAsDataURL(file);
  });
}

function memoryCard(state){
  const reports=state.reports||[];
  if(!reports.length)return{title:'思い出アルバム',body:'ここに「去年の今ごろ」がたまっていくよ。まずは今日の1回を残そう。',tag:'これから'};
  const now=new Date();
  const lastYear=reports.filter(r=>{const d=new Date(r.ts);return d.getFullYear()===now.getFullYear()-1&&d.getMonth()===now.getMonth();});
  if(lastYear.length){
    const by={};lastYear.forEach(r=>by[r.aid]=(by[r.aid]||0)+1);
    const top=Object.entries(by).sort((a,b)=>b[1]-a[1])[0];
    const a=ACTS.find(x=>x.id===top?.[0]);
    return{title:'去年の今ごろ',body:`${now.getFullYear()-1}年${now.getMonth()+1}月は、${a?a.icon+' '+a.label:'運動'}をよくやってたよ。懐かしいね〜。`,tag:`${new Set(lastYear.map(r=>dk(r.ts))).size}日動いた`};
  }
  const old=reports[0];
  const a=ACTS.find(x=>x.id===old.aid);
  return{title:'あの日のあなた',body:`最初の記録は${fmtDateJP(old.ts)}の${a?a.icon+' '+a.label:'運動'}。ここからゆるトレが始まったよ。`,tag:'はじまり'};
}
function unlockedRewards(state,streak){
  const total=state.reports.length;
  return [
    {ok:total>=1,icon:'🐼',name:'パンダ誕生'},
    {ok:streak>=7,icon:'🌸',name:'ほっぺピンク'},
    {ok:streak>=30,icon:'🧣',name:'マフラー'},
    {ok:streak>=100,icon:'👑',name:'王冠'},
    {ok:activeDaysInMonth(state.reports,new Date().getFullYear(),new Date().getMonth())>=10,icon:'📖',name:'今月の思い出'}
  ];
}


/* ═══════════════ 進捗リング ═══════════════ */
function Ring({pct=75}){
  return(
    <div className="ring-wrap" style={{gap:3}}>
      <div style={{fontSize:20,lineHeight:1}}>🐼</div>
      <div style={{fontSize:9,color:'#5a8078',fontWeight:700,marginBottom:0}}>今週のゆる継続</div>
      <div style={{fontSize:14,fontWeight:800,color:'#1a4838',lineHeight:1.1}}>いい感じ</div>
      <div className="ring-label">今日も来ただけでえらい</div>
    </div>
  );
}

/* ═══════════════ パンダヘッダー ═══════════════ */
function PH({msg,sub,pct}){
  return(
    <div className="panda-header">
      <div className="ai-banner">
        <div className="ai-inner">
          <strong>{msg||'今日もおつかれさま！'}</strong>
          <span>{sub||'ゆるっと続けるあなたが いちばんすごいよ〜！💗'}</span>
        </div>
      </div>
      <Ring pct={pct||75}/>
    </div>
  );
}

/* ═══════════════ デバイスコンテキスト ═══════════════ */
const DevCtx=createContext('ios');




/* ═══════════════ アプリロジック ═══════════════ */
function AppLogic({devId}){
  const platform=useContext(DevCtx);
  const [st,setSt]=useState(null);
  const [session,setSession]=useState(null);
  const [authChecked,setAuthChecked]=useState(false);
  const [authLoading,setAuthLoading]=useState(false);
  const [authError,setAuthError]=useState('');
  const [authNotice,setAuthNotice]=useState('');
  // 【新規追加】新規登録直後、確認メールの返信待ちであることを示す状態（メールアドレスを保持）
  const [awaitingConfirmationEmail,setAwaitingConfirmationEmail]=useState(null);
  // 【修正】認証処理の二重実行防止ガード。
  // authLoading(state)は画面表示用、authBusyRef(ref)は「連打の瞬間」の即時ガード用。
  // stateの更新は非同期なので、連打されるとstateだけでは防げないケースがあるため。
  // ※必ず他のフックと同じ場所（早期returnより前）で宣言すること（Reactのルール）
  const authBusyRef=useRef(false);
  const [tab,setTab]=useState('home');
  const [showRep,setShowRep]=useState(false);
  const [postAfter,setPostAfter]=useState(false);
  const [praise,setPraise]=useState(null);
  const [aiLoad,setAiLoad]=useState(false);
  const [toast,setToast]=useState(null);
  const [reward,setReward]=useState(null);
  // 【v38新規追加】記録後の「見に行く」からパンダルームを全画面で開くための合図（0以外になったら開く）
  const [roomJump,setRoomJump]=useState(0);
  // 【v43新規追加】タイムラインからユーザーをタップしたとき開くプロフィール画面（userId or null）
  const [snsUser,setSnsUser]=useState(null);
  const [showWelcomeGate,setShowWelcomeGate]=useState(()=>{try{['yurutore_welcome_seen_v8_food','yurutore_welcome_seen_v9_food','yurutore_welcome_seen_v10_food','yurutore_welcome_seen_v12_gate'].forEach(k=>localStorage.removeItem(k));const force=(location.hash==='#welcome'||location.search.includes('welcome=1'));if(force){sessionStorage.removeItem('yurutore_welcome_seen_v13');return true;}return sessionStorage.getItem('yurutore_welcome_seen_v13')!=='1';}catch(e){return true;}});

  useEffect(()=>{
    let alive=true;
    if(!supabaseClient){setSt(DEF);setAuthChecked(true);return;}
    supabaseClient.auth.getSession().then(({data})=>{
      if(!alive)return;
      setSession(data.session||null);
      setAuthChecked(true);
    });
    const {data:{subscription}}=supabaseClient.auth.onAuthStateChange((_event,nextSession)=>{
      setSession(nextSession);
    });
    return()=>{alive=false;subscription&&subscription.unsubscribe();};
  },[]);

  useEffect(()=>{
    if(!authChecked)return;
    const userId=session?.user?.id||'guest';
    loadSt(devId,userId).then(saved=>{
      const today=tk();
      const firstOpenToday=saved.lastOpen!==today;
      setSt({...saved,auth:userId,lastOpen:today,visits:(saved.visits||0)+(firstOpenToday?1:0)});
    });
  },[authChecked,session?.user?.id,devId]);

  useEffect(()=>{
    const userId=session?.user?.id||'guest';
    if(st)saveSt(devId,userId,{...st,auth:userId});
  },[st,devId,session?.user?.id]);

  if(!st||!authChecked)return<div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100%',color:'#4DB89E',fontSize:13}}>読み込み中…</div>;

  const showToast=m=>{setToast(m);setTimeout(()=>setToast(null),1900)};

  /* 【v43新規追加】運動記録を1件、SNSの実投稿として送る。
     本文はメモ（無ければ運動名）。失敗しても運動記録そのものは必ず残る。
     ※ 褒め画面(PraiseScreen)は途中の early return で描画されるため、
        この関数は必ず early return より前で定義しておくこと。 */
  const publishToSns=async(report)=>{
    if(!report)return;
    const uid=st.auth;
    if(!uid||uid==='guest'){
      showToast('体験版だから、いまは自分の記録だけに残したよ🐼');
      return;
    }
    const act=ACTS.find(a=>a.id===report.aid);
    const body=(report.note&&report.note.trim())||(act?`${act.label}をやったよ〜`:'ちょっとだけ動いた〜');
    const r=await snsCreatePost(uid,{body,activityType:report.aid},st.user);
    if(r.error)showToast(r.error);
  };

  // 【修正】ログイン処理。
  // ・メール/パスワードの入力チェックを追加（validateAuthInputで一括チェック）
  // ・呼び出し元(画面側)が「成功したかどうか」を判定できるよう、結果オブジェクトを返すようにした
  //   → これにより「Supabaseで認証成功した場合のみホーム画面へ進む」を画面側で保証できる
  // 【修正】ログイン処理。
  // ・try / catch / finally 構造に変更 → 例外が発生してもローディングが必ず解除される
  // ・authBusyRefで二重実行を防止
  const handleLogin=async(email,pass)=>{
    if(authBusyRef.current)return{success:false}; // 連打防止：処理中なら何もしない
    setAuthError('');
    setAuthNotice('');
    const validationError=validateAuthInput(email,pass);
    if(validationError){setAuthError(validationError);return{success:false};}
    if(!supabaseClient){setAuthError('Supabaseの読み込みに失敗しました');return{success:false};}
    try{
      authBusyRef.current=true;
      setAuthLoading(true);
      const {data,error}=await supabaseClient.auth.signInWithPassword({email:email.trim(),password:pass});
      if(error)throw error;
      return{success:true,session:data.session};
    }catch(error){
      setAuthError('ログインできませんでした。メール・パスワードを確認してね');
      return{success:false};
    }finally{
      authBusyRef.current=false;
      setAuthLoading(false); // 成功でも失敗でも例外でも、必ずローディング解除
    }
  };

  // 【修正】新規登録処理。
  // ・try / catch / finally 構造に変更 → 例外が発生しても「確認中…」のまま残らない
  // ・authBusyRefで二重実行（登録ボタン連打）を防止
  // ・成功して確認メールが必要な場合は awaitingConfirmationEmail をセットし、
  //   確認メール待ち専用画面（ConfirmEmailScreen）へ切り替える
  const handleRegister=async(email,pass)=>{
    if(authBusyRef.current)return{success:false}; // 連打防止：処理中なら何もしない
    setAuthError('');
    setAuthNotice('');
    const validationError=validateAuthInput(email,pass);
    if(validationError){setAuthError(validationError);return{success:false};}
    if(!supabaseClient){setAuthError('Supabaseの読み込みに失敗しました');return{success:false};}
    try{
      authBusyRef.current=true;
      setAuthLoading(true);
      // emailRedirectTo: 確認メール内のリンクを押した後に戻ってくるURL。
      // 今アプリを開いているURL（Netlify本番URLなど）を自動で指定します。
      // ※Supabase側の「Redirect URLs」にもこのURLが登録されている必要があります。
      const {data,error}=await supabaseClient.auth.signUp({
        email:email.trim(),
        password:pass,
        options:{emailRedirectTo:location.origin+location.pathname}
      });
      if(error)throw error;
      // data.session がある＝Supabase側の「メール確認」設定がオフで、すぐ使える状態
      const needsConfirmation=!data.session;
      if(needsConfirmation){
        // 確認メール送信完了 → 確認待ち専用画面へ切り替え（画面切り替えは親のrender側で行う）
        setAwaitingConfirmationEmail(email.trim());
      }else{
        setAuthNotice('新規登録できたよ！このままプロフィール設定に進んでね🐼');
      }
      return{success:true,needsConfirmation};
    }catch(error){
      const msg=(error&&error.message)||'';
      setAuthError(msg.includes('already')?'すでに登録済みのメールかも。ログインを試してね':'新規登録できませんでした。時間をおいてもう一度試してね');
      return{success:false};
    }finally{
      authBusyRef.current=false;
      setAuthLoading(false); // 成功でも失敗でも例外でも、必ずローディング解除
    }
  };

  // 【修正】確認メールの再送信（try/catch/finally化＋連打防止）
  const handleResendConfirmation=async(email)=>{
    if(authBusyRef.current)return;
    setAuthError('');
    setAuthNotice('');
    if(!supabaseClient||!email)return;
    try{
      authBusyRef.current=true;
      setAuthLoading(true);
      const {error}=await supabaseClient.auth.resend({type:'signup',email});
      if(error)throw error;
      setAuthNotice('確認メールを再送信したよ🐼');
    }catch(error){
      setAuthError('再送信に失敗しました。時間をおいて試してね');
    }finally{
      authBusyRef.current=false;
      setAuthLoading(false);
    }
  };

  // 【修正】パスワード再設定メールの送信（try/catch/finally化＋連打防止）
  const handlePasswordReset=async(email)=>{
    if(authBusyRef.current)return{success:false};
    setAuthError('');
    setAuthNotice('');
    const e=String(email||'').trim();
    if(!e){setAuthError('メールアドレスを入力してください');return{success:false};}
    if(!isValidEmail(e)){setAuthError('正しいメールアドレスを入力してください');return{success:false};}
    if(!supabaseClient){setAuthError('Supabaseの読み込みに失敗しました');return{success:false};}
    try{
      authBusyRef.current=true;
      setAuthLoading(true);
      const {error}=await supabaseClient.auth.resetPasswordForEmail(e,{redirectTo:location.href});
      if(error)throw error;
      setAuthNotice('パスワード再設定メールを送信したよ。メール内のリンクを確認してね🐼');
      return{success:true};
    }catch(error){
      setAuthError('送信に失敗しました。時間をおいて試してね');
      return{success:false};
    }finally{
      authBusyRef.current=false;
      setAuthLoading(false);
    }
  };

  // 【修正】Googleログイン（try/catch/finally化）
  // Supabase側でGoogle Providerが未設定でも、エラーメッセージが出るだけでアプリは壊れない
  const handleGoogleLogin=async()=>{
    if(authBusyRef.current)return;
    setAuthError('');
    if(!supabaseClient){setAuthError('Supabaseの読み込みに失敗しました');return;}
    try{
      authBusyRef.current=true;
      setAuthLoading(true);
      const {error}=await supabaseClient.auth.signInWithOAuth({provider:'google',options:{redirectTo:location.href}});
      if(error)throw error;
    }catch(error){
      setAuthError('Googleログインの設定確認が必要です');
    }finally{
      authBusyRef.current=false;
      setAuthLoading(false);
    }
  };

  const handleLogout=async()=>{
    if(session&&supabaseClient)await supabaseClient.auth.signOut();
    setSt(s=>({...DEF,user:s?.user||null,onboard:!!s?.onboard}));
    setSession(null);
    setAwaitingConfirmationEmail(null);
  };

  const closeWelcomeGate=()=>{try{sessionStorage.setItem('yurutore_welcome_seen_v13','1');}catch(e){};setShowWelcomeGate(false);};

  // 【重要修正】画面判定の順序を変更しました。
  // 以前は「WelcomeGate → 確認メール画面」の順で判定していたため、
  // WelcomeGateから新規登録した場合、確認メール待ち状態になっても
  // WelcomeGateが表示され続け、「確認中…」のまま止まったように見えるバグがありました。
  // → 確認メール待ちの判定を"最優先"に移動。どの画面から登録しても必ず
  //   「確認メールを送信しました」画面へ切り替わります。
  // ・新規登録直後（awaitingConfirmationEmail）
  // ・すでにSupabaseのセッションはあるが、メール未確認（email_confirmed_atが無い）の場合
  //   ※ Googleログインなどメール以外のプロバイダーはメール確認不要のため対象外
  const isEmailProviderUser=session?.user?.app_metadata?.provider==='email'||(session?.user?.app_metadata?.providers||[]).includes('email');
  const needsEmailVerification=!!session&&isEmailProviderUser&&!session.user.email_confirmed_at;
  if(awaitingConfirmationEmail||needsEmailVerification){
    const pendingEmail=awaitingConfirmationEmail||session?.user?.email;
    return<ConfirmEmailScreen
      email={pendingEmail}
      loading={authLoading}
      error={authError}
      notice={authNotice}
      onResend={()=>handleResendConfirmation(pendingEmail)}
      onBackToLogin={async()=>{
        setAuthError('');setAuthNotice('');
        if(session&&supabaseClient)await supabaseClient.auth.signOut();
        setSession(null);
        setAwaitingConfirmationEmail(null);
      }}
    />;
  }

  if(showWelcomeGate)return<WelcomeGate onContinue={closeWelcomeGate} onLogin={handleLogin} onRegister={handleRegister} onGoogleLogin={handleGoogleLogin} onResetPassword={handlePasswordReset} authLoading={authLoading} authError={authError} authNotice={authNotice}/>;

  // 初回ユーザー向け：世界観が伝わるウェルカム画面 → 登録/体験 → 初期設定
  if(!st.user||!st.onboard)return<RegisterScreen onDone={u=>setSt(s=>({...s,user:u,onboard:true}))} onLogin={handleLogin} onRegister={handleRegister} onGoogleLogin={handleGoogleLogin} onResetPassword={handlePasswordReset} authLoading={authLoading} authError={authError} authNotice={authNotice} hasSession={!!session}/>;
  if(praise)return<PraiseScreen praise={praise} state={st} onHome={()=>{setPraise(null);setTab('home');}} onTL={()=>{const rep=(st.reports||[]).find(r=>r.id===praise.reportId);setSt(s=>({...s,posted:[...(s.posted||[]),praise.reportId]}));setPraise(null);setTab('timeline');publishToSns(rep);}} onRoom={()=>{setPraise(null);setTab('home');setRoomJump(Date.now());}}/>;

  const submitRep=async({aid,note,photo})=>{
    const ts=Date.now();
    const nr={id:'r'+ts,aid,note,photo:photo||null,ts};
    const nrs=[...st.reports,nr];
    const isFirst=st.reports.length===0;
    const lastTs=st.reports.length?st.reports[st.reports.length-1].ts:ts;
    const ds=isFirst?0:dSince(lastTs);
    const oldStreak=calcStreak(st.reports);
    const streak=calcStreak(nrs);
    const willPost=postAfter;
    const newReward = rewardInfo({...st,reports:nrs},streak);
    const oldReward = rewardInfo(st,oldStreak);
    // 【v38新規追加】パンダルームの家具解放を「記録の前後」で比較して、新しく増えた分だけ拾う。
    // 解放条件・保存キー・部屋側の演出は既存のまま（ここでは差分を見るだけ）。
    let roomNew=[];
    try{
      const beforeIds=room30Items(st,oldStreak).filter(i=>i.ok).map(i=>i.id);
      const afterItems=room30Items({...st,reports:nrs},streak).filter(i=>i.ok);
      // 【v39修正】実際に部屋へ置ける家具だけを対象にし、名前も一緒に渡す
      roomNew=afterItems.filter(i=>beforeIds.indexOf(i.id)<0&&roomFurnVisible(i.id))
                        .map(i=>({id:i.id,icon:i.icon,name:i.name}));
    }catch(e){roomNew=[];}
    // 【v38新規追加】パンジローのリアクション抽選（運動種類・時間帯・久しぶり・節目で変化）
    const isComebackRep=!isFirst&&ds>=3;
    const reaction=pickPanjiroReaction({aid,streak,ds,isComeback:isComebackRep});
    const memory=pjMemoryLine({prevReports:st.reports,aid,ds:isFirst?0:ds});
    setSt(s=>({...s,reports:nrs,...(willPost?{posted:[...(s.posted||[]),nr.id]}:{})}));
    /* 【v43新規追加】「記録して投稿」を選んだときは、SNSにも実投稿を作る。
       ログインしていない体験版では作らず、これまでどおり手元の記録だけ残る。
       ここが失敗しても運動記録そのものは必ず保存される（既存動作を壊さない）。 */
    if(willPost)publishToSns(nr);
    trackEvent('exercise_recorded'); // 【v28新規追加】計測(失敗しても体験に影響なし)
    setShowRep(false);setPostAfter(false);setAiLoad(true);
    if(willPost){setTab('timeline');}else{setTab('home');}
    const msg=await genPraise({aid,streak,ds,note});
    setAiLoad(false);
    if(newReward.rank!==oldReward.rank || streak===7 || streak===30 || streak===100){
      setReward({...newReward,streak,total:nrs.length});
    }
    if(willPost){
      showToast('タイムラインに投稿したよ ✨');
    }else{
      setPraise({msg,aid,streak,ds,reportId:nr.id,reaction,memory,roomNew});
    }
  };

  /* 【v43メモ】下の toggleReaction / addCmt は、v42までのローカル保存のリアクション/コメント
     （state.reactions / state.likes / state.myComments）を書き換える関数。
     SNSがSupabaseの実データへ移行したのでタイムラインからは呼ばれなくなったが、
     既存ユーザーの保存データ構造を変えないため、関数と保存キーはそのまま残している。 */
  const toggleReaction=(id,key)=>setSt(s=>({
    ...s,
    reactions:{...s.reactions,[id]:s.reactions?.[id]===key?null:key},
    likes:{...s.likes,[id]:key==='panda'?s.reactions?.[id]!==key:!!s.likes?.[id]}
  }));
  const addCmt=(id,txt)=>{
    if(!txt.trim())return;
    setSt(s=>({...s,myComments:{...s.myComments,[id]:[...(s.myComments[id]||[]),{txt,ts:Date.now()}]}}));
    showToast('応援を送ったよ 🌿');
  };

  const streak=calcStreak(st.reports);
  const pct=Math.min(100,Math.max(5,Math.round((streak/30)*100)));

  return(
    <>
      <div className={`screen ${platform==='android'?'android':''}`}>
        {tab==='home'    &&<HomeScreen     state={st} setState={setSt} streak={streak} pct={pct} aiLoad={aiLoad} onOpenReport={()=>setShowRep(true)} openRoomSignal={roomJump} onRoomOpened={()=>setRoomJump(0)}/>}
        {tab==='timeline'&&<TimelineScreen state={st} setState={setSt} showToast={showToast}
            onOpenReport={(post)=>{setPostAfter(!!post);setShowRep(true);}}
            onOpenUser={(id)=>setSnsUser(id)}/>}
        {tab==='weekly'  &&<WeeklyScreen   state={st} streak={streak} pct={pct}/>}
        {tab==='profile' &&<ProfileScreen  state={st} setState={setSt} showToast={showToast} onLogout={handleLogout}/>}
        {toast&&<div className="toast">{toast}</div>}
        {/* 【v43新規追加】ほかの人のプロフィール（タイムラインからタップして開く） */}
        {snsUser&&(
          <SnsUserScreen userId={snsUser} state={st} showToast={showToast}
            onOpenUser={(id)=>setSnsUser(id)} onClose={()=>setSnsUser(null)}/>
        )}
      </div>
      <nav className="nav">
        <button className={`nav-btn${tab==='home'?' active':''}`} onClick={()=>setTab('home')}>
          <span className="nav-icon">🏠</span><span>ホーム</span>
        </button>
        <button className={`nav-btn${tab==='timeline'?' active':''}`} onClick={()=>setTab('timeline')}>
          <span className="nav-icon">💬</span><span>みんな</span>
        </button>
        <div className="fab-wrap">
          <button className="fab" onClick={()=>setShowRep(true)}>＋</button>
          <span className="fab-label">記録</span>
        </div>
        <button className={`nav-btn${tab==='weekly'?' active':''}`} onClick={()=>setTab('weekly')}>
          <span className="nav-icon">📊</span><span>今週</span>
        </button>
        <button className={`nav-btn${tab==='profile'?' active':''}`} onClick={()=>setTab('profile')}>
          <span className="nav-icon">👤</span><span>プロフ</span>
        </button>
      </nav>
      {reward&&(
        <RewardPopup reward={reward} onClose={()=>setReward(null)}/>
      )}
      {showRep&&(
        <div className="overlay" onClick={()=>{setShowRep(false);setPostAfter(false);}}>
          <ReportSheet onClose={()=>{setShowRep(false);setPostAfter(false);}} onSubmit={submitRep} postMode={postAfter}/>
        </div>
      )}
    </>
  );
}

/* 【削除】未使用だった古いLoginScreenコンポーネントを削除しました（どこからも呼ばれていない死にコードでした） */

/* ═══════════════ 新規登録 ═══════════════ */




/* ═══════════════ 確認メール送信画面（新規追加） ═══════════════ */
// 新規登録直後、または「メール未確認のセッションがある」場合に必ず表示する画面。
// この画面が出ている間は、プロフィール設定やホーム画面には進めない。
function ConfirmEmailScreen({email,loading,error,notice,onResend,onBackToLogin}){
  return(
    <div className="welcome-screen auth-entry-screen">
      <div className="welcome-bg-orb orb-one"/><div className="welcome-bg-orb orb-two"/>
      <div className="auth-entry-card fade-up">
        <div className="welcome-badge">STEP 1 完了</div>
        <div className="auth-panda">🐼📩</div>
        <h1>確認メールを送信しました</h1>
        <p>
          {email?<>{email} 宛に<br/></>:null}
          確認メールを送信しました。メール内のリンクを開いて登録を完了してください。
        </p>
        {(error||notice)&&<div className={`auth-entry-msg ${error?'err':''}`}>{error||notice}</div>}
        <button className="welcome-main-btn" disabled={loading} onClick={onResend}>{loading?'送信中…':'確認メールを再送信する'}</button>
        <button className="welcome-sub-btn" onClick={onBackToLogin}>ログイン画面に戻る</button>
        <div style={{textAlign:'center',marginTop:14,fontSize:11,color:'#90a8a0',lineHeight:1.7,background:'#f0faf8',borderRadius:12,padding:'10px 14px'}}>
          メールが届かない場合は、迷惑メールフォルダも確認してみてね🐼
        </div>
      </div>
    </div>
  );
}

function WelcomeGate({onContinue,onLogin,onRegister,onGoogleLogin,onResetPassword,authLoading,authError,authNotice}){
  const [step,setStep]=useState(0);
  const [mode,setMode]=useState('register');
  const [email,setEmail]=useState('');
  const [pass,setPass]=useState('');
  const [localNotice,setLocalNotice]=useState('');
  const [localError,setLocalError]=useState('');
  // 【新規追加】パスワードを忘れた方向けの再設定モード
  const [resetMode,setResetMode]=useState(false);
  const [resetEmail,setResetEmail]=useState('');
  const tutorial=[
    {tag:'STEP 1',icon:'😊',title:'今日の気分を選ぶ',text:'元気でも、疲れててもOK。まずは気分をポチッ。パンダが今日のペースを一緒に考えるよ。'},
    {tag:'STEP 2',icon:'🎯',title:'ゆるミッションに挑戦',text:'1日3分からで大丈夫。できたらパンダポイントとごほうびが育つよ。'},
    {tag:'STEP 3',icon:'🏠',title:'パンダルームを楽しむ',text:'運動・会話・写真・タイムカプセルで家具や思い出が増えていくよ。'}
  ];
  const pandaSrc='./welcome_panda_food_clean.png';

  if(step===0){
    return(
      <div className="yg8-welcome">
        <div className="yg8-image-wrap">
          <img className="yg8-main-img" src={pandaSrc} onError={(e)=>{e.currentTarget.onerror=null;e.currentTarget.src='./images/welcome_panda_food_clean.png';}} alt="ピザとラーメンを持ったゆるトレパンダ"/>
        </div>
        <div className="yg8-panel">
          <div className="yg8-mini-badge">🐼 ゆるトレ倶楽部</div>
          <h1>パンダと一緒に<br/><span>1日3分</span>のゆる運動</h1>
          <p>ピザもラーメンも楽しみながら、褒められてゆるく続ける運動アプリ。</p>
          <button className="yg8-primary" onClick={()=>setStep(1)}>無料ではじめる</button>
          <button className="yg8-secondary" onClick={onContinue}>まずは体験してみる</button>
          <button className="yg8-linkbtn" onClick={()=>setStep(4)}>ログイン・新規登録はこちら</button>
        </div>
      </div>
    );
  }

  if(step>=1&&step<=3){
    const c=tutorial[step-1];
    return(
      <div className="yg8-welcome yg8-tutorial">
        <div className="yg8-tutorial-img-wrap">
          <img className="yg8-tutorial-img" src={pandaSrc} onError={(e)=>{e.currentTarget.onerror=null;e.currentTarget.src='./images/welcome_panda_food_clean.png';}} alt="ゆるトレパンダ"/>
        </div>
        <div className="yg8-panel yg8-card">
          <div className="yg8-step">{c.tag}</div>
          <div className="yg8-icon">{c.icon}</div>
          <h1>{c.title}</h1>
          <p>{c.text}</p>
          <div className="yg8-dots">{tutorial.map((_,i)=><span key={i} className={i===step-1?'active':''}/>)}</div>
          <button className="yg8-primary" onClick={()=>step<3?setStep(step+1):setStep(4)}>{step<3?'次へ':'登録へ進む'}</button>
          <button className="yg8-secondary" onClick={onContinue}>まずは体験してみる</button>
          <button className="yg8-linkbtn" onClick={()=>setStep(step-1)}>← 戻る</button>
        </div>
      </div>
    );
  }

  // 【新規追加】パスワード再設定モードの画面
  if(resetMode){
    return(
      <div className="yg8-welcome yg8-auth">
        <div className="yg8-auth-visual">
          <img src={pandaSrc} onError={(e)=>{e.currentTarget.onerror=null;e.currentTarget.src='./images/welcome_panda_food_clean.png';}} alt="ゆるトレパンダ"/>
        </div>
        <div className="yg8-panel yg8-auth-panel">
          <div className="yg8-mini-badge">パスワード再設定</div>
          <h1>パスワードを忘れた方へ</h1>
          <p>登録したメールアドレスを入力してね。再設定用のリンクを送るよ🐼</p>
          <label className="lbl">メールアドレス</label>
          <input className="field" placeholder="example@email.com" value={resetEmail} onChange={e=>setResetEmail(e.target.value)} autoCapitalize="none"/>
          {(authError||authNotice)&&<div className={`auth-entry-msg ${authError?'err':''}`}>{authError||authNotice}</div>}
          <button className="yg8-primary" disabled={authLoading} onClick={async()=>{
            if(onResetPassword)await onResetPassword(resetEmail);
          }}>{authLoading?'送信中…':'再設定メールを送る'}</button>
          <button className="yg8-linkbtn" onClick={()=>setResetMode(false)}>← ログインへ戻る</button>
        </div>
      </div>
    );
  }

  return(
    <div className="yg8-welcome yg8-auth">
      <div className="yg8-auth-visual">
        <img src={pandaSrc} onError={(e)=>{e.currentTarget.onerror=null;e.currentTarget.src='./images/welcome_panda_food_clean.png';}} alt="ゆるトレパンダ"/>
      </div>
      <div className="yg8-panel yg8-auth-panel">
        <div className="yg8-mini-badge">START</div>
        <h1>一緒にゆるく続けよう</h1>
        <p>メール登録すると、あとでデータ保存やログイン機能につなげられるよ。</p>
        <div className="yg8-auth-mode">
          <button className={mode==='register'?'sel':''} onClick={()=>{setMode('register');setLocalError('');}}>新規登録</button>
          <button className={mode==='login'?'sel':''} onClick={()=>{setMode('login');setLocalError('');}}>ログイン</button>
        </div>
        <label className="lbl">メールアドレス</label>
        <input className="field" placeholder="example@email.com" value={email} onChange={e=>setEmail(e.target.value)} autoCapitalize="none"/>
        <label className="lbl">パスワード</label>
        <input className="field" type="password" placeholder="6文字以上" value={pass} onChange={e=>setPass(e.target.value)}/>
        {mode==='login'&&<button className="yg8-linkbtn" style={{marginTop:-6,marginBottom:8,alignSelf:'flex-end'}} onClick={()=>{setResetEmail(email);setResetMode(true);}}>パスワードを忘れた方はこちら</button>}
        {(localError||authError||authNotice||localNotice)&&<div className={`auth-entry-msg ${(localError||authError)?'err':''}`}>{localError||authError||authNotice||localNotice}</div>}
        {/* 【修正】入力チェックを必ず行い、Supabaseでの成功・失敗に応じて画面を切り替える。
            以前は結果を確認せずに必ず先へ進んでいたが、それを廃止した。 */}
        <button className="yg8-primary" disabled={authLoading} onClick={async()=>{
          setLocalNotice('');setLocalError('');
          const validationError=validateAuthInput(email,pass);
          if(validationError){setLocalError(validationError);return;}
          if(mode==='register'&&onRegister){
            const result=await onRegister(email,pass);
            if(!result||!result.success)return; // エラーはauthErrorで表示される
            if(result.needsConfirmation){
              // 確認メール送信画面へ（親コンポーネント側で表示を切り替える）
              return;
            }
            onContinue();
            return;
          }
          if(mode==='login'&&onLogin){
            const result=await onLogin(email,pass);
            if(!result||!result.success)return; // エラーはauthErrorで表示される
            onContinue();
          }
        }}>{authLoading?'確認中…':mode==='register'?'✨無料ではじめる✨':'ログインする'}</button>
        {onGoogleLogin&&<>
          <div style={{display:'flex',alignItems:'center',gap:8,margin:'12px 0'}}>
            <div style={{flex:1,height:1,background:'#dceee8'}}/><span style={{fontSize:11,color:'#b0c8c0'}}>または</span>
            <div style={{flex:1,height:1,background:'#dceee8'}}/>
          </div>
          <button className="yg8-secondary" disabled={authLoading} onClick={()=>onGoogleLogin()}>Googleでログイン</button>
        </>}
        <button className="yg8-secondary" onClick={onContinue}>メール設定はあとで、体験版で始める</button>
        <button className="yg8-linkbtn" onClick={()=>setStep(3)}>← 戻る</button>
      </div>
    </div>
  );
}



function RegisterScreen({onDone,onLogin,onRegister,onGoogleLogin,onResetPassword,authLoading,authError,authNotice,hasSession}){
  // 【修正】すでにSupabaseのログイン済み(hasSession)なら、マーケティング画面や認証フォームは
  // 不要なので、最初からプロフィール設定(step4)を表示する。
  const [step,setStep]=useState(()=>hasSession?4:0);
  const [selActs,setSelActs]=useState([]);
  const [freq,setFreq]=useState(null);
  const [name,setName]=useState('');
  const [bio,setBio]=useState('');
  const [email,setEmail]=useState('');
  const [pass,setPass]=useState('');
  const [mode,setMode]=useState('register');
  const [localNotice,setLocalNotice]=useState('');
  const [localError,setLocalError]=useState('');
  // 【新規追加】パスワードを忘れた方向けの再設定モード
  const [resetMode,setResetMode]=useState(false);
  const [resetEmail,setResetEmail]=useState('');
  const toggle=id=>setSelActs(s=>s.includes(id)?s.filter(x=>x!==id):[...s,id]);
  const goOnboard=()=>setStep(4);
  const cards=[
    {emoji:'🐼',kicker:'WELCOME',title:'パンダと一緒に\n1日3分のゆる運動',text:'頑張りすぎなくていい。褒められながら、ちょっとだけ健康になろう。',btn:'はじめる'},
    {emoji:'🐼💬',kicker:'PANDA TALK',title:'疲れた日も、\n食べすぎた日も大丈夫。',text:'パンダ相談室が、今日の気分に合わせてやさしく声をかけるよ。',btn:'次へ'},
    {emoji:'🐼🏠',kicker:'PANDA ROOM',title:'運動すると\nパンダのお部屋が育つ',text:'家具を集めて、自分だけのパンダルームを作ろう。',btn:'無料ではじめる'}
  ];

  if(step<3){
    const c=cards[step];
    return(
      <div className="welcome-screen">
        <div className="welcome-bg-orb orb-one"/><div className="welcome-bg-orb orb-two"/>
        <div className="welcome-hero fade-up">
          <div className="welcome-badge">{c.kicker}</div>
          <div className="welcome-panda">{c.emoji}</div>
          <h1>{c.title.split('\n').map((t,i)=><React.Fragment key={i}>{t}{i<c.title.split('\n').length-1&&<br/>}</React.Fragment>)}</h1>
          <p>{c.text}</p>
          <div className="welcome-feature-row">
            <span>🌱 1分でもOK</span><span>🍜 食べすぎOK</span><span>✨ 褒められる</span>
          </div>
          <div className="welcome-dots">{cards.map((_,i)=><span key={i} className={i===step?'active':''}/>)}</div>
          <button className="welcome-main-btn" onClick={()=>setStep(step+1)}>{c.btn}</button>
          {step===0&&<button className="welcome-sub-btn" onClick={goOnboard}>まずは体験してみる</button>}
          {step>0&&<button className="welcome-sub-btn" onClick={()=>setStep(step-1)}>← 戻る</button>}
          {step===0&&<button className="welcome-sub-btn" onClick={()=>setStep(3)}>登録画面へ</button>}
        </div>
      </div>
    );
  }

  // 【新規追加】パスワード再設定モードの画面
  if(step===3&&resetMode)return(
    <div className="welcome-screen auth-entry-screen">
      <div className="welcome-bg-orb orb-one"/><div className="welcome-bg-orb orb-two"/>
      <div className="auth-entry-card fade-up">
        <div className="welcome-badge">パスワード再設定</div>
        <div className="auth-panda">🐼🔑</div>
        <h1>パスワードを忘れた方へ</h1>
        <p>登録したメールアドレスを入力してね。再設定用のリンクを送るよ🐼</p>
        <label className="lbl">メールアドレス</label>
        <input className="field" placeholder="example@email.com" value={resetEmail} onChange={e=>setResetEmail(e.target.value)} autoCapitalize="none"/>
        {(authError||authNotice)&&<div className={`auth-entry-msg ${authError?'err':''}`}>{authError||authNotice}</div>}
        <button className="welcome-main-btn" disabled={authLoading} onClick={async()=>{
          if(onResetPassword)await onResetPassword(resetEmail);
        }}>{authLoading?'送信中…':'再設定メールを送る'}</button>
        <button className="welcome-sub-btn" onClick={()=>setResetMode(false)}>← ログインへ戻る</button>
      </div>
    </div>
  );

  if(step===3)return(
    <div className="welcome-screen auth-entry-screen">
      <div className="welcome-bg-orb orb-one"/><div className="welcome-bg-orb orb-two"/>
      <div className="auth-entry-card fade-up">
        <div className="welcome-badge">START</div>
        <div className="auth-panda">🐼✨</div>
        <h1>一緒にゆるく続けよう</h1>
        <p>メール登録すると、将来データ保存や機種変更にもつなげやすくなるよ。</p>
        <div className="auth-mode-row">
          <button className={mode==='register'?'sel':''} onClick={()=>{setMode('register');setLocalError('');}}>新規登録</button>
          <button className={mode==='login'?'sel':''} onClick={()=>{setMode('login');setLocalError('');}}>ログイン</button>
        </div>
        <label className="lbl">メールアドレス</label>
        <input className="field" placeholder="example@email.com" value={email} onChange={e=>setEmail(e.target.value)} autoCapitalize="none"/>
        <label className="lbl">パスワード</label>
        <input className="field" type="password" placeholder="6文字以上" value={pass} onChange={e=>setPass(e.target.value)}/>
        {mode==='login'&&<button className="welcome-sub-btn" style={{marginTop:-4,marginBottom:6}} onClick={()=>{setResetEmail(email);setResetMode(true);}}>パスワードを忘れた方はこちら</button>}
        {(localError||authError||authNotice||localNotice)&&<div className={`auth-entry-msg ${(localError||authError)?'err':''}`}>{localError||authError||authNotice||localNotice}</div>}
        {/* 【修正】入力チェックを必ず行い、Supabaseでの成功・失敗に応じて画面を切り替える。
            以前は結果を確認せずに必ずgoOnboard()していたが、それを廃止した。 */}
        <button className="welcome-main-btn" disabled={authLoading} onClick={async()=>{
          setLocalNotice('');setLocalError('');
          const validationError=validateAuthInput(email,pass);
          if(validationError){setLocalError(validationError);return;}
          if(mode==='register'&&onRegister){
            const result=await onRegister(email,pass);
            if(!result||!result.success)return; // エラーはauthErrorで表示される
            if(result.needsConfirmation)return; // 確認メール送信画面へ（親側で切り替わる）
            goOnboard();
            return;
          }
          if(mode==='login'&&onLogin){
            const result=await onLogin(email,pass);
            if(!result||!result.success)return; // エラーはauthErrorで表示される
            goOnboard();
          }
        }}>{authLoading?'確認中…':mode==='register'?'✨無料ではじめる✨':'ログインする'}</button>
        {onGoogleLogin&&<>
          <div style={{display:'flex',alignItems:'center',gap:8,margin:'10px 0'}}>
            <div style={{flex:1,height:1,background:'#dceee8'}}/><span style={{fontSize:11,color:'#b0c8c0'}}>または</span>
            <div style={{flex:1,height:1,background:'#dceee8'}}/>
          </div>
          <button className="welcome-sub-btn" disabled={authLoading} onClick={()=>onGoogleLogin()}>Googleでログイン</button>
        </>}
        <button className="welcome-sub-btn" onClick={goOnboard}>メール設定はあとで、体験版で始める</button>
        <button className="welcome-sub-btn" onClick={()=>setStep(2)}>← 戻る</button>
      </div>
    </div>
  );

  if(step===4)return(
    <div style={{height:'100%',overflowY:'auto'}}>
      <PH msg="はじめまして！" sub="どんな運動でもOK。ゆるく続けることが大事"/>
      <div style={{padding:'16px 14px 100px'}} className="fade-up">
        <div className="step-dots"><div className="step-dot done"/><div className="step-dot"/></div>
        <div style={{fontSize:10,color:'#7aada0',fontWeight:700,marginBottom:3}}>STEP 1 / 2</div>
        <div style={{fontSize:18,fontWeight:800,color:'#1a4038',marginBottom:3}}>どんな運動が多いですか？</div>
        <div style={{fontSize:12,color:'#7aada0',marginBottom:14}}>複数OK。あとで変えられるよ。</div>
        <div style={{display:'flex',flexWrap:'wrap',gap:8,marginBottom:16}}>
          {ACTS.map(a=><button key={a.id} className={`chip${selActs.includes(a.id)?' sel':''}`} onClick={()=>toggle(a.id)}>{a.icon} {a.label}</button>)}
        </div>
        <div style={{fontSize:12,color:'#7aada0',fontWeight:700,marginBottom:8}}>目標頻度は？</div>
        <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:16}}>
          {FREQS.map(f=><button key={f.id} className={`chip${freq===f.id?' sel':''}`} onClick={()=>setFreq(f.id)} style={{fontSize:12,padding:'7px 12px'}}>{f.label}</button>)}
        </div>
        <div style={{fontSize:11,color:'#7aada0',lineHeight:1.65,background:'#e4f5f0',borderRadius:12,padding:'10px 13px',marginBottom:16}}>
          高い目標はいりません。週1でも十分です。パンダも週1しか運動しない 😂
        </div>
        <button className="btn btn-primary" disabled={!selActs.length||!freq} onClick={()=>setStep(5)}>次へ進む</button>
      </div>
    </div>
  );

  return(
    <div style={{height:'100%',overflowY:'auto'}}>
      <PH msg="もう少しだよ！" sub="ニックネームを教えてね"/>
      <div style={{padding:'16px 14px 100px'}} className="fade-up">
        <div className="step-dots"><div className="step-dot done"/><div className="step-dot done"/></div>
        <div style={{fontSize:10,color:'#7aada0',fontWeight:700,marginBottom:3}}>STEP 2 / 2</div>
        <div style={{fontSize:18,fontWeight:800,color:'#1a4038',marginBottom:12}}>あなたの名前は？</div>
        <label className="lbl">ニックネーム</label>
        <input className="field" style={{marginBottom:11}} placeholder="例：ゆるパンダ" value={name} onChange={e=>setName(e.target.value)} maxLength={20}/>
        <label className="lbl">ひとこと（任意）</label>
        <input className="field" style={{marginBottom:18}} placeholder="例: 三日坊主の達人です" value={bio} onChange={e=>setBio(e.target.value)} maxLength={40}/>
        <button className="btn btn-primary" disabled={!name.trim()} onClick={()=>onDone({name:name.trim(),bio:bio.trim(),email:email.trim()})}>はじめる</button>
        <button className="btn-ghost" onClick={()=>setStep(4)}>← 戻る</button>
      </div>
    </div>
  );
}

/* ═══════════════ ホーム ═══════════════ */

function levelInfo(state,streak){
  const total=state.reports.length;
  if(total>=30||streak>=14)return{lv:'ゆる仙人',emoji:'🧘',next:'もう“続ける人”側にいるよ'};
  if(total>=15||streak>=7)return{lv:'ゆる達人',emoji:'🏆',next:'次は14日継続でゆる仙人！'};
  if(total>=7||streak>=3)return{lv:'ゆる常連',emoji:'🐼',next:'7回記録でゆる達人！'};
  return{lv:'ゆる入門',emoji:'🌱',next:'まずは3回記録でゆる常連！'};
}
function retentionMessage(state,streak,todayDone){
  if(todayDone)return'今日も記録済み！こういう小さい達成がいちばん強い✨';
  if(state.reports.length===0)return'最初の1回は、30秒ストレッチでも合格だよ🐼';
  const days=dSince(state.reports[state.reports.length-1].ts);
  if(days>=7)return'久しぶりでも大丈夫。戻ってきた時点で勝ち！';
  if(days>=3)return'少し空いても、再開できる人がいちばん強いよ';
  if(streak>=7)return'7日以上継続中！今日は軽めでも流れは切れないよ';
  if(streak>=3)return'いい流れきてる！でも無理しないのがゆるトレ流';
  return'今日は「やる気が出たら」でOK。開いた時点で一歩前進！';
}
function badgeList(state,streak){
  const total=state.reports.length;
  const acts=new Set(state.reports.map(r=>r.aid));
  return[
    {ok:total>=1,icon:'🌱',name:'はじめの一歩'},
    {ok:streak>=3,icon:'🔥',name:'3日ゆる継続'},
    {ok:streak>=7,icon:'🏆',name:'7日チャレンジ'},
    {ok:acts.size>=3,icon:'🎨',name:'いろいろ運動'},
    {ok:total>=10,icon:'🐼',name:'ゆる常連'},
  ];
}
function todayMissions(state){
  const m=daily365Mission();
  const done=missionDoneToday(state);
  const total=missionCount(state);
  return [
    {...m, done, title:done?'今日のミッション達成済み':m.title, text:done?'えらい！明日のミッションもゆるくいこう🐼':m.text},
    {icon:'🐼',title:'パンダポイント',text:`現在 ${pandaPointCount(state)} pt`},
    {icon:'🏡',title:'ルーム連動',text:`ミッション達成 ${total} 回で家具が増えるよ`}
  ];
}

function scrollToGuideTarget(id){
  const el=document.querySelector(`[data-guide-target="${id}"]`);
  if(el) el.scrollIntoView({behavior:'smooth',block:'start'});
}

/* ═══════════════ 【v26新規追加】ホーム画面 表示設定 ═══════════════
   v26「余白のある、毎日開きたくなるホーム画面」のための表示スイッチです。
   ここを true に戻すだけで、各カードがホーム画面に再表示されます。
   ※コンポーネント・関数・保存データ（localStorage/Supabase）は一切削除していません。 */
const HOME_SHOW={
  guideSteps:false,    // 今日のゆる順路（3つのSTEP案内）
  daily365Rich:false,  // 今日のひとこと（旧・装飾ありカード）※簡潔版を表示中
  statChips:false,     // 継続日数・今週日数・AI褒め待機中のチップ
  weekCard:false,      // この1週間カード
  naviCard:false,      // 今日のゆるナビ（レベル・来店日数・ゆるミッション・バッジ一覧・次の目標）
  moodCard:false,      // 気分診断・種目別おすすめ・今日の目標・今週のゆる継続スタンプ
  rewardGarden:false,  // ゆる花（RewardGarden）※将来コレクション機能で再利用予定
  chatRoom:false,      // パンダ相談室の常時表示 ※将来パンダタップで開く方式へ変更予定
  timeCapsule:false,   // タイムカプセルの常時表示
  memoryPeek:false,    // 思い出表示（MemoryPeek）
  legacyCta:false      // 旧・運動記録ボタン（緑グラデ版）※新デザインで表示中
};

function HomeScreen({state,setState,streak,pct,aiLoad,onOpenReport,openRoomSignal,onRoomOpened}){
  // 【v27新規追加】パンダルーム専用ビュー(全画面)の表示状態。
  // リロードすると自動的にホームへ戻る(保存しない)ため、再読み込みでアプリが壊れない。
  const [showRoomFull,setShowRoomFull]=useState(false);
  // 【v38新規追加】記録後の「見に行く」を受け取ってパンダルームを全画面で開く。
  // 合図は一度使ったら親側で0に戻すので、あとからホームに戻っても勝手には開かない。
  useEffect(()=>{if(openRoomSignal){setShowRoomFull(true);onRoomOpened&&onRoomOpened();}},[openRoomSignal]);
  const homeAnchorRef=useRef(null);              // ポータル先(デバイス枠)を探すための起点
  const [roomLayer,setRoomLayer]=useState(null);
  useEffect(()=>{setRoomLayer(roomLayerTarget(homeAnchorRef.current));},[]);
  // 【v28新規追加】来店の1日1回判定。
  // ここ(HomeScreenマウント時)で1回だけ行うので、パンダルームの開閉や
  // 全画面の出入り・再読み込みでは木の実が重複付与されない(クレーム方式)。
  const [entryTalk,setEntryTalk]=useState(null);
  useEffect(()=>{
    try{
      const v=ensureDailyVisit(state.auth);
      if(v.firstToday)trackEvent('app_open'); // 計測: 1日1回だけ
      if(v.needReward&&setState){
        // 木の実のおすそわけ = 内部的には pandaPoints +2 (既存構造・既存保存経路のまま)
        setState(s=>({...s,pandaPoints:(s.pandaPoints||0)+2}));
      }
      let talk=buildRoomEntryTalk({gap:v.gap,needGreet:v.needGreet,needReward:v.needReward,name:(state.user&&state.user.name)||'あなた'});
      // 【v30新規追加】初回専用発言(アカウントにつき1回だけ・バイブル§5.2)
      try{
        const ps=loadPandaStats(state.auth);
        if(!ps.firstRoomGreetingShown){
          const line='まだ何もないお部屋だけど、これから一緒に育てていこうね〜🐼';
          if(talk&&talk.lines)talk={...talk,lines:[line].concat(talk.lines)};
          else talk={lines:[line],joy:0};
          bumpPandaStats(state.auth,s=>{s.firstRoomGreetingShown=true;return s;});
        }
      }catch(e){}
      if(talk)setEntryTalk(talk);
    }catch(e){}
  },[]);
  // 全画面ビュー表示中は、うしろのホーム画面がスクロールしないようにロックする
  useEffect(()=>{
    if(!showRoomFull||!roomLayer||!roomLayer.querySelector)return;
    const scr=roomLayer.querySelector('.screen');
    const prev=scr?scr.style.overflow:'';
    if(scr)scr.style.overflow='hidden';
    return()=>{if(scr)scr.style.overflow=prev;};
  },[showRoomFull,roomLayer]);
  const [selectedMood,setSelectedMood]=useState(state.mood||'genki');
  const mood=moodInfo(selectedMood);
  const [supportCat,setSupportCat]=useState(mood.cat||'walk');
  useEffect(()=>{setSupportCat(mood.cat||'walk');},[selectedMood]);
  const support=dailySupport(supportCat);
  const daily365=daily365Message();
  const dailyMission=daily365Mission();
  const dailyMissionDone=missionDoneToday(state);
  const todayMissionKey=missionDayKey();
  const missionTotal=missionCount(state);
  const pandaPoints=pandaPointCount(state);
  const completeDailyMission=()=>{
    trackEvent('mission_completed'); // 【v28新規追加】計測
    if(dailyMissionDone)return;
    setState(s=>({
      ...s,
      completedMissions:{...(s.completedMissions||{}),[todayMissionKey]:{...dailyMission,ts:Date.now()}},
      missionHistory:[...(s.missionHistory||[]),{...dailyMission,dayKey:todayMissionKey,ts:Date.now()}],
      pandaPoints:(s.pandaPoints||0)+(dailyMission.points||5)
    }));
  };
  const supportLabel=SUPPORT_CATS.find(c=>c.id===supportCat)?.label||'ウォーキング';
  const days=[];
  for(let i=6;i>=0;i--){
    const d=new Date();d.setDate(d.getDate()-i);d.setHours(0,0,0,0);
    const k=dk(d);
    days.push({k,done:state.reports.some(r=>dk(r.ts)===k),isToday:i===0,lbl:'日月火水木金土'[d.getDay()]});
  }
  const todayDone=state.reports.some(r=>dk(r.ts)===tk());
  const isComeback=state.reports.length>0&&dSince(state.reports[state.reports.length-1].ts)>=3&&!todayDone;
  const emotion=pandaEmotion({moodId:selectedMood,streak,visits:state.visits||1,todayDone,isComeback});
  const level=levelInfo(state,streak);
  const badges=badgeList(state,streak);
  const missions=todayMissions(state);
  const rmsg=retentionMessage(state,streak,todayDone);

  return(
    <div className="fade-up">
      {/* ① 挨拶＋ゆるパンダのひとこと（既存PHヘッダーを維持） */}
      <PH msg={`こんにちは、${state.user.name}さん`}
          sub={todayDone?'今日もおつかれさまでした！ゆるっと続けてえらい':isComeback?'おかえり！また戻ってきてくれてうれしい':'ゆるっと続けるあなたが いちばんすごいよ〜！💗'}
          pct={pct}/>

      {/* ② パンダルーム（v26：ホーム上部へ移動・主役表示。hero指定で周囲の説明を最小化） */}
      <div data-guide-target="room" style={{scrollMarginTop:12}}>
        <RoomErrorBoundary>
          {/* 【v42.2】全画面パンダルームを開いているあいだは、裏に隠れているこちらの
              ミニアクションのタイマーを止める(二重に動かさない・無駄に動かさない) */}
          <PandaRoom state={state} setState={setState} streak={streak} hero={true} entryTalk={entryTalk} paused={showRoomFull}/>
        </RoomErrorBoundary>
      </div>

      {/* 【v27新規追加】パンダルーム専用ビュー(全画面)を開くボタン */}
      <button type="button" ref={homeAnchorRef} className="room-visit-btn" onClick={()=>{trackEvent('panda_room_open');setShowRoomFull(true);}}>🐼 お部屋に遊びに行く</button>

      {/* 【v27新規追加】パンダルーム専用ビュー（全画面）。「ホームへ戻る」または画像内の「ホームへ」で閉じる。
          .fade-upのtransformの影響を受けないよう、デバイス枠へポータル描画する */}
      {showRoomFull&&roomLayer&&ReactDOM.createPortal(
        <div className="room-full-view">
          <div className="room-full-head">
            <button type="button" className="room-full-back" aria-label="ホームへ戻る" onClick={()=>setShowRoomFull(false)}>← ホームへ戻る</button>
            <div className="room-full-title">パンダのおうち</div>
            <div style={{width:104,flexShrink:0}}/>
          </div>
          <div className="room-full-body">
            <RoomErrorBoundary onExit={()=>setShowRoomFull(false)}>
              <PandaRoom state={state} setState={setState} streak={streak} fullView={true} onExitRoom={()=>setShowRoomFull(false)}/>
            </RoomErrorBoundary>
          </div>
        </div>
      ,roomLayer)}

      {/* ③ 今日の運動を記録する（v26：主要アクションとして大きく表示。onOpenReportの遷移は従来どおり） */}
      <div className="card home-cta-card" onClick={onOpenReport} role="button">
        <div className="home-cta-plus">＋</div>
        <div className="home-cta-text">
          <div className="home-cta-title">今日の運動を記録する</div>
          <div className="home-cta-sub">3タップで完了！</div>
        </div>
        <div className="home-cta-arrow">›</div>
      </div>

      {/* AI褒めの読み込み表示（記録直後だけ一時的に出る既存機能。常時表示ではないため維持） */}
      {aiLoad&&(
        <div className="card" style={{marginTop:10}}>
          <div style={{display:'flex',alignItems:'center',gap:12}}>
            <div style={{width:36,height:36,borderRadius:'50%',background:'#4DB89E',display:'flex',alignItems:'center',justifyContent:'center',fontSize:18,flexShrink:0}}>🐼</div>
            <div><div style={{fontSize:12,color:'#7aada0',marginBottom:4,fontWeight:600}}>ゆるさん</div><div className="dot-anim"><span/><span/><span/></div></div>
          </div>
        </div>
      )}

      {/* ④ 今日のひとこと（v26：簡潔版カード。365日データと自動切替処理はそのまま利用） */}
      <div className="card home-daily-simple">
        <div className="home-daily-label">今日のひとこと <span>365日中 {daily365.day}日目</span></div>
        <div className="home-daily-text">{daily365.text}</div>
      </div>

      {/* おかえりメッセージ（世界観の中核のため維持） */}
      {isComeback&&(
        <div className="card" style={{background:'linear-gradient(135deg,#fff5ed,#ffe4d4)',border:'1.5px solid rgba(255,107,107,0.18)'}}>
          <div style={{fontSize:13,fontWeight:700,color:'#c04040',marginBottom:5}}>🐼 おかえりメッセージ</div>
          <div style={{fontSize:13,color:'#5a3030',lineHeight:1.7}}>少し間があいたみたいだけど、また戻ってきてくれてうれしいよ。今日はストレッチ10分だけでも十分だよ。</div>
        </div>
      )}

      {/* ⑤ 最近の記録（v26：最新1件のみ） */}
      {state.reports.length>0&&(
        <div className="card">
          <div className="card-title">📝 最近の記録</div>
          {/* 【v26変更】表示は最新1件のみ。元に戻す場合は slice(-1) を slice(-3) に変更 */}
          {state.reports.slice(-1).reverse().map(r=>{
            const a=ACTS.find(x=>x.id===r.aid);
            return(
              <div key={r.id} className="rec-row">
                <div><div style={{fontSize:13,fontWeight:600,color:'#1a3030'}}>{a?.icon} {a?.label}</div>{r.note&&<div style={{fontSize:11,color:'#a0b8b0',marginTop:1}}>{r.note}</div>}{r.photo&&<div className="rec-photo-mark">📷 写真あり</div>}</div>
                {r.photo&&<img src={r.photo.dataUrl} className="rec-thumb" alt="記録写真"/>}
                <span className="rec-tag">{fmtTs(r.ts)}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════
          【v26でホームから非表示にしたカード】
          機能・関数・保存データは一切削除していません。
          下の HOME_SHOW の各フラグを true に戻すだけで再表示できます。
          将来、別画面やメニューへ移設する際もこのブロックを移動するだけです。
         ═══════════════════════════════════════════════════════ */}
      {HOME_SHOW.guideSteps&&(
      <div className="card" style={{marginTop:10,background:'linear-gradient(135deg,#fff7df,#eafff7)',border:'1.5px solid rgba(77,184,158,0.18)',boxShadow:'0 8px 22px rgba(77,184,158,0.12)'}}>
        <div style={{display:'flex',gap:12,alignItems:'flex-start',marginBottom:12}}>
          <div style={{width:52,height:52,borderRadius:'20px',background:'#ffffff',display:'flex',alignItems:'center',justifyContent:'center',boxShadow:'0 5px 14px rgba(0,0,0,0.07)',flexShrink:0}}><PandaMascot variant="happy" size="xs"/></div>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:12,color:'#4DB89E',fontWeight:900,marginBottom:4}}>今日のゆる順路</div>
            <div style={{fontSize:17,color:'#1a5044',fontWeight:900,lineHeight:1.45}}>迷ったら、この順番でOKだよ〜🐼</div>
            <div style={{fontSize:11,color:'#7aada0',fontWeight:700,marginTop:4}}>まず気分、次にミッション、最後にパンダルームを見に行こう</div>
          </div>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8}}>
          <button onClick={()=>scrollToGuideTarget('mood')} className="guide-step-btn" style={{border:'none',borderRadius:18,padding:'12px 8px',background:'#ffffff',boxShadow:'0 3px 10px rgba(0,0,0,0.06)',cursor:'pointer',textAlign:'center'}}>
            <div style={{fontSize:22,marginBottom:5}}>😊</div>
            <div style={{fontSize:10,color:'#7aada0',fontWeight:900,marginBottom:3}}>STEP 1</div>
            <div style={{fontSize:12,color:'#1a5044',fontWeight:900,lineHeight:1.35}}>今日の気分を<br/>選んでね！</div>
          </button>
          <button onClick={()=>scrollToGuideTarget('mission')} className="guide-step-btn" style={{border:'none',borderRadius:18,padding:'12px 8px',background:'#ffffff',boxShadow:'0 3px 10px rgba(0,0,0,0.06)',cursor:'pointer',textAlign:'center'}}>
            <div style={{fontSize:22,marginBottom:5}}>🎯</div>
            <div style={{fontSize:10,color:'#7aada0',fontWeight:900,marginBottom:3}}>STEP 2</div>
            <div style={{fontSize:12,color:'#1a5044',fontWeight:900,lineHeight:1.35}}>ミッションを<br/>やってみよう！</div>
          </button>
          <button onClick={()=>scrollToGuideTarget('room')} className="guide-step-btn" style={{border:'none',borderRadius:18,padding:'12px 8px',background:'#ffffff',boxShadow:'0 3px 10px rgba(0,0,0,0.06)',cursor:'pointer',textAlign:'center'}}>
            <div style={{fontSize:22,marginBottom:5}}>🏠</div>
            <div style={{fontSize:10,color:'#7aada0',fontWeight:900,marginBottom:3}}>STEP 3</div>
            <div style={{fontSize:12,color:'#1a5044',fontWeight:900,lineHeight:1.35}}>パンダルームを<br/>見てみよう！</div>
          </button>
        </div>
      </div>
      )}
      {HOME_SHOW.daily365Rich&&(
      <div className="card daily-365-card" style={{marginTop:10,background:'linear-gradient(135deg,#fff8e8,#f2fff9)',border:'1.5px solid rgba(240,180,80,0.22)'}}>
        <div style={{display:'flex',alignItems:'center',gap:12}}>
          <div style={{width:48,height:48,borderRadius:'18px',background:'#ffffff',display:'flex',alignItems:'center',justifyContent:'center',fontSize:25,boxShadow:'0 4px 12px rgba(0,0,0,0.06)',flexShrink:0}}>🐼</div>
          <div style={{flex:1,minWidth:0}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:8,marginBottom:5}}>
              <div style={{fontSize:12,color:'#c29244',fontWeight:900}}>今日のひとこと</div>
              <div style={{fontSize:10,color:'#4DB89E',fontWeight:900,background:'#e9fbf4',borderRadius:999,padding:'5px 8px'}}>365日中 {daily365.day}日目</div>
            </div>
            <div style={{fontSize:15,color:'#3f4f49',lineHeight:1.65,fontWeight:800}}>{daily365.text}</div>
            <div style={{fontSize:10,color:'#9bb8b0',fontWeight:700,marginTop:6}}>毎日ひとつ、自動で切り替わるよ</div>
          </div>
        </div>
      </div>
      )}
      {HOME_SHOW.statChips&&(
      <div style={{display:'flex',gap:8,padding:'10px 13px 2px',flexWrap:'wrap'}}>
        <div style={{background:'white',borderRadius:999,padding:'6px 12px',boxShadow:'0 2px 8px rgba(0,0,0,0.07)',fontSize:12,fontWeight:700,color:'#e85858'}}>🔥 {streak}日継続</div>
        <div style={{background:'white',borderRadius:999,padding:'6px 12px',boxShadow:'0 2px 8px rgba(0,0,0,0.07)',fontSize:12,fontWeight:700,color:'#e8a820'}}>📅 今週{days.filter(d=>d.done).length}日</div>
        <div style={{background:'white',borderRadius:999,padding:'6px 12px',boxShadow:'0 2px 8px rgba(0,0,0,0.07)',fontSize:12,fontWeight:700,color:'#4DB89E'}}>🐼 AI褒め待機中</div>
      </div>
      )}
      {HOME_SHOW.weekCard&&(
      <div className="card" style={{marginTop:10}}>
        <div className="card-title">🗓 この1週間</div>
        <div className="week-dots">
          {days.map(d=><div key={d.k} className={`wdot ${d.done?'done':d.isToday?'today':'empty'}`}>{d.lbl}</div>)}
        </div>
        <div style={{fontSize:11,color:'#7aada0',marginTop:7,textAlign:'right'}}>動けた日 {days.filter(d=>d.done).length} / 7</div>
      </div>
      )}
      {HOME_SHOW.naviCard&&(
      <div className="card" data-guide-target="mission" style={{scrollMarginTop:12,background:'linear-gradient(135deg,#fffdf4,#f3fff9)',border:'1.5px solid rgba(77,184,158,0.18)'}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:10,marginBottom:10}}>
          <div>
            <div style={{fontSize:12,color:'#7aada0',fontWeight:800}}>今日のゆるナビ</div>
            <div style={{fontSize:18,fontWeight:900,color:'#1a5044',marginTop:2}}>{level.emoji} {level.lv}</div>
          </div>
          <div style={{fontSize:11,color:'#4DB89E',fontWeight:800,background:'#e9fbf4',borderRadius:999,padding:'7px 10px'}}>来店 {state.visits||1}日目</div>
        </div>
        <div style={{fontSize:13,color:'#435f58',lineHeight:1.65,background:'white',borderRadius:15,padding:'11px 12px',border:'1px solid #e8f3ef',marginBottom:12}}>{rmsg}</div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8,marginBottom:12}}>
          {missions.map((m,i)=><div key={i} style={{background:'#ffffff',border:'1px solid #e8f3ef',borderRadius:15,padding:'10px 8px',textAlign:'center'}}>
            <div style={{fontSize:20,marginBottom:4}}>{m.icon}</div>
            <div style={{fontSize:11,fontWeight:900,color:'#1a5044',marginBottom:4}}>{m.title}</div>
            <div style={{fontSize:10,color:'#7aada0',lineHeight:1.45}}>{m.text}</div>
          </div>)}
        </div>
        <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
          {badges.map((b,i)=><span key={i} style={{fontSize:10,fontWeight:800,borderRadius:999,padding:'6px 8px',background:b.ok?'#e7f7f1':'#f4f8f6',color:b.ok?'#3da888':'#b8c8c2',border:'1px solid '+(b.ok?'#cdeee2':'#e4efeb')}}>{b.icon} {b.name}</span>)}
        </div>
        <div style={{fontSize:10,color:'#9bb8b0',marginTop:9}}>次の目標：{level.next}</div>
      </div>
      )}
      {HOME_SHOW.moodCard&&(
      <div className="card" data-guide-target="mood" style={{scrollMarginTop:12,background:'linear-gradient(135deg,#ffffff,#f4fcf8)',border:'1.5px solid rgba(77,184,158,0.16)'}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:8,marginBottom:8}}>
          <div>
            <div style={{fontSize:12,color:'#7aada0',fontWeight:800}}>今日はどんな気分？</div>
            <div style={{fontSize:10,color:'#9bb8b0',fontWeight:700,marginTop:2}}>まず気分を選ぶだけでOK</div>
          </div>
          <div style={{fontSize:10,color:'#4DB89E',fontWeight:900,background:'#e9fbf4',borderRadius:999,padding:'6px 9px'}}>AIおすすめ変化</div>
        </div>
        <PandaEmotionCard emotion={emotion}/>
        <div style={{display:'grid',gridTemplateColumns:'repeat(2,1fr)',gap:8,marginBottom:12}}>
          {MOODS.map(m=><button key={m.id} className={`mood-choice-card ${selectedMood===m.id?'selected':''}`} onClick={()=>{setSelectedMood(m.id);setState&&setState(s=>({...s,mood:m.id}));}}>
            <div className="mood-choice-label">{m.label}</div>
            <MoodPandaFace variant={m.panda}/>
            <div className="mood-choice-tone">{m.tone}</div>
          </button>)}
        </div>
        <div key={selectedMood} className="fade-up" style={{display:'flex',gap:9,alignItems:'flex-start',background:'#fffdf4',border:'1.5px solid #f3e4c8',borderRadius:18,padding:'12px 12px',marginBottom:12,boxShadow:'0 3px 12px rgba(240,180,80,0.08)'}}>
          <div style={{width:46,height:46,borderRadius:'18px',background:'#fff2d5',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}><PandaMascot variant={mood.panda||'happy'} size="xs"/></div>
          <div>
            <div style={{fontSize:11,color:'#c29244',fontWeight:900,marginBottom:3}}>ゆるパンダの気分診断</div>
            <div style={{fontSize:13,color:'#4a3a20',lineHeight:1.65,fontWeight:700}}>{mood.message}</div>
            <div style={{fontSize:11,color:'#4DB89E',fontWeight:800,marginTop:6}}>今日のおすすめ：{mood.goal}</div>
          </div>
        </div>
        <div style={{fontSize:11,color:'#7aada0',fontWeight:800,marginBottom:7}}>おすすめ種目を変えたい時はこちら</div>
        <div style={{display:'flex',gap:7,flexWrap:'wrap',marginBottom:12}}>
          {SUPPORT_CATS.map(c=><button key={c.id} className={`chip${supportCat===c.id?' sel':''}`} onClick={()=>setSupportCat(c.id)} style={{fontSize:11,padding:'7px 10px'}}>{c.icon} {c.label}</button>)}
        </div>
        <div style={{display:'flex',gap:12,alignItems:'stretch'}}>
          <div style={{flex:1,background:'#f8fffc',borderRadius:16,padding:'13px 12px',border:'1px solid #dceee8'}}>
            <div style={{fontSize:12,color:'#7aada0',fontWeight:700,marginBottom:6}}>今日の目標</div>
            <div style={{fontSize:21,fontWeight:800,color:'#1a5044',lineHeight:1.35}}>{support.goal}</div>
            <div style={{fontSize:11,color:'#4DB89E',marginTop:8,fontWeight:600}}>{supportLabel}の日も、ゆるくてOK</div>
          </div>
          <div style={{flex:1,background:'#fffaf2',borderRadius:16,padding:'13px 12px',border:'1px solid #f3e4c8'}}>
            <div style={{fontSize:12,color:'#c29244',fontWeight:700,marginBottom:6}}>種目別ひとこと</div>
            <div style={{fontSize:13,color:'#4a3a20',lineHeight:1.65}}>{support.word}</div>
          </div>
        </div>
        <div style={{marginTop:12,background:'white',borderRadius:16,padding:'12px',border:'1px solid #e8f3ef'}}>
          <div style={{fontSize:12,color:'#7aada0',fontWeight:800,marginBottom:9}}>🐼 今週のゆる継続スタンプ</div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:6}}>
            {days.map(d=><div key={d.k} style={{textAlign:'center'}}>
              <div style={{fontSize:10,color:'#8ab0a8',fontWeight:700,marginBottom:4}}>{d.lbl}</div>
              <div style={{height:30,borderRadius:12,display:'flex',alignItems:'center',justifyContent:'center',fontSize:15,fontWeight:800,background:d.done?'#e7f7f1':d.isToday?'#fff3d8':'#f4f8f6',color:d.done?'#4DB89E':d.isToday?'#d6a13a':'#b8c8c2',border:d.isToday?'1.5px solid #f0d28a':'1px solid #e4efeb'}}>{d.done?'◯':d.isToday?'△':'-'}</div>
            </div>)}
          </div>
        </div>
      </div>
      )}
      {HOME_SHOW.rewardGarden&&<RewardGarden state={state} streak={streak}/>}
      {HOME_SHOW.chatRoom&&<PandaChatRoom state={state} setState={setState}/>}
      {HOME_SHOW.timeCapsule&&<TimeCapsuleCard state={state} setState={setState}/>}
      {HOME_SHOW.memoryPeek&&<MemoryPeek state={state}/>}
      {HOME_SHOW.legacyCta&&(
      <div className="card" onClick={onOpenReport} style={{background:'linear-gradient(135deg,#a8d894,#7eb868)',border:'none',cursor:'pointer',transition:'transform 0.15s,box-shadow 0.15s'}} onMouseDown={e=>{e.currentTarget.style.transform='scale(0.98)';}} onMouseUp={e=>{e.currentTarget.style.transform='scale(1)';}} onMouseLeave={e=>{e.currentTarget.style.transform='scale(1)';}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',color:'white'}}>
          <div style={{display:'flex',alignItems:'center',gap:10}}>
            <div style={{width:38,height:38,borderRadius:'50%',background:'white',display:'flex',alignItems:'center',justifyContent:'center',fontSize:22,color:'#7eb868',fontWeight:700}}>＋</div>
            <div>
              <div style={{fontSize:15,fontWeight:800,marginBottom:2}}>今日の運動を記録する</div>
              <div style={{fontSize:11,opacity:0.9}}>3タップで完了！</div>
            </div>
          </div>
          <div style={{fontSize:20}}>›</div>
        </div>
      </div>
      )}

      <div style={{height:8}}/>
    </div>
  );
}



const PANDA_CHAT_REPLIES = {
  "tired": [
    "疲れてるのに来てくれたの、もう満点だよ。深呼吸3回だけしよ🐼",
    "疲れてるのに来てくれたの、もう満点だよ。水を一口飲んで優勝☕",
    "疲れてるのに来てくれたの、もう満点だよ。首をゆっくり回したら花丸",
    "疲れてるのに来てくれたの、もう満点だよ。目を10秒閉じよ〜",
    "疲れてるのに来てくれたの、もう満点だよ。肩をくるっと1回で十分",
    "疲れてるのに来てくれたの、もう満点だよ。お風呂でリセットしよ",
    "疲れてるのに来てくれたの、もう満点だよ。早めに寝る作戦、最強",
    "疲れてるのに来てくれたの、もう満点だよ。ストレッチは明日の自分に丸投げOK",
    "疲れてるのに来てくれたの、もう満点だよ。今日は充電日でいこう",
    "疲れてるのに来てくれたの、もう満点だよ。パンダも隣でゴロゴロするね",
    "今日は休む才能を発揮する日〜。深呼吸3回だけしよ🐼",
    "今日は休む才能を発揮する日〜。水を一口飲んで優勝☕",
    "今日は休む才能を発揮する日〜。首をゆっくり回したら花丸",
    "今日は休む才能を発揮する日〜。目を10秒閉じよ〜",
    "今日は休む才能を発揮する日〜。肩をくるっと1回で十分",
    "今日は休む才能を発揮する日〜。お風呂でリセットしよ",
    "今日は休む才能を発揮する日〜。早めに寝る作戦、最強",
    "今日は休む才能を発揮する日〜。ストレッチは明日の自分に丸投げOK",
    "今日は休む才能を発揮する日〜。今日は充電日でいこう",
    "今日は休む才能を発揮する日〜。パンダも隣でゴロゴロするね",
    "肩の力を抜いたら、それだけでゆるトレ成功。深呼吸3回だけしよ🐼",
    "肩の力を抜いたら、それだけでゆるトレ成功。水を一口飲んで優勝☕",
    "肩の力を抜いたら、それだけでゆるトレ成功。首をゆっくり回したら花丸",
    "肩の力を抜いたら、それだけでゆるトレ成功。目を10秒閉じよ〜",
    "肩の力を抜いたら、それだけでゆるトレ成功。肩をくるっと1回で十分",
    "肩の力を抜いたら、それだけでゆるトレ成功。お風呂でリセットしよ",
    "肩の力を抜いたら、それだけでゆるトレ成功。早めに寝る作戦、最強",
    "肩の力を抜いたら、それだけでゆるトレ成功。ストレッチは明日の自分に丸投げOK",
    "肩の力を抜いたら、それだけでゆるトレ成功。今日は充電日でいこう",
    "肩の力を抜いたら、それだけでゆるトレ成功。パンダも隣でゴロゴロするね",
    "無理しない選択、かなりえらい。深呼吸3回だけしよ🐼",
    "無理しない選択、かなりえらい。水を一口飲んで優勝☕",
    "無理しない選択、かなりえらい。首をゆっくり回したら花丸",
    "無理しない選択、かなりえらい。目を10秒閉じよ〜",
    "無理しない選択、かなりえらい。肩をくるっと1回で十分",
    "無理しない選択、かなりえらい。お風呂でリセットしよ",
    "無理しない選択、かなりえらい。早めに寝る作戦、最強",
    "無理しない選択、かなりえらい。ストレッチは明日の自分に丸投げOK",
    "無理しない選択、かなりえらい。今日は充電日でいこう",
    "無理しない選択、かなりえらい。パンダも隣でゴロゴロするね",
    "今日は低速モードでいこう。深呼吸3回だけしよ🐼",
    "今日は低速モードでいこう。水を一口飲んで優勝☕",
    "今日は低速モードでいこう。首をゆっくり回したら花丸",
    "今日は低速モードでいこう。目を10秒閉じよ〜",
    "今日は低速モードでいこう。肩をくるっと1回で十分",
    "今日は低速モードでいこう。お風呂でリセットしよ",
    "今日は低速モードでいこう。早めに寝る作戦、最強",
    "今日は低速モードでいこう。ストレッチは明日の自分に丸投げOK",
    "今日は低速モードでいこう。今日は充電日でいこう",
    "今日は低速モードでいこう。パンダも隣でゴロゴロするね"
  ],
  "food": [
    "食べた幸せはちゃんと栄養〜。食後に1分立てば実質ゼロ🔥",
    "食べた幸せはちゃんと栄養〜。3分歩いたら伝説にしよ",
    "食べた幸せはちゃんと栄養〜。水を飲んでゆるリセット",
    "食べた幸せはちゃんと栄養〜。明日ちょい歩きで帳尻OK",
    "食べた幸せはちゃんと栄養〜。幸せカロリーはパンダが預かるね",
    "食べた幸せはちゃんと栄養〜。罪悪感はゴミ箱へぽい",
    "食べた幸せはちゃんと栄養〜。お腹をさすって深呼吸しよ",
    "食べた幸せはちゃんと栄養〜。今日は味わった自分を褒めよ",
    "食べた幸せはちゃんと栄養〜。写真撮ったなら飯テロ認定",
    "食べた幸せはちゃんと栄養〜。次の一歩はコンビニ遠回りでOK",
    "ラーメンは文化、反省はいらない🍜。食後に1分立てば実質ゼロ🔥",
    "ラーメンは文化、反省はいらない🍜。3分歩いたら伝説にしよ",
    "ラーメンは文化、反省はいらない🍜。水を飲んでゆるリセット",
    "ラーメンは文化、反省はいらない🍜。明日ちょい歩きで帳尻OK",
    "ラーメンは文化、反省はいらない🍜。幸せカロリーはパンダが預かるね",
    "ラーメンは文化、反省はいらない🍜。罪悪感はゴミ箱へぽい",
    "ラーメンは文化、反省はいらない🍜。お腹をさすって深呼吸しよ",
    "ラーメンは文化、反省はいらない🍜。今日は味わった自分を褒めよ",
    "ラーメンは文化、反省はいらない🍜。写真撮ったなら飯テロ認定",
    "ラーメンは文化、反省はいらない🍜。次の一歩はコンビニ遠回りでOK",
    "ピザを楽しめる人生、いいじゃん。食後に1分立てば実質ゼロ🔥",
    "ピザを楽しめる人生、いいじゃん。3分歩いたら伝説にしよ",
    "ピザを楽しめる人生、いいじゃん。水を飲んでゆるリセット",
    "ピザを楽しめる人生、いいじゃん。明日ちょい歩きで帳尻OK",
    "ピザを楽しめる人生、いいじゃん。幸せカロリーはパンダが預かるね",
    "ピザを楽しめる人生、いいじゃん。罪悪感はゴミ箱へぽい",
    "ピザを楽しめる人生、いいじゃん。お腹をさすって深呼吸しよ",
    "ピザを楽しめる人生、いいじゃん。今日は味わった自分を褒めよ",
    "ピザを楽しめる人生、いいじゃん。写真撮ったなら飯テロ認定",
    "ピザを楽しめる人生、いいじゃん。次の一歩はコンビニ遠回りでOK",
    "焼肉の日は心のタンパク質の日。食後に1分立てば実質ゼロ🔥",
    "焼肉の日は心のタンパク質の日。3分歩いたら伝説にしよ",
    "焼肉の日は心のタンパク質の日。水を飲んでゆるリセット",
    "焼肉の日は心のタンパク質の日。明日ちょい歩きで帳尻OK",
    "焼肉の日は心のタンパク質の日。幸せカロリーはパンダが預かるね",
    "焼肉の日は心のタンパク質の日。罪悪感はゴミ箱へぽい",
    "焼肉の日は心のタンパク質の日。お腹をさすって深呼吸しよ",
    "焼肉の日は心のタンパク質の日。今日は味わった自分を褒めよ",
    "焼肉の日は心のタンパク質の日。写真撮ったなら飯テロ認定",
    "焼肉の日は心のタンパク質の日。次の一歩はコンビニ遠回りでOK",
    "スイーツは心のストレッチ。食後に1分立てば実質ゼロ🔥",
    "スイーツは心のストレッチ。3分歩いたら伝説にしよ",
    "スイーツは心のストレッチ。水を飲んでゆるリセット",
    "スイーツは心のストレッチ。明日ちょい歩きで帳尻OK",
    "スイーツは心のストレッチ。幸せカロリーはパンダが預かるね",
    "スイーツは心のストレッチ。罪悪感はゴミ箱へぽい",
    "スイーツは心のストレッチ。お腹をさすって深呼吸しよ",
    "スイーツは心のストレッチ。今日は味わった自分を褒めよ",
    "スイーツは心のストレッチ。写真撮ったなら飯テロ認定",
    "スイーツは心のストレッチ。次の一歩はコンビニ遠回りでOK"
  ],
  "praise": [
    "今日も来てくれて本当にえらい。パンダが拍手してる👏",
    "今日も来てくれて本当にえらい。花丸を3つあげるね🌸",
    "今日も来てくれて本当にえらい。今日はごほうびの顔していい",
    "今日も来てくれて本当にえらい。胸を張って水飲も〜",
    "今日も来てくれて本当にえらい。小さくガッツポーズしよ",
    "今日も来てくれて本当にえらい。ゆるトレ界のスターだよ✨",
    "今日も来てくれて本当にえらい。未来の自分が喜んでる",
    "今日も来てくれて本当にえらい。その調子でゆるくいこ",
    "今日も来てくれて本当にえらい。えらすぎ警報発令中🐼",
    "今日も来てくれて本当にえらい。今夜は自分に優しくね",
    "ケンタロさん、ちゃんと前に進んでるよ。パンダが拍手してる👏",
    "ケンタロさん、ちゃんと前に進んでるよ。花丸を3つあげるね🌸",
    "ケンタロさん、ちゃんと前に進んでるよ。今日はごほうびの顔していい",
    "ケンタロさん、ちゃんと前に進んでるよ。胸を張って水飲も〜",
    "ケンタロさん、ちゃんと前に進んでるよ。小さくガッツポーズしよ",
    "ケンタロさん、ちゃんと前に進んでるよ。ゆるトレ界のスターだよ✨",
    "ケンタロさん、ちゃんと前に進んでるよ。未来の自分が喜んでる",
    "ケンタロさん、ちゃんと前に進んでるよ。その調子でゆるくいこ",
    "ケンタロさん、ちゃんと前に進んでるよ。えらすぎ警報発令中🐼",
    "ケンタロさん、ちゃんと前に進んでるよ。今夜は自分に優しくね",
    "続ける才能より戻る才能がすごい。パンダが拍手してる👏",
    "続ける才能より戻る才能がすごい。花丸を3つあげるね🌸",
    "続ける才能より戻る才能がすごい。今日はごほうびの顔していい",
    "続ける才能より戻る才能がすごい。胸を張って水飲も〜",
    "続ける才能より戻る才能がすごい。小さくガッツポーズしよ",
    "続ける才能より戻る才能がすごい。ゆるトレ界のスターだよ✨",
    "続ける才能より戻る才能がすごい。未来の自分が喜んでる",
    "続ける才能より戻る才能がすごい。その調子でゆるくいこ",
    "続ける才能より戻る才能がすごい。えらすぎ警報発令中🐼",
    "続ける才能より戻る才能がすごい。今夜は自分に優しくね",
    "小さな行動を積める人は強い。パンダが拍手してる👏",
    "小さな行動を積める人は強い。花丸を3つあげるね🌸",
    "小さな行動を積める人は強い。今日はごほうびの顔していい",
    "小さな行動を積める人は強い。胸を張って水飲も〜",
    "小さな行動を積める人は強い。小さくガッツポーズしよ",
    "小さな行動を積める人は強い。ゆるトレ界のスターだよ✨",
    "小さな行動を積める人は強い。未来の自分が喜んでる",
    "小さな行動を積める人は強い。その調子でゆるくいこ",
    "小さな行動を積める人は強い。えらすぎ警報発令中🐼",
    "小さな行動を積める人は強い。今夜は自分に優しくね",
    "自分を責めずに来たのえらい。パンダが拍手してる👏",
    "自分を責めずに来たのえらい。花丸を3つあげるね🌸",
    "自分を責めずに来たのえらい。今日はごほうびの顔していい",
    "自分を責めずに来たのえらい。胸を張って水飲も〜",
    "自分を責めずに来たのえらい。小さくガッツポーズしよ",
    "自分を責めずに来たのえらい。ゆるトレ界のスターだよ✨",
    "自分を責めずに来たのえらい。未来の自分が喜んでる",
    "自分を責めずに来たのえらい。その調子でゆるくいこ",
    "自分を責めずに来たのえらい。えらすぎ警報発令中🐼",
    "自分を責めずに来たのえらい。今夜は自分に優しくね"
  ],
  "skip": [
    "サボったんじゃなくて充電してたんだよ。今日は記録だけでOK🌱",
    "サボったんじゃなくて充電してたんだよ。1分だけ動けば再起動完了",
    "サボったんじゃなくて充電してたんだよ。パンダはずっと待ってたよ",
    "サボったんじゃなくて充電してたんだよ。また会えてうれしい🐼",
    "サボったんじゃなくて充電してたんだよ。深呼吸から始めよ",
    "サボったんじゃなくて充電してたんだよ。明日じゃなく今ここで復帰成功",
    "サボったんじゃなくて充電してたんだよ。責めるの禁止でいこう",
    "サボったんじゃなくて充電してたんだよ。小さく戻れば大勝利",
    "サボったんじゃなくて充電してたんだよ。今日はログインだけで花丸",
    "サボったんじゃなくて充電してたんだよ。ゆるく再開ボタン押そ",
    "戻ってきた時点で勝ち〜。今日は記録だけでOK🌱",
    "戻ってきた時点で勝ち〜。1分だけ動けば再起動完了",
    "戻ってきた時点で勝ち〜。パンダはずっと待ってたよ",
    "戻ってきた時点で勝ち〜。また会えてうれしい🐼",
    "戻ってきた時点で勝ち〜。深呼吸から始めよ",
    "戻ってきた時点で勝ち〜。明日じゃなく今ここで復帰成功",
    "戻ってきた時点で勝ち〜。責めるの禁止でいこう",
    "戻ってきた時点で勝ち〜。小さく戻れば大勝利",
    "戻ってきた時点で勝ち〜。今日はログインだけで花丸",
    "戻ってきた時点で勝ち〜。ゆるく再開ボタン押そ",
    "空白もちゃんと人生ログ。今日は記録だけでOK🌱",
    "空白もちゃんと人生ログ。1分だけ動けば再起動完了",
    "空白もちゃんと人生ログ。パンダはずっと待ってたよ",
    "空白もちゃんと人生ログ。また会えてうれしい🐼",
    "空白もちゃんと人生ログ。深呼吸から始めよ",
    "空白もちゃんと人生ログ。明日じゃなく今ここで復帰成功",
    "空白もちゃんと人生ログ。責めるの禁止でいこう",
    "空白もちゃんと人生ログ。小さく戻れば大勝利",
    "空白もちゃんと人生ログ。今日はログインだけで花丸",
    "空白もちゃんと人生ログ。ゆるく再開ボタン押そ",
    "休んだ分だけ再開がえらい。今日は記録だけでOK🌱",
    "休んだ分だけ再開がえらい。1分だけ動けば再起動完了",
    "休んだ分だけ再開がえらい。パンダはずっと待ってたよ",
    "休んだ分だけ再開がえらい。また会えてうれしい🐼",
    "休んだ分だけ再開がえらい。深呼吸から始めよ",
    "休んだ分だけ再開がえらい。明日じゃなく今ここで復帰成功",
    "休んだ分だけ再開がえらい。責めるの禁止でいこう",
    "休んだ分だけ再開がえらい。小さく戻れば大勝利",
    "休んだ分だけ再開がえらい。今日はログインだけで花丸",
    "休んだ分だけ再開がえらい。ゆるく再開ボタン押そ",
    "途切れても終わりじゃないよ。今日は記録だけでOK🌱",
    "途切れても終わりじゃないよ。1分だけ動けば再起動完了",
    "途切れても終わりじゃないよ。パンダはずっと待ってたよ",
    "途切れても終わりじゃないよ。また会えてうれしい🐼",
    "途切れても終わりじゃないよ。深呼吸から始めよ",
    "途切れても終わりじゃないよ。明日じゃなく今ここで復帰成功",
    "途切れても終わりじゃないよ。責めるの禁止でいこう",
    "途切れても終わりじゃないよ。小さく戻れば大勝利",
    "途切れても終わりじゃないよ。今日はログインだけで花丸",
    "途切れても終わりじゃないよ。ゆるく再開ボタン押そ"
  ],
  "done": [
    "動いたの最高すぎる。パンダが全力拍手👏",
    "動いたの最高すぎる。今日はごきげんパンダだよ",
    "動いたの最高すぎる。ごほうびに水飲も",
    "動いたの最高すぎる。記録に残してニヤニヤしよ",
    "動いたの最高すぎる。明日はもっとゆるくてOK",
    "動いたの最高すぎる。運動貯金入りました✨",
    "動いたの最高すぎる。花がちょっと育った気がする",
    "動いたの最高すぎる。自信ポイント追加〜",
    "動いたの最高すぎる。その調子、でも無理なしで",
    "動いたの最高すぎる。今日は勝利のストレッチしよ",
    "今日の一歩、ちゃんと積み上がったよ。パンダが全力拍手👏",
    "今日の一歩、ちゃんと積み上がったよ。今日はごきげんパンダだよ",
    "今日の一歩、ちゃんと積み上がったよ。ごほうびに水飲も",
    "今日の一歩、ちゃんと積み上がったよ。記録に残してニヤニヤしよ",
    "今日の一歩、ちゃんと積み上がったよ。明日はもっとゆるくてOK",
    "今日の一歩、ちゃんと積み上がったよ。運動貯金入りました✨",
    "今日の一歩、ちゃんと積み上がったよ。花がちょっと育った気がする",
    "今日の一歩、ちゃんと積み上がったよ。自信ポイント追加〜",
    "今日の一歩、ちゃんと積み上がったよ。その調子、でも無理なしで",
    "今日の一歩、ちゃんと積み上がったよ。今日は勝利のストレッチしよ",
    "運動したあなた、まぶしい。パンダが全力拍手👏",
    "運動したあなた、まぶしい。今日はごきげんパンダだよ",
    "運動したあなた、まぶしい。ごほうびに水飲も",
    "運動したあなた、まぶしい。記録に残してニヤニヤしよ",
    "運動したあなた、まぶしい。明日はもっとゆるくてOK",
    "運動したあなた、まぶしい。運動貯金入りました✨",
    "運動したあなた、まぶしい。花がちょっと育った気がする",
    "運動したあなた、まぶしい。自信ポイント追加〜",
    "運動したあなた、まぶしい。その調子、でも無理なしで",
    "運動したあなた、まぶしい。今日は勝利のストレッチしよ",
    "小さくても体を動かしたの偉大。パンダが全力拍手👏",
    "小さくても体を動かしたの偉大。今日はごきげんパンダだよ",
    "小さくても体を動かしたの偉大。ごほうびに水飲も",
    "小さくても体を動かしたの偉大。記録に残してニヤニヤしよ",
    "小さくても体を動かしたの偉大。明日はもっとゆるくてOK",
    "小さくても体を動かしたの偉大。運動貯金入りました✨",
    "小さくても体を動かしたの偉大。花がちょっと育った気がする",
    "小さくても体を動かしたの偉大。自信ポイント追加〜",
    "小さくても体を動かしたの偉大。その調子、でも無理なしで",
    "小さくても体を動かしたの偉大。今日は勝利のストレッチしよ",
    "未来の自分にプレゼントしたね。パンダが全力拍手👏",
    "未来の自分にプレゼントしたね。今日はごきげんパンダだよ",
    "未来の自分にプレゼントしたね。ごほうびに水飲も",
    "未来の自分にプレゼントしたね。記録に残してニヤニヤしよ",
    "未来の自分にプレゼントしたね。明日はもっとゆるくてOK",
    "未来の自分にプレゼントしたね。運動貯金入りました✨",
    "未来の自分にプレゼントしたね。花がちょっと育った気がする",
    "未来の自分にプレゼントしたね。自信ポイント追加〜",
    "未来の自分にプレゼントしたね。その調子、でも無理なしで",
    "未来の自分にプレゼントしたね。今日は勝利のストレッチしよ"
  ],
  "sleepy": [
    "眠い日は寝る準備が最優先。深呼吸3回で閉店しよ😴",
    "眠い日は寝る準備が最優先。スマホ置いたら大勝利",
    "眠い日は寝る準備が最優先。布団に入る準備しよ",
    "眠い日は寝る準備が最優先。明日の自分にバトン渡そ",
    "眠い日は寝る準備が最優先。肩だけ回して寝よ",
    "眠い日は寝る準備が最優先。水を一口飲んでおやすみ",
    "眠い日は寝る準備が最優先。今日は寝落ち許可証発行",
    "眠い日は寝る準備が最優先。パンダも隣で寝るね",
    "眠い日は寝る準備が最優先。5分早く寝たら優勝",
    "眠い日は寝る準備が最優先。おやすみ前に自分を褒めよ",
    "眠気が来たなら体の正直サイン。深呼吸3回で閉店しよ😴",
    "眠気が来たなら体の正直サイン。スマホ置いたら大勝利",
    "眠気が来たなら体の正直サイン。布団に入る準備しよ",
    "眠気が来たなら体の正直サイン。明日の自分にバトン渡そ",
    "眠気が来たなら体の正直サイン。肩だけ回して寝よ",
    "眠気が来たなら体の正直サイン。水を一口飲んでおやすみ",
    "眠気が来たなら体の正直サイン。今日は寝落ち許可証発行",
    "眠気が来たなら体の正直サイン。パンダも隣で寝るね",
    "眠気が来たなら体の正直サイン。5分早く寝たら優勝",
    "眠気が来たなら体の正直サイン。おやすみ前に自分を褒めよ",
    "今日は布団に勝たなくていい。深呼吸3回で閉店しよ😴",
    "今日は布団に勝たなくていい。スマホ置いたら大勝利",
    "今日は布団に勝たなくていい。布団に入る準備しよ",
    "今日は布団に勝たなくていい。明日の自分にバトン渡そ",
    "今日は布団に勝たなくていい。肩だけ回して寝よ",
    "今日は布団に勝たなくていい。水を一口飲んでおやすみ",
    "今日は布団に勝たなくていい。今日は寝落ち許可証発行",
    "今日は布団に勝たなくていい。パンダも隣で寝るね",
    "今日は布団に勝たなくていい。5分早く寝たら優勝",
    "今日は布団に勝たなくていい。おやすみ前に自分を褒めよ",
    "寝るのも立派な回復トレ。深呼吸3回で閉店しよ😴",
    "寝るのも立派な回復トレ。スマホ置いたら大勝利",
    "寝るのも立派な回復トレ。布団に入る準備しよ",
    "寝るのも立派な回復トレ。明日の自分にバトン渡そ",
    "寝るのも立派な回復トレ。肩だけ回して寝よ",
    "寝るのも立派な回復トレ。水を一口飲んでおやすみ",
    "寝るのも立派な回復トレ。今日は寝落ち許可証発行",
    "寝るのも立派な回復トレ。パンダも隣で寝るね",
    "寝るのも立派な回復トレ。5分早く寝たら優勝",
    "寝るのも立派な回復トレ。おやすみ前に自分を褒めよ",
    "眠い自分を責めなくてOK。深呼吸3回で閉店しよ😴",
    "眠い自分を責めなくてOK。スマホ置いたら大勝利",
    "眠い自分を責めなくてOK。布団に入る準備しよ",
    "眠い自分を責めなくてOK。明日の自分にバトン渡そ",
    "眠い自分を責めなくてOK。肩だけ回して寝よ",
    "眠い自分を責めなくてOK。水を一口飲んでおやすみ",
    "眠い自分を責めなくてOK。今日は寝落ち許可証発行",
    "眠い自分を責めなくてOK。パンダも隣で寝るね",
    "眠い自分を責めなくてOK。5分早く寝たら優勝",
    "眠い自分を責めなくてOK。おやすみ前に自分を褒めよ"
  ]
};


function pandaChatCategory(text,type){
  const raw=(text||type||'');
  if(type && PANDA_CHAT_REPLIES[type])return type;
  if(/疲|しんど|だる|無理|つら|きつ|限界|へとへと|おつかれ|疲労/.test(raw))return 'tired';
  if(/ラーメン|らーめん|麺|ピザ|焼肉|寿司|カレー|飯|食べ|飲み|酒|ビール|スイーツ|ケーキ|甘い|お菓子|🍜|🍕|🍰/.test(raw))return 'food';
  if(/褒|ほめ|えら|偉|認め|励ま|自信|頑張|がんば/.test(raw))return 'praise';
  if(/サボ|休|できな|やってない|忘れ|空い|空白|途切/.test(raw))return 'skip';
  if(/歩|ジム|運動|筋トレ|走|ランニング|ストレッチ|できた|やった|散歩|ウォーキング/.test(raw))return 'done';
  if(/眠|ねむ|寝|睡眠|布団|徹夜|夜更かし/.test(raw))return 'sleepy';
  return 'praise';
}

function pickPandaChatReply(cat){
  const arr=PANDA_CHAT_REPLIES[cat]||PANDA_CHAT_REPLIES.praise;
  const key='yurutore_last_panda_reply_'+cat;
  let last=-1;
  try{last=parseInt(localStorage.getItem(key)||'-1',10);}catch(e){}
  let idx=Math.floor(Math.random()*arr.length);
  if(arr.length>1 && idx===last)idx=(idx+1+Math.floor(Math.random()*(arr.length-1)))%arr.length;
  try{localStorage.setItem(key,String(idx));}catch(e){}
  return arr[idx];
}

function pandaChatReply(text,type){
  const cat=pandaChatCategory(text,type);
  return pickPandaChatReply(cat);
}

function PandaChatRoom({state,setState}){
  const [input,setInput]=useState('');
  const chats=(state.pandaChats||[]).slice(-4).reverse();
  const quicks=[
    {id:'tired',icon:'😵',label:'疲れた'},
    {id:'food',icon:'🍜',label:'食べすぎた'},
    {id:'praise',icon:'🐼',label:'褒めて'},
    {id:'skip',icon:'🌱',label:'サボった'},
    {id:'done',icon:'✨',label:'運動した'},
    {id:'sleepy',icon:'😴',label:'眠い'}
  ];
  const sendChat=(type,label)=>{
    const text=(label||input||'').trim();
    if(!text)return;
    const reply=pandaChatReply(text,type);
    const item={id:'pc'+Date.now(),type:type||'free',text,reply,ts:Date.now()};
    setState(s=>({...s,pandaChats:[...(s.pandaChats||[]),item]}));
    setInput('');
  };
  const xp=(state.pandaChats||[]).length;
  const level=xp>=30?'親友パンダ':xp>=15?'なかよしパンダ':xp>=5?'相談なかま':'はじめまして';
  return(
    <div className="card panda-chat-card">
      <div className="panda-chat-head">
        <div>
          <div className="card-title" style={{marginBottom:2}}>🐼 パンダ相談室</div>
          <div className="panda-chat-sub">気持ちを押すだけでもOK。300通りのゆる返答で返すよ</div>
        </div>
        <div className="panda-chat-level">{level}<span>会話 {xp}</span></div>
      </div>
      <div className="panda-chat-hero">
        <div className="panda-chat-face"><PandaMascot variant="happy" size="xs"/></div>
        <div className="panda-chat-bubble">{chats[0]?.reply || 'いまの気持ち、パンダにちょっとだけ教えて〜。運動の話じゃなくても大丈夫だよ🐼'}</div>
      </div>
      <div className="panda-chat-quick-grid">
        {quicks.map(q=><button key={q.id} className="panda-chat-quick" onClick={()=>sendChat(q.id,q.label)}><span>{q.icon}</span>{q.label}</button>)}
      </div>
      <div className="panda-chat-input-row">
        <input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')sendChat(null,null);}} placeholder="例：今日ラーメン食べすぎた…" />
        <button onClick={()=>sendChat(null,null)}>話す</button>
      </div>
      {chats.length>0&&(
        <div className="panda-chat-log">
          {chats.map(c=><div key={c.id} className="panda-chat-log-item">
            <div className="panda-chat-me">あなた：{c.text}</div>
            <div className="panda-chat-panda">🐼 {c.reply}</div>
          </div>)}
        </div>
      )}
    </div>
  );
}

function RewardGarden({state,streak}){
  const reward=rewardInfo(state,streak);
  const plant=plantInfo(streak,state.reports.length);
  const items=unlockedRewards(state,streak);
  return(
    <div className="card reward-garden">
      <div className="card-title">🎁 ごほうびガーデン</div>
      <div className="reward-main">
        <div className="reward-panda">
          <div className={`reward-panda-face ${reward.rank}`}>{reward.emoji}</div>
          <div>
            <div className="reward-title">{reward.title}</div>
            <div className="reward-label">{reward.label}</div>
            <div className="reward-next">{reward.next}</div>
          </div>
        </div>
        <div className="plant-box">
          <div className="plant-emoji">{plant.emoji}</div>
          <div className="plant-name">{plant.name}</div>
          <div className="plant-msg">{plant.msg}</div>
        </div>
      </div>
      <div className="reward-list">
        {items.map((it,i)=><div key={i} className={`reward-chip ${it.ok?'ok':''}`}><span>{it.icon}</span><b>{it.name}</b></div>)}
      </div>
    </div>
  );
}
function MemoryPeek({state}){
  const mem=memoryCard(state);
  const current=monthActivitySummary(state.reports,0);
  const prev=monthActivitySummary(state.reports,-1);
  return(
    <div className="card memory-card">
      <div className="card-title">📖 思い出アルバム</div>
      <div className="memory-hero">
        <div>
          <div className="memory-tag">{mem.tag}</div>
          <div className="memory-title">{mem.title}</div>
          <div className="memory-body">{mem.body}</div>
        </div>
        <div className="memory-panda">🐼</div>
      </div>
      <div className="memory-months">
        <div><b>{current.month}月</b><span>{current.days}日 / {current.top}</span></div>
        <div><b>先月</b><span>{prev.days}日 / {prev.top}</span></div>
      </div>
    </div>
  );
}
function roomStats(state,streak){
  const reports=state.reports||[];
  const text=(reports.map(r=>`${r.note||''} ${r.aid||''}`).join(' ')+' '+(state.posted||[]).join(' ')).toLowerCase();
  const foodCount=reports.filter(r=>/ラーメン|らーめん|麺|ピザ|pizza|焼肉|寿司|カレー|スイーツ|ケーキ|飯|ごはん|食べ|🍜|🍕/.test(r.note||'')).length;
  const walkCount=reports.filter(r=>['walk','run'].includes(r.aid)).length;
  const gymCount=reports.filter(r=>['gym','home','stretch'].includes(r.aid)).length;
  const photoCount=reports.filter(r=>r.photo).length;
  const reactionKeys=Object.values(state.reactions||{}).filter(Boolean);
  const ramenReaction=reactionKeys.filter(k=>k==='food'||k==='ramen'||k==='zero').length;
  const nightCount=reports.filter(r=>new Date(r.ts).getHours()>=21 || new Date(r.ts).getHours()<5).length;
  // 【v40新規追加】家具の解放条件を「特定の運動だけ」に偏らせないための集計
  const morningCount=reports.filter(r=>{const h=new Date(r.ts).getHours();return h>=5&&h<11;}).length;
  const stretchCount=reports.filter(r=>r.aid==='stretch').length;
  const chatCount=(state.pandaChats||[]).length;
  const missionDone=missionCount(state);
  const pandaPoints=pandaPointCount(state);
  return {total:reports.length,foodCount,walkCount,gymCount,photoCount,ramenReaction,nightCount,morningCount,stretchCount,streak,chatCount,missionDone,pandaPoints};
}
function pandaRoomItems(state,streak){
  const st=roomStats(state,streak);
  const list=[
    {id:'plant',icon:'🪴',name:'観葉植物',desc:'運動を1回記録',ok:st.total>=1,place:'右奥'},
    {id:'cushion',icon:'🟡',name:'もちもちクッション',desc:'3日分の記録',ok:st.total>=3,place:'ラグの上'},
    {id:'chat',icon:'💬',name:'会話クッション',desc:'パンダと1回会話',ok:st.chatCount>=1,place:'ソファ横'},
    {id:'timecapsule',icon:'📮',name:'未来ポスト',desc:'タイムカプセルを1通保存',ok:(state.timeCapsules||[]).length>=1,place:'窓の下'},
    {id:'ramen',icon:'🍜',name:'ラーメン棚',desc:'飯テロ投稿・食べ物メモ1回',ok:st.foodCount>=1||st.ramenReaction>=1,place:'右の棚'},
    {id:'lamp',icon:'🌙',name:'夜ふかしランプ',desc:'夜の記録1回',ok:st.nightCount>=1,place:'左の床'},
    {id:'photo',icon:'🖼️',name:'思い出フォト',desc:'写真つき記録1回',ok:st.photoCount>=1,place:'壁'},
    {id:'mat',icon:'🚶',name:'さんぽマット',desc:'ウォーキング/ラン1回',ok:st.walkCount>=1,place:'中央床'},
    {id:'dumbbell',icon:'🏋️',name:'ちょいトレ道具',desc:'ジム/筋トレ/ストレッチ1回',ok:st.gymCount>=1,place:'右床'},
    {id:'missionPlant',icon:'🌱',name:'ミッション若葉',desc:'ゆるミッション5回達成',ok:st.missionDone>=5,place:'左奥'},
    {id:'sofa',icon:'🛋️',name:'ふわふわソファ',desc:'ゆるミッション30回達成',ok:st.missionDone>=30,place:'奥の壁'},
    {id:'neon',icon:'💗',name:'ネオン看板',desc:'パンダポイント100pt',ok:st.pandaPoints>=100,place:'壁'}, /* 【v29変更】旧pointStar。描かれている素材に合わせて改名 */
    {id:'crown',icon:'👑',name:'常連の王冠',desc:'7日継続',ok:st.streak>=7,place:'パンダの頭上'}
  ];
  /* 【v29新規追加】一度でも達成した家具は永続的に解放(没収なし)。
     とくにcrownは従来streakが切れると消えていたため、everOkで保持する。 */
  try{
    const memo=loadRoomUnlockMemo(state&&state.auth);
    if(memo&&memo.everOk&&memo.everOk.length){
      for(const it of list){ if(memo.everOk.indexOf(it.id)>=0)it.ok=true; }
    }
  }catch(e){}
  return list;
}
function roomSeasonIcon(){
  const m=new Date().getMonth()+1;
  if([3,4,5].includes(m))return '🌸';
  if([6,7,8].includes(m))return '🎐';
  if([9,10,11].includes(m))return '🍁';
  return '⛄';
}
function roomPandaMood(){
  const h=new Date().getHours();
  if(h>=22||h<5)return {pose:'sleepy',label:'ねむねむ中'};
  if(h>=5&&h<11)return {pose:'happy',label:'朝のんびり'};
  if(h>=17)return {pose:'proud',label:'夜の休憩'};
  return {pose:'happy',label:'お部屋番'};
}


/* 【v26変更】hero=true のとき、ホーム画面用に周囲の説明文を最小化して部屋を主役に表示します。
   hero を渡さなければ従来どおりの表示です（既存の使い方を壊しません）。 */
/* ═══════════════ 【v27新規追加】パンダルーム インタラクション ═══════════════
   ・画像内に描かれたメニュー(会話ログ/プレゼント/思い出アルバム/設定/ショップ/
     ミッション/ホームへ)の上に透明ボタンを重ね、実際にタップできるようにした
   ・パンダタップ演出 / 会話ログ保存 / ルーム設定 / 入室時の自動リアクションを追加
   ・既存の保存データは変更せず、新しい専用キーのみ追加：
       yurutore_room_talklog_v1  … パンダの会話ログ(最大30件)
       yurutore_room_settings_v1 … ルーム設定(動き/効果音/夜間モード)
   ═══════════════════════════════════════════════════════════ */
/* ═══════════════ 【v28新規追加】パンダ生活システム ═══════════════
   パンダがユーザーの行動(今日の記録・来店の空き・時間帯・日替わりテーマ)を
   覚えて反応する。圧ゼロ・ペナルティゼロ。
   追加保存キーは yurutore_daily_visit_v1_{userId|guest} の1つだけ。
   ═══════════════════════════════════════════════════════════ */

/* ---- セリフデータベース ----
   1配列ベタ書きにせず、あいさつ/時間帯/状態/曜日/テーマ/木の実/なでなで/汎用 に分割。
   追加・修正は該当プールに1行足すだけ。{name}はユーザー名に置き換わる。
   NG表現(連続・ログイン・皆勤・未達成・サボ・頑張れ 等)は自動テストで検査する。 */
const ROOM_TALK_DB={
  greet:{
    /* 7日以上ぶり(P1)。よろこびが一番大きい。責める言葉は使わない */
    longAway:[
      '{name}さんだ〜！！会いたかったよ〜🐼💕',
      'わ〜！{name}さんが来てくれた！うれしくてころがっちゃう〜',
      'おかえり〜！{name}さんの顔を見たら元気100倍だよ〜🌸',
      'ずっとここで待ってたよ〜。来てくれて本当にうれしい🐼',
      '{name}さ〜ん！今日はいっしょにゆっくりしようね〜☕'
    ],
    /* 2〜6日ぶり(P2)。あたたかく迎える */
    shortAway:[
      'あ、{name}さんだ！また会えてうれしいな〜🐼',
      'おかえり〜！{name}さんが来ると部屋が明るくなるよ🌼',
      '{name}さん、いらっしゃ〜い。ゆっくりしていってね〜',
      '来てくれてありがとう〜。パンダ、しっぽふっちゃう🐼',
      'わーい、{name}さんだ〜。今日もこの部屋でまったりしよ〜'
    ],
    /* 今日はじめて(P3) */
    firstToday:[
      '{name}さん、今日も来てくれてうれしいよ〜🐼',
      'やっほ〜{name}さん！今日もよろしくね〜',
      '{name}さんが来ると、なんだか安心するんだ〜🌿',
      'いらっしゃ〜い！お茶でもどうぞ〜☕',
      '今日の{name}さんに会えた〜。それだけでいい日だよ🐼',
      'こんにちは〜！今日ものんびりいこうね〜'
    ],
    /* 同日の再入室(P4)。軽く */
    revisit:[
      'あ、また来てくれた〜。うれしいな🐼',
      'おかえり〜。さっきぶりだね〜',
      'なんどでも大かんげいだよ〜🌸',
      'ふふ、気に入ってくれた？この部屋〜',
      'いつでもここにいるからね〜🐼'
    ]
  },
  /* 木の実のおすそわけ(来店ありがとう)。内部でpandaPoints+2。ソシャゲ用語は使わない */
  reward:[
    '{name}さん、来てくれてありがとう〜🐼 木の実を2つ見つけたから、はんぶんこ🌰',
    'そうだ！さっき窓の外で木の実を2つひろったんだ〜。{name}さんにあげる🌰',
    '来てくれた記念に、とっておきの木の実を2つどうぞ〜🌰🐼',
    'じゃーん、木の実2つ発見〜！{name}さんと分けたかったんだ🌰'
  ],
  /* 時間帯: morning 5-10 / noon 11-15 / evening 16-21 / night 22-4 */
  time:{
    morning:[
      'おはよ〜☀️ まだちょっとねむいね〜',
      '朝のおひさま、気持ちいいね〜🌤️',
      '朝ごはん、なに食べた〜？パンダは笹パンだよ🍞',
      'ん〜、おはようのストレッチ気持ちいい〜',
      '今日はどんな一日になるかな〜🌸',
      '朝の空気を深呼吸〜。すぅ〜、はぁ〜🐼'
    ],
    noon:[
      'おなかすいた〜！お昼なに食べる〜？🍙',
      'お昼のひなたぼっこは最高だね〜☀️',
      '午後もゆる〜くいこうね〜',
      'お昼ごはんのあとは、ちょっとおひるね…zzz',
      'いいお昼だね〜。窓の外がきらきらしてる〜',
      'もぐもぐ…はっ、見てた？おやつタイムだよ🍡'
    ],
    evening:[
      '夕方だね〜。今日もおつかれさま🌇',
      'そろそろ晩ごはんの時間かな〜？🍜',
      '夕焼けがきれいだよ〜。ちょっと窓を見てみて〜',
      '一日の終わりは、ゆったりすごそうね〜',
      'おふろにゆっくり入ると、ぽかぽかだよ〜♨️',
      '今日も一日、おつかれさまでした〜🐼'
    ],
    night:[
      'もう夜だね〜。今日もおつかれさま🌙',
      'ねむくなってきちゃった…ふぁ〜🐼',
      '夜ふかしもたまにはいいけど、ほどほどにね〜⭐',
      'おやすみ前は、ゆっくり深呼吸〜',
      '月がきれいだね〜。いっしょにながめよ〜🌙',
      '今日も来てくれてありがとう。いい夢みてね〜💤'
    ]
  },
  /* ユーザー状態: done=今日記録済み(行動をほめる) / rest=未記録(圧ゼロの安らぎだけ) */
  state:{
    done:[
      '今日は体を動かしたんだね〜！えらいえらい🐼✨',
      '動いたあとの{name}さん、いい顔してる〜🌸',
      '今日のぶんはもうばっちりだね〜。あとはのんびりタイム〜',
      '体を動かすって気持ちいいよね〜。パンダもうれしい💕',
      'えらすぎて木の実おかわりあげたいくらいだよ〜🌰',
      '今日の一歩、ちゃんと見てたよ〜。すてきだったよ🐼',
      '動けた日も、そうでない日も、{name}さんは{name}さんだよ〜',
      'おつかれさま〜。今日はもう、ごほうびタイムでいいと思うな〜🍮'
    ],
    rest:[
      '今日は休む日でもいいんだよ〜🐼',
      '深呼吸だけでも花丸だよ〜🌸',
      'ソファでゴロゴロするのも、立派な過ごし方だよ〜',
      'ここに来てくれただけで、パンダは大満足だよ〜💕',
      'のんびりする日があるから、動ける日もあるんだよ〜',
      '今日はお茶でもどうぞ〜。ゆっくりしていってね☕',
      '休むのが上手な人は、続けるのも上手なんだって〜🐼',
      '{name}さんのペースがいちばん。あわてなくて大丈夫〜',
      '窓の外でもながめて、ぼ〜っとしよ〜🌿'
    ]
  },
  /* 曜日の小ネタ(0=日〜6=土) */
  weekday:{
    0:['日曜日はのんびりデー〜🐼','日曜の夕方って、ちょっとせつないよね〜。お茶でもどうぞ☕'],
    1:['月曜日か〜。ゆるくスタートでいいんだよ〜','週のはじまりは、深呼吸からね〜🌸'],
    2:['火曜日はマイペースデー〜','ふふ、火曜日って地味にえらい日だと思うんだ〜🐼'],
    3:['水曜日、週のまんなか〜。おつかれさま〜','水曜は水分をたっぷりとる日にしよ〜🥛'],
    4:['木曜日は木の実の日〜🌰なんちゃって','あとちょっとで週末だね〜。ゆるゆるいこ〜'],
    5:['金曜日〜！今夜はなに食べる〜？🍜','金曜の夜って、なんだかわくわくするね〜'],
    6:['土曜日はごほうびデー〜🍮','土曜のおひるね、最高なんだよね〜zzz']
  },
  /* 日替わりテーマ。吹き出しだけで成立する室内の行動に限定(背景画像と矛盾させない) */
  themes:[
    {id:'bread',label:'パン作り',lines:[
      '今日はあとでパンを焼いてみようと思うんだ〜🍞',
      '笹入りパンのレシピ、考え中〜。おいしいかな〜？',
      'パンのいいにおいって、しあわせのにおいだよね〜',
      'ふわふわのパン生地、さわってみたいな〜🐼'
    ]},
    {id:'reading',label:'読書',lines:[
      '今日は本棚の本を読み返す日にしようかな〜📚',
      'さっきまで本を読んでてね、いいお話だったんだ〜',
      '{name}さんのおすすめの本、今度教えて〜',
      '本の世界って、部屋にいながら旅ができるんだよ〜🐼'
    ]},
    {id:'clean',label:'そうじ',lines:[
      '今日はおそうじの日〜。棚をぴかぴかにするんだ〜✨',
      'ラグのごみをコロコロしてたら、たのしくなっちゃった〜',
      'きれいな部屋だと、心もすっきりするね〜',
      'そうじのあとのお茶が、またおいしいんだよね〜☕'
    ]},
    {id:'nap',label:'おひるね',lines:[
      '今日はおひるね日和だね〜…ふぁ〜🐼',
      'ソファでうとうとしてたら、いい夢みてたよ〜',
      '15分のおひるねって、魔法みたいに元気になるよね〜',
      'ねむいときは、ねるのがいちばん〜zzz'
    ]},
    {id:'plants',label:'植物のお世話',lines:[
      '今日は観葉植物にお水をあげる日なんだ〜🪴',
      '葉っぱが1枚ふえてた！うれしいな〜🌿',
      '植物ってゆっくり育つでしょ？それでいいんだよね〜',
      '窓ぎわの子がぐんぐん育ってて、まけてられないな〜🐼'
    ]},
    {id:'music',label:'音楽',lines:[
      '今日は音楽をかけてゆったりする日〜🎵',
      'さっきから頭の中で、ごきげんな曲が流れてるんだ〜',
      '{name}さんの好きな曲、今度いっしょに聴きたいな〜',
      '音楽にあわせてゆらゆらするの、けっこう運動かも？🐼🎵'
    ]},
    {id:'cooking',label:'料理',lines:[
      '今日はあとでスープを作ろうと思うんだ〜🍲',
      'とっておきのラーメンアレンジ、思いついちゃった〜🍜',
      'おいしいごはんは、心の栄養だよね〜',
      '{name}さんの得意料理はなに〜？こんど教えて🐼'
    ]},
    {id:'stretch',label:'ストレッチ',lines:[
      '今日はのびのびストレッチの気分〜。ん〜〜っ🐼',
      '背のびするだけで、体がよろこぶんだって〜',
      '肩をくるくる回すと、ふわ〜って軽くなるよ〜',
      'いっしょに首をゆっくり回そ〜。ん〜、気持ちいい〜'
    ]},
    {id:'layout',label:'模様替えの空想',lines:[
      'ソファの位置、変えたらどうなるかな〜って空想中〜🛋️',
      '本棚のとなりに新しい植物を置きたいな〜',
      '模様替えって、考えてるだけでたのしいよね〜',
      'いつかこの部屋、うんとすてきにするんだ〜🐼'
    ]},
    {id:'window',label:'外をながめる',lines:[
      '窓の外をぼ〜っとながめるの、好きなんだ〜🌸',
      '今日の空、いい色してるよ〜。見てみて〜',
      '鳥さんが窓の前を通ったよ！はやかった〜',
      '外の景色を見てると、時間がゆっくり流れるね〜🐼'
    ]}
  ],
  /* パンダをなでたとき */
  tap:[
    'えへへ、くすぐったいよ〜🐼',
    'なでてくれてありがとう〜💕',
    '今日も会えてうれしいな〜🌸',
    'いっしょにゴロゴロしよ〜',
    'パンダ、げんきもりもり〜✨',
    'もういっかい？しょうがないな〜🐼💕'
  ],
  /* 汎用 */
  generic:[
    '今日も来てくれてうれしいよ〜🐼',
    '少し動いたら、それだけで花丸だよ〜🌸',
    'ラーメンもピザも、幸せならOK〜🍜🍕',
    '疲れた日は、この部屋でゆっくりしよ〜☕',
    'コツコツすすむ{name}さん、すてきだよ〜✨',
    '家具が増えると、パンダもごきげんだよ〜🏠'
  ]
};

/* ---- 日付・シードのユーティリティ ---- */
function todayStrLocal(d){const x=d||new Date();const p=n=>String(n).padStart(2,'0');return `${x.getFullYear()}-${p(x.getMonth()+1)}-${p(x.getDate())}`;}
function daysBetweenStr(a,b){ // 'YYYY-MM-DD'同士の暦日差(タイムゾーンの影響を受けないようUTC正午で計算)
  try{
    const pa=a.split('-').map(Number),pb=b.split('-').map(Number);
    const ta=Date.UTC(pa[0],pa[1]-1,pa[2],12),tb=Date.UTC(pb[0],pb[1]-1,pb[2],12);
    return Math.round((tb-ta)/86400000);
  }catch(e){return 0;}
}
function fnv1a(str){ // 安定シード用の32bitハッシュ
  let h=0x811c9dc5;
  for(let i=0;i<str.length;i++){h^=str.charCodeAt(i);h=(h*0x01000193)>>>0;}
  return h>>>0;
}
/* 日替わりテーマ: ユーザーID+日付から安定して決まる(同日は再読み込みしても不変、翌日に自動で変わる) */
function roomThemeOfDay(userId,dayStr){
  const seed=fnv1a((userId||'guest')+'|'+(dayStr||todayStrLocal()));
  return ROOM_TALK_DB.themes[seed%ROOM_TALK_DB.themes.length];
}
function roomTimeSlot(hour){
  const h=(hour===undefined?new Date().getHours():hour);
  if(h>=5&&h<11)return'morning';
  if(h>=11&&h<16)return'noon';
  if(h>=16&&h<22)return'evening';
  return'night';
}
function roomFillName(line,name){return String(line).split('{name}').join(name||'あなた');}
function roomPick(arr){return arr[Math.floor(Math.random()*arr.length)];}

/* ---- 会話の抽選(テーマ30% / 時間帯25% / 状態25% / 汎用+曜日20%) ---- */
function pickRoomTalk({userId,name,todayDone,now}){
  const d=now||new Date();
  const r=Math.random();
  let pool;
  if(r<0.30)pool=roomThemeOfDay(userId,todayStrLocal(d)).lines;
  else if(r<0.55)pool=ROOM_TALK_DB.time[roomTimeSlot(d.getHours())];
  else if(r<0.80)pool=todayDone?ROOM_TALK_DB.state.done:ROOM_TALK_DB.state.rest;
  else pool=ROOM_TALK_DB.generic.concat(ROOM_TALK_DB.weekday[d.getDay()]||[]);
  return roomFillName(roomPick(pool),name);
}

/* ---- 来店の1日1回判定(クレーム方式・冪等) ----
   yurutore_daily_visit_v1_{userId|guest} に前回来店日を保持。
   最初に呼んだ側だけ needReward / needGreet が true になり、
   その場でフラグを書き込むため、再読み込み・ルーム開閉・タブ複製でも1回だけ。 */
function ensureDailyVisit(userId,todayOverride){
  const today=todayOverride||todayStrLocal();
  const key='yurutore_daily_visit_v1_'+(userId||'guest');
  let rec=null;
  try{rec=JSON.parse(localStorage.getItem(key)||'null');}catch(e){rec=null;}
  let gap=0,firstToday=false;
  if(!rec||typeof rec!=='object'||rec.day!==today){
    gap=(rec&&rec.day)?Math.max(0,daysBetweenStr(rec.day,today)):0;
    firstToday=true;
    rec={day:today,gap,rewarded:false,greeted:false};
  }else{
    gap=rec.gap||0;
  }
  const needReward=!rec.rewarded;
  const needGreet=!rec.greeted;
  rec.rewarded=true;rec.greeted=true;
  try{localStorage.setItem(key,JSON.stringify(rec));}catch(e){}
  return{gap,firstToday,needReward,needGreet,day:today};
}

/* ---- 入室あいさつの組み立て(優先順位 P1:7日以上 → P2:2〜6日 → P3:今日初回) ----
   joy: 0=通常 / 1=おかえり(中) / 2=おかえり(大)。ハート演出の強さに使う。 */
function buildRoomEntryTalk({gap,needGreet,needReward,name}){
  const lines=[];let joy=0;
  if(needGreet){
    if(gap>=7){lines.push(roomPick(ROOM_TALK_DB.greet.longAway));joy=2;}
    else if(gap>=2){lines.push(roomPick(ROOM_TALK_DB.greet.shortAway));joy=1;}
    else{lines.push(roomPick(ROOM_TALK_DB.greet.firstToday));}
  }
  if(needReward){lines.push(roomPick(ROOM_TALK_DB.reward));}
  if(!lines.length)return null;
  return{lines:lines.map(l=>roomFillName(l,name)),joy};
}

/* ---- 計測(最小構成) ----
   5イベントのみ。ログイン中だけ送信し、失敗は無視(体験に影響させない)。
   テーブル定義とRLSは supabase_v28_events.sql を参照。 */
const TRACK_EVENTS=['app_open','panda_room_open','panda_tap','exercise_recorded','mission_completed'];
function trackEvent(ev){
  try{
    if(!supabaseClient||TRACK_EVENTS.indexOf(ev)<0)return;
    supabaseClient.auth.getSession().then(({data})=>{
      const uid=data&&data.session&&data.session.user&&data.session.user.id;
      if(!uid)return; // ゲストは送信しない
      supabaseClient.from('app_events').insert({event:ev}).then(()=>{},()=>{});
    },()=>{});
  }catch(e){}
}

/* ═══════════════ 【v29新規追加】部屋の実データ連動 ═══════════════
   「行動すると、本当に部屋が変わる」。
   ・(v30で置換)背景と家具の描画は room30_* レイヤー方式へ移行
   ・(v30で廃止)未解放家具の「おとどけ包み」表示
   ・レベル/時刻/季節/ライティングを実データ・実時刻に連動
   追加保存キー: yurutore_room_seen_unlocks_v1_{userId|guest}
   ═══════════════════════════════════════════════════════════ */
/* 【v30で非参照化】v29の加工背景。描画では使用していません(ファイルも残しています)。
   万一v29表示へ戻したい場合のロールバック用に定数だけ残置。 */
const ROOM_BG_SRC='room_bg_v29_base.png';

/* レベル計算の統一関数(これ以外の場所でレベルを計算しない) */
function roomLevelOf(n){
  if(n<=2)return 1;
  if(n<=4)return 2;
  if(n<=6)return 3;
  if(n<=8)return 4;
  if(n<=10)return 5;
  return 6;
}

/* 表示用の時間帯(仕様§6)。会話用のroomTimeSlot(v28)とは区分が異なるため別関数。 */
function roomDisplayBand(hour){
  const h=(hour===undefined?new Date().getHours():hour);
  if(h>=5&&h<11)return{id:'morning',icon:'🌅',label:'朝'};
  if(h>=11&&h<16)return{id:'noon',icon:'☀️',label:'昼'};
  if(h>=16&&h<19)return{id:'evening',icon:'🌇',label:'夕方'};
  if(h>=23||h<5)return{id:'deepnight',icon:'🌙',label:'夜'};
  return{id:'night',icon:'🌙',label:'夜'};
}
function roomSeasonInfo(d){
  const x=d||new Date();const m=x.getMonth()+1;
  let s;
  if(m>=3&&m<=5)s={icon:'🌸',label:'春'};
  else if(m>=6&&m<=8)s={icon:'🎐',label:'夏'};
  else if(m>=9&&m<=11)s={icon:'🍁',label:'秋'};
  else s={icon:'⛄',label:'冬'};
  return{...s,dateText:`${m}月${x.getDate()}日`};
}
/* 時間帯ごとの部屋の光(設定「常に明るい」で無効)。
   【バイブル§3.4 光源ルール厳守】
   ・主光源は常に左上の窓側。影は右下方向。
   ・夕方も「窓側(左上)から」暖色光が入る表現。右下から光を当てない。
   ・単色1枚ではなく複数のCSSグラデーションを重ねて色温度・方向・影を表現。
   ・画像素材の色は変えない。パンダの顔と家具が必ず見える上限を守る(最大不透明度<0.45)。
   戻り値は {background, mix} で、mixはmix-blend-mode。 */
function roomLightStyle(bandId,settings){
  if(settings&&settings.night==='bright')return null;
  // 右下へ落ちる柔らかい影(全時間帯共通の方向性)
  const shadowRB='radial-gradient(120% 120% at 88% 92%, rgba(60,44,24,0.20), rgba(60,44,24,0) 55%)';
  if(bandId==='morning'){
    // 朝: 左上の窓から柔らかな暖色。清々しいが明るすぎない。
    return {roomOverlay:{background:[
      'linear-gradient(135deg, rgba(255,236,190,0.34) 0%, rgba(255,236,190,0.10) 34%, rgba(255,236,190,0) 60%)',
      'radial-gradient(90% 80% at 20% 12%, rgba(255,244,214,0.30), rgba(255,244,214,0) 55%)',
      shadowRB
    ].join(','), mix:'soft-light'}, warmTop:null, windowMask:null};
  }
  if(bandId==='evening'){
    // 夕方: 左上の窓側からオレンジ寄りの光。昼より暖かく落ち着く。
    return {roomOverlay:{background:[
      'linear-gradient(135deg, rgba(255,178,92,0.40) 0%, rgba(255,168,96,0.16) 36%, rgba(255,150,90,0) 62%)',
      'radial-gradient(95% 85% at 22% 14%, rgba(255,198,120,0.34), rgba(255,198,120,0) 58%)',
      'radial-gradient(120% 120% at 90% 95%, rgba(120,70,40,0.24), rgba(120,70,40,0) 55%)'
    ].join(','), mix:'soft-light'}, warmTop:null, windowMask:null};
  }
  if(bandId==='night'||bandId==='deepnight'){
    const deep=bandId==='deepnight';
    // ① 部屋全体の夜色(家具の上・パンダの下=z3)。上ほど暗い。パンダには乗らない。
    const roomOverlay={background:[
      // 【v41.1】窓の外が本物の夜景になったぶん、室内の青みは弱める。
      //  ねらいは「窓の外＝寒色の夜 / 室内＝暖色の安心感」。家具の色が判別できる明るさを残す。
      // 【v41.2】窓の外が本物の夜景になったので、室内の青みはさらに弱める。
      //  夜の見せ場は「外の寒色 × 室内の暖色」のコントラスト。画面全体を青くしない。
      deep
        ? 'linear-gradient(180deg, rgba(18,28,68,0.34) 0%, rgba(16,24,58,0.29) 55%, rgba(22,28,56,0.23) 100%)'
        : 'linear-gradient(180deg, rgba(26,38,86,0.30) 0%, rgba(24,34,74,0.25) 55%, rgba(30,36,70,0.20) 100%)',
      deep
        ? 'radial-gradient(130% 130% at 90% 96%, rgba(6,10,32,0.24), rgba(6,10,32,0) 55%)'
        : 'radial-gradient(130% 130% at 92% 96%, rgba(8,12,40,0.20), rgba(8,12,40,0) 55%)'
    ].join(','), mix:'normal'};
    // ② パンダの上に薄く乗せる暖色(z5)。顔の白を殺さず室内の温かみと一体化。ごく弱く。
    const warmTop={background:
      'radial-gradient(52% 46% at 53% 58%, rgba(255,'+(deep?'208':'214')+',154,'+(deep?'0.20':'0.24')+'), rgba(255,206,140,0) 66%)',
      mix:'soft-light'};
    // ③ CSS窓マスク(公式窓夜景素材が無いときのフォールバック・z1.5)。
    //    窓ガラス内(中心39.6%,29.3% / x26-53%,y10-49%)だけを紺に沈める。
    const windowMask={background:
      'radial-gradient(30% 26% at 39.6% 29.3%, rgba('+(deep?'12,18,50':'18,26,66')+','+(deep?'0.86':'0.80')+'), rgba('+(deep?'12,18,50':'18,26,66')+',0.30) 74%, rgba(18,26,66,0) 96%)',
      mix:'normal'};
    return {roomOverlay, warmTop, windowMask};
  }
  return null; // 昼: 素通し(最も自然でニュートラル)
}

/* 未解放家具の「おとどけ包み」位置(画像に対する%)。
   包みは家具よりひとまわり大きくてよい(重なっても破綻しない)。
   清書イラスト(透過素材)が用意でき次第、同じ座標で個別レイヤーに置き換える。 */
const ROOM_LOCKED_COVERS=[
  {id:'sofa',   icon:'🛋️', left:13.0, top:28.0, width:32.0, height:35.0},
  {id:'cushion',icon:'🟡', left:26.5, top:33.0, width:13.0, height:15.0},
  {id:'ramen',  icon:'🍜', left:75.0, top:15.0, width:18.5, height:36.0},
  {id:'lamp',   icon:'🌙', left:80.5, top:17.0, width:10.0, height:30.0},
  {id:'plant',  icon:'🪴', left:78.0, top:50.0, width:15.0, height:28.0},
  {id:'neon',   icon:'💗', left:64.5, top:14.0, width:16.0, height:20.0}
];
/* 夜のランプ発光位置(ランプ解放時のみ・夜/深夜のみ) */
const ROOM_LAMP_GLOW={left:79.5,top:16.5,width:13,height:22};

/* ---- 解放の記録(演出の1回制御と、達成の永続化) ---- */
function roomUnlockKey(uid){return 'yurutore_room_seen_unlocks_v1_'+(uid||'guest');}
function loadRoomUnlockMemo(uid){
  try{
    const m=JSON.parse(localStorage.getItem(roomUnlockKey(uid))||'null');
    if(m&&Array.isArray(m.seen)&&Array.isArray(m.everOk))return m;
  }catch(e){}
  return null; // 初回(未初期化)
}
function saveRoomUnlockMemo(uid,m){
  try{localStorage.setItem(roomUnlockKey(uid),JSON.stringify(m));}catch(e){}
}

/* ═══════════════ 【v30新規追加】はじまりの部屋 ═══════════════
   デザイン＆実装バイブルv1.0準拠。
   ・家具なし背景 + 解放済み透過レイヤー(未解放はimgを生成しない)
   ・パンダを別レイヤー化(normal/happy/sleepy/ramen、優先順位つき)
   ・会話はステージ外の会話ボックス(発言時のみ)/ミッションカード常時
   ・新規キー: yurutore_panda_stats_v1_{userId|guest}
   ═══════════════════════════════════════════════════════════ */
const ROOM30_DIR='assets/panda-room/v30/';
const ROOM30_BASE='room30_base.webp';
/* 【重要】いま assets/panda-room/v30/ に入っている家具レイヤー素材のid一覧。
   デザイン素材(room30_{id}.webp)が届いたら、ファイルを同フォルダへ置き、
   この配列にidを1つ追加するだけで部屋に表示されます(コードの他の変更は不要)。
   ここに無いidは「解放はされるが絵はまだ無い」扱いになり、
   imgを生成しないため404も出ず、部屋の表示も崩れません。 */
const ROOM30_ASSETS_READY=['rug','table','zabuton'];
function room30HasAsset(id){return ROOM30_ASSETS_READY.indexOf(id)>=0;}

/* ═══════════════ 【v41】部屋の"定位置"に家具を入れる方式 ═══════════════
   v40は「解放した家具＝1つのオブジェクトを床か壁に置く」構造で、増えるほど散らかっていた。
   v41では部屋に定位置(スロット)を先に決め、解放済みの家具はそこへ入る。
   ・同じ役割の家具は交換（同時に並べない）
   ・小物は親家具の絵に含めるか、家具の上に載せる
   ・壁面装飾は4か所まで
   ・すべてパンダ(z-index:4)より背面の1レイヤー内に描くので、パンダは絶対に隠れない
   アンロック条件・保存・通知・既存ユーザーの復元は v40 のまま変更していない。

   pick は上から順に「下位→上位」。need をすべて解放していれば採用し、最後に採用したものを表示する。
   not: そのidを解放していたら表示しない（例：ソファを持っていたらクッションは床に置かずソファへ）
   onTopOf: 親スロットの天板に載せる（親の高さに合わせて自動で接地位置を決める） */
const ROOM41_DIR='assets/panda-room/v41/';
const ROOM41_SLOTS=[
  {slot:'wall_top',z:10,pick:[
    {need:['wall_garland'],src:'r41_garland.webp',l:24.0,b:11.0,w:22.0,h:8.75},
  ]},
  {slot:'wall_a',z:11,pick:[
    {need:['poster'],src:'r41_poster.webp',l:64.0,b:22.0,w:7.0,h:13.52},
    {need:['neon'],src:'r41_neon.webp',l:62.5,b:20.0,w:12.0,h:8.13},
  ]},
  {slot:'wall_b',z:11,pick:[
    {need:['wallclock'],src:'r41_clock.webp',l:78.0,b:19.0,w:6.0,h:9.0},
  ]},
  {slot:'wall_c',z:12,pick:[
    {need:['wall_shelf'],src:'r41_wallshelf.webp',l:76.0,b:36.0,w:9.0,h:6.65},
  ]},
  {slot:'ramen',z:12,pick:[
    {need:['ramen_shelf'],src:'r41_ramen_corner.webp',l:62.0,b:50.0,w:12.0,h:18.0},
  ]},
  {slot:'window',z:13,pick:[
    {need:['curtain_charm'],src:'r41_charm.webp',l:55.0,b:40.0,w:3.2,h:8.89},
  ]},
  {slot:'lampglow',z:19,pick:[
    {need:['floorlamp'],src:'r41_lampglow.webp',l:11.0,b:86.0,w:22.0,h:33.0},
  ]},
  {slot:'floormat',z:20,pick:[
    {need:['small_rug'],src:'r41_rug_b.webp',l:30.0,b:95.0,w:20.0,h:11.61},
    {need:['pawmat'],src:'r41_rug_c.webp',l:30.0,b:95.0,w:21.0,h:12.19},
  ]},
  {slot:'sofa',z:30,pick:[
    {need:['sofa'],src:'r41_sofa_a.webp',l:1.5,b:76.0,w:17.0,h:16.0},
    {need:['sofa','cushion'],src:'r41_sofa_b.webp',l:1.5,b:76.0,w:17.0,h:16.0},
    {need:['sofa','cushion','blanket'],src:'r41_sofa_c.webp',l:1.5,b:76.0,w:17.0,h:16.0},
  ]},
  {slot:'storage',z:30,pick:[
    {need:['storagebox'],src:'r41_storage_a.webp',l:37.0,b:72.0,w:7.5,h:9.54},
    {need:['small_cabinet'],src:'r41_storage_b.webp',l:36.5,b:72.0,w:8.0,h:12.92},
    {need:['sideboard'],src:'r41_storage_c.webp',l:35.0,b:72.0,w:10.0,h:8.84},
  ]},
  {slot:'shelf',z:30,pick:[
    {need:['bookshelf'],src:'r41_shelf_a.webp',l:73.0,b:79.0,w:11.5,h:26.07},
    {need:['bookshelf','photoframe'],src:'r41_shelf_b.webp',l:73.0,b:79.0,w:11.5,h:26.07},
    {need:['bookshelf','photoframe','plant_small'],src:'r41_shelf_c.webp',l:73.0,b:79.0,w:11.5,h:26.07},
  ]},
  {slot:'plant',z:31,pick:[
    {need:['plant_large'],src:'r41_plant_a.webp',l:62.5,b:79.5,w:8.6,h:24.69},
    {need:['plant_large','plant_small'],src:'r41_plant_b.webp',l:62.5,b:79.5,w:9.4,h:26.99},
  ]},
  {slot:'floorlamp',z:32,pick:[
    {need:['floorlamp'],src:'r41_floorlamp.webp',l:19.0,b:71.0,w:6.5,h:27.12},
  ]},
  {slot:'desklight',z:40,onTopOf:'storage',pick:[
    {need:['desklight'],src:'r41_desklight.webp',l:36.4,b:null,w:4.4,h:7.55},
    {need:['moonlamp'],src:'r41_moonlamp.webp',l:36.4,b:null,w:4.2,h:7.66},
  ]},
  {slot:'photoframe',z:40,not:['bookshelf'],onTopOf:'storage',pick:[
    {need:['photoframe'],src:'r41_photoframe.webp',l:41.4,b:null,w:3.4,h:6.01},
  ]},
  {slot:'mug',z:41,pick:[
    {need:['panda_mug'],src:'r41_mug.webp',l:27.5,b:69.0,w:3.6,h:4.78},
  ]},
  {slot:'tissue',z:41,pick:[
    {need:['tissuebox'],src:'r41_tissue.webp',l:31.8,b:69.0,w:4.2,h:4.69},
  ]},
  {slot:'cushion',z:42,not:['sofa'],pick:[
    {need:['cushion'],src:'r41_cushion.webp',l:36.5,b:84.5,w:8.0,h:8.91},
  ]},
  {slot:'buddy',z:50,pick:[
    {need:['crab_plush'],src:'r41_buddy_crab.webp',l:6.5,b:88.0,w:5.8,h:6.92},
    {need:['croc_plush'],src:'r41_buddy_croc.webp',l:6.0,b:88.0,w:6.8,h:8.16},
    {need:['panda_plush'],src:'r41_buddy_panda.webp',l:6.2,b:88.0,w:6.0,h:9.51},
  ]},
  {slot:'gym',z:50,pick:[
    {need:['dumbbell'],src:'r41_gymcorner.webp',l:66.5,b:93.0,w:9.0,h:7.71},
    {need:['soccer_ball'],src:'r41_gymcorner.webp',l:66.5,b:93.0,w:9.0,h:7.71},
  ]},
  {slot:'slippers',z:51,pick:[
    {need:['slippers'],src:'r41_slippers.webp',l:21.0,b:95.5,w:8.5,h:7.37},
  ]},
];

/* 部屋に反映される家具のid（通知の対象）。
   単独表示・交換・親家具の絵への統合、いずれかで必ず部屋に現れるものを列挙する。 */
const ROOM41_REFLECTED=(function(){
  const s={};
  ROOM41_SLOTS.forEach(sl=>sl.pick.forEach(p=>p.need.forEach(id=>{s[id]=1;})));
  // 親家具の絵に描き込まれて反映されるもの
  ['rug','table','zabuton','pizza_corner','ramen_noren','blanket','plant_small','photoframe','cushion'].forEach(id=>{s[id]=1;});
  return s;
})();
function roomFurnVisible(id){return !!ROOM41_REFLECTED[id];}

/* 解放済みidの集合から、実際に描くレイヤーを組み立てる。 */
function room41Layers(okSet){
  const has=id=>!!okSet[id];
  const chosen={};
  ROOM41_SLOTS.forEach(sl=>{
    let picked=null;
    for(const p of sl.pick){
      if(p.need.every(has))picked=p;   // 後ろほど上位なので上書きしていく
    }
    if(!picked)return;
    if(sl.not&&sl.not.some(has))return;
    chosen[sl.slot]={...picked,z:sl.z,onTopOf:sl.onTopOf};
  });
  const out=[];
  Object.keys(chosen).forEach(slot=>{
    const c=chosen[slot];
    let b=c.b;
    if(c.onTopOf){                      // 親家具の天板へ載せる
      const parent=chosen[c.onTopOf];
      if(!parent)return;                // 親が無ければ置かない
      b=parent.b-parent.h;
    }
    if(b===null||b===undefined)return;
    out.push({key:slot,src:c.src,l:c.l,t:Math.round((b-c.h)*100)/100,w:c.w,z:c.z});
  });
  return out.sort((a,b)=>a.z-b.z);
}
/* 家具をタップしたときに出す情報（スロット→代表の家具id） */
function room41SlotItemId(slot,okSet){
  const sl=ROOM41_SLOTS.find(s=>s.slot===slot);
  if(!sl)return null;
  let last=null;
  for(const p of sl.pick){ if(p.need.every(id=>!!okSet[id]))last=p; }
  return last?last.need[last.need.length-1]:null;
}

/* 【窓夜景レイヤーの受け皿】公式の透過素材(1536×1024・窓ガラス内だけ夜景)を
   将来ここに置くだけで有効化されます。ファイルは assets/panda-room/v30/ に置き、
   対応する時間帯のキーを ROOM30_WINDOW_READY に追加してください(コード変更不要)。
   ・room30_window_night.webp     … 夜(night)
   ・room30_window_deepnight.webp … 深夜(deepnight。無ければ night 用で代用)
   READY に無い間は img を生成せず、CSS窓マスク(暫定フォールバック)を使います。
   ※Claude側で仮の夜景画像は作成しません(公式素材のみ)。 */
const ROOM30_WINDOW_SRC={night:'room30_window_night.webp',deepnight:'room30_window_deepnight.webp',evening:'room30_window_evening.webp'};
/* 【v41.1】夜・深夜の公式夜景素材が入ったので有効化。
   窓ガラスの内側だけを覆う透過WebP（1536x1024・room30_base.webpと完全一致）。
   夕方(evening)も同じ仕組みで動くようにしてあり、room30_window_evening.webp を置いて
   この配列に 'evening' を足すだけで有効になる（コード変更不要）。 */
const ROOM30_WINDOW_READY=['night','deepnight','evening'];
/* 【v41.2】窓景色の素材を差し替えたので、CDN/ブラウザが古い画像を掴んだままにならないよう
   URLにバージョンを付ける。素材を作り直したときはこの数字を上げるだけでよい。 */
const ROOM_WINDOW_VER='?v=413';
/* 【v41.2fix】?hour=0〜23 の開発用時刻上書き。コンポーネント内外どちらからも使えるよう関数化。 */
/* 【v41.2fix】?debug=1 のときだけ、部屋の状態を画面隅に出す（本番では非表示） */
function roomDebugOn(){
  try{return new URLSearchParams(window.location.search).get('debug')==='1';}catch(e){return false;}
}
function roomHourOverride(){
  try{
    const q=new URLSearchParams(window.location.search).get('hour');
    if(q===null)return undefined;
    const n=parseInt(q,10);
    return (Number.isFinite(n)&&n>=0&&n<=23)?n:undefined;
  }catch(e){return undefined;}
}
function windowNightSrcFor(bandId){
  // 【v41.1】夕方の窓素材（将来用）。ROOM30_WINDOW_READY に 'evening' を足せば有効になる。
  if(bandId==='evening')return ROOM30_WINDOW_READY.indexOf('evening')>=0?ROOM30_WINDOW_SRC.evening:null;
  // deepnight素材が無ければ night素材で代用(READYにあるものだけ返す)
  if(bandId==='deepnight'){
    if(ROOM30_WINDOW_READY.indexOf('deepnight')>=0)return ROOM30_WINDOW_SRC.deepnight;
    if(ROOM30_WINDOW_READY.indexOf('night')>=0)return ROOM30_WINDOW_SRC.night;
    return null;
  }
  if(bandId==='night'&&ROOM30_WINDOW_READY.indexOf('night')>=0)return ROOM30_WINDOW_SRC.night;
  return null;
}

/* パンダ状態画像。
   いま用意できている状態のidを PANDA30_READY に入れる。
   sleepy / ramen の素材(panda30_sleepy.webp / panda30_ramen.webp)が届いたら、
   ファイルを assets/panda-room/v30/ に置き、下の配列にidを足すだけで有効化されます。
   未着の状態は normal で表示します(切替ロジックは常に安全側=normalへフォールバック)。 */
const PANDA30={normal:'panda30_normal.webp',happy:'panda30_happy.webp',sleepy:'panda30_sleepy.webp',ramen:'panda30_ramen.webp'};
// 【v39変更】sleepy(深夜) / ramen(昼の食事イベント) の素材は揃っているので有効化する。
// 切替の条件そのもの(pandaImgFor)は変更していないため、頻繁に入れ替わることはない。
const PANDA30_READY=['normal','happy','sleepy','ramen'];
function pandaState30Ready(state){return PANDA30_READY.indexOf(state)>=0;}

/* ---- パンダ統計キー(バイブル§10.1) ---- */
function pandaStatsKey(uid){return 'yurutore_panda_stats_v1_'+(uid||'guest');}
const PANDA_STATS_DEFAULT={talkTotal:0,talkDays:[],tapTotal:0,roomVisits:0,firstRoomGreetingShown:false};
function loadPandaStats(uid){
  try{
    const s=JSON.parse(localStorage.getItem(pandaStatsKey(uid))||'null');
    if(s&&typeof s==='object')return {...PANDA_STATS_DEFAULT,...s,talkDays:Array.isArray(s.talkDays)?s.talkDays:[]};
  }catch(e){}
  return {...PANDA_STATS_DEFAULT};
}
function savePandaStats(uid,s){try{localStorage.setItem(pandaStatsKey(uid),JSON.stringify(s));}catch(e){}}
function bumpPandaStats(uid,patchFn){
  const s=loadPandaStats(uid);
  const nx=patchFn(s)||s;
  savePandaStats(uid,nx);
  return nx;
}
/* 会話統計: talkTotal+1。talkDaysは同じ日を二重追加しない(連打で日数が増えない) */
function recordTalkStat(uid){
  return bumpPandaStats(uid,s=>{
    s.talkTotal=(s.talkTotal||0)+1;
    const d=todayStrLocal();
    if(s.talkDays.indexOf(d)<0)s.talkDays.push(d);
    return s;
  });
}

/* ---- 旧ID移行(バイブル§10.3)。解放記録(everOk/seen)の旧IDを新IDへ写す ---- */
const ROOM30_ID_MIGRATE={mat:'pawmat',lamp:'floorlamp',photo:'photoframe',ramen:'ramen_shelf',pointStar:'neon',plant:'plant_large'};
function migrateUnlockIds(uid){
  try{
    const memo=loadRoomUnlockMemo(uid);
    if(!memo)return;
    let changed=false;
    for(const arr of [memo.seen,memo.everOk]){
      for(const oldId in ROOM30_ID_MIGRATE){
        const nw=ROOM30_ID_MIGRATE[oldId];
        if(arr.indexOf(oldId)>=0&&arr.indexOf(nw)<0){arr.push(nw);changed=true;}
      }
    }
    if(changed)saveRoomUnlockMemo(uid,memo);
  }catch(e){}
}

/* ---- 家具レジストリ(表示条件の唯一の判定元・バイブル§6/§10.4) ----
   src: assets/panda-room/v30/ 内のファイル名。素材未着の家具はsrcのままでよい。
   読み込み失敗時はそのレイヤーだけ非表示(部屋は壊れない)。
   unlock: (st,ps,extra)=>bool。st=roomStats, ps=pandaStats。'future'=条件は将来確定(一覧に「これから」表示) */
function room30Items(state,streak){
  const st=roomStats(state,streak);
  const ps=loadPandaStats(state&&state.auth);
  const month=new Date().getMonth()+1;
  const seaNote=(state.reports||[]).some(r=>r.note&&/海|うみ|旅行|りょこう/.test(r.note));
  const L=[
    // 基本3点(常時)
    {id:'rug',icon:'🟢',name:'まるいラグ',src:'room30_rug.webp',z:2,always:true,cond:'最初からある居場所',memory:'ここ、落ち着くよね〜',hs:{l:28,t:70,w:39,h:14},ok:true},
    {id:'table',icon:'🪵',name:'ローテーブル',src:'room30_table.webp',z:10,always:true,cond:'会話と食事の中心',memory:'今日は何を置こうかな？',hs:{l:15,t:63,w:21,h:17},ok:true},
    {id:'zabuton',icon:'🟡',name:'まるい座布団',src:'room30_zabuton.webp',z:12,always:true,cond:'パンダの定位置',memory:'ふかふかだよ〜',hs:{l:46,t:75,w:16,h:11},ok:true},
    // 成長家具(バイブル6.3)
    {id:'plant_large',icon:'🪴',name:'観葉植物(大)',src:'room30_plant_large.webp',z:14,cond:'初回運動',memory:'最初の一歩の記念だよ🐼',hs:{l:62.5,t:54.07,w:9.0,h:25.43},ok:st.total>=1},
    {id:'cushion',icon:'🟩',name:'ドット柄クッション',src:'room30_cushion.webp',z:15,cond:'運動3回',memory:'運動を3回記録した思い出だよ🐼',hs:{l:36.0,t:74.73,w:8.5,h:9.27},ok:st.total>=3},
    {id:'pawmat',icon:'🐾',name:'肉球ラグ',src:'room30_pawmat.webp',z:3,cond:'ウォーキング1回',memory:'いっしょに歩いた記憶だよ',hs:{l:30.0,t:84.51,w:20.0,h:11.49},ok:st.walkCount>=1},
    {id:'floorlamp',icon:'💡',name:'フロアランプ',src:'room30_floorlamp.webp',z:11,cond:'夜の記録1回',memory:'夜も戻ってきた日のあかり🌙',hs:{l:19.5,t:40.71,w:7.0,h:30.29},ok:st.nightCount>=1},
    {id:'photoframe',icon:'🖼️',name:'フォトフレーム',src:'room30_photoframe.webp',z:7,cond:'写真つき記録1回',memory:'残した思い出のワンシーン',hs:{l:39.5,t:51.9,w:4.5,h:8.1},ok:st.photoCount>=1},
    {id:'bookshelf',icon:'📚',name:'本棚',src:'room30_bookshelf.webp',z:4,cond:'会話した日数3日',memory:'会話が増えた記憶だよ',hs:{l:73.0,t:52.73,w:11.5,h:26.27},ok:(ps.talkDays||[]).length>=3},
    {id:'small_cabinet',icon:'🗄️',name:'小さな木製収納棚',src:'room30_small_cabinet.webp',z:5,cond:'ミッション5回',memory:'部屋を整えた記憶だよ',hs:{l:38.0,t:60.0,w:7.5,h:12.0},ok:st.missionDone>=5},
    {id:'ramen_shelf',icon:'🍜',name:'ラーメン棚',src:'room30_ramen_shelf.webp',z:6,cond:'食事メモ1回',memory:'食べる楽しみの棚だよ🍜',hs:{l:63.0,t:22.76,w:10.5,h:10.24},ok:st.foodCount>=1},
    {id:'sofa',icon:'🛋️',name:'グリーンソファ',src:'room30_sofa.webp',z:9,cond:'ミッション30回',memory:'一緒にくつろいだ時間だよ',hs:{l:1.5,t:61.39,w:15.5,h:14.61},ok:st.missionDone>=30},
    {id:'neon',icon:'💗',name:'ゆるトレネオン',src:'room30_neon.webp',z:8,cond:'パンダポイント100',memory:'ここが帰る場所の目印🐼',hs:{l:63.0,t:10.68,w:13.0,h:9.32},ok:(state.pandaPoints||0)>=100},
    {id:'dumbbell',icon:'🏋️',name:'ダンベル',src:'room30_dumbbell.webp',z:16,cond:'ジム/筋トレ/ストレッチ1回',memory:'軽く動いた記憶だよ',hs:{l:52.5,t:87.0,w:8.0,h:6.0},ok:st.gymCount>=1},
    {id:'soccer_ball',icon:'⚽',name:'サッカーボール',src:'room30_soccer_ball.webp',z:17,cond:'ウォーキング/ラン5回',memory:'一緒に遊べそうだね⚽',hs:{l:66.0,t:86.25,w:4.5,h:6.75},ok:st.walkCount>=5},
    {id:'pizza_corner',icon:'🍕',name:'ピザ置き場',src:'room30_pizza_corner.webp',z:18,cond:'食事メモ3回',memory:'たまのごほうび時間🍕',hs:{l:27.0,t:63.31,w:6.5,h:5.69},ok:st.foodCount>=3},
    {id:'sideboard',icon:'🪑',name:'サイドボード',src:'room30_sideboard.webp',z:5,cond:'記録10回',memory:'暮らしが整った日だよ',hs:{l:27.0,t:53.46,w:11.0,h:9.54},ok:st.total>=10},
    {id:'wall_shelf',icon:'📐',name:'ウォールシェルフ',src:'room30_wall_shelf.webp',z:7,cond:'お部屋に5回あそびに来る',memory:'飾りたくなった気持ち',hs:{l:75.5,t:44.42,w:8.0,h:5.58},ok:(ps.roomVisits||0)>=5},
    {id:'croc_plush',icon:'🐊',name:'ワニのぬいぐるみ',src:'room30_croc_plush.webp',z:19,cond:'お部屋に10回あそびに来る',memory:'ちょっと不思議な仲間だよ',hs:{l:1.0,t:79.6,w:7.0,h:8.4},ok:(ps.roomVisits||0)>=10},
    {id:'crab_plush',icon:'🦀',name:'カニのぬいぐるみ',src:'room30_crab_plush.webp',z:20,cond:'海や旅行のメモ1回',memory:'夏の気分の仲間だよ🦀',hs:{l:90.0,t:88.57,w:5.5,h:6.43},ok:seaNote},
    {id:'plant_small',icon:'🌱',name:'観葉植物(小)',src:'room30_plant_small.webp',z:13,cond:'記録20回',memory:'長く育てた時間だよ',hs:{l:85.5,t:77.2,w:5.5,h:10.8},ok:st.total>=20},
    {id:'storagebox',icon:'📦',name:'パンダ収納箱',src:'room30_storagebox.webp',z:21,cond:'家具5点解放',memory:'思い出をしまう場所だよ',hs:{l:8.0,t:77.27,w:7.0,h:8.73},ok:false /* 後段で計算 */},
    {id:'blanket',icon:'🧣',name:'チェック柄ブランケット',src:'room30_blanket.webp',z:22,cond:'冬に来店する',memory:'温かく過ごした時間',hs:{l:9.0,t:64.78,w:6.0,h:6.22},ok:(month===12||month<=2)&&(ps.roomVisits||0)>=1},
    {id:'panda_mug',icon:'☕',name:'パンダのマグカップ',src:'room30_panda_mug.webp',z:23,cond:'ミッション10回',memory:'ほっと一息のマグだよ',hs:{l:34.0,t:63.56,w:3.6,h:4.94},ok:st.missionDone>=10},
    {id:'moonlamp',icon:'🌙',name:'月のランプ',src:'room30_moonlamp.webp',z:24,cond:'記録30回',memory:'眠れない夜の灯りだよ',hs:{l:77.0,t:35.25,w:5.0,h:9.15},ok:st.total>=30},
    /* ── 【v40新規追加】小物家具10点。行動の種類を散らして、ゆっくり増えるようにした ── */
    {id:'slippers',icon:'🩴',name:'ルームスリッパ',src:'f39_slippers.webp',z:31,cond:'記録5回',memory:'ただいまの合図だよ',hs:{l:20.0,t:87.32,w:9.0,h:7.68},ok:st.total>=5},
    {id:'small_rug',icon:'🟪',name:'小さなラグ',src:'f39_small_rug.webp',z:14,cond:'ストレッチ5回',memory:'のびのびした時間の記憶',hs:{l:63.0,t:85.94,w:14.0,h:9.06},ok:st.stretchCount>=5},
    {id:'desklight',icon:'🔆',name:'卓上ライト',src:'f39_desklight.webp',z:26,cond:'夜の記録5回',memory:'夜のお供のあかり',hs:{l:28.5,t:44.78,w:5.0,h:8.42},ok:st.nightCount>=5},
    {id:'poster',icon:'🖼',name:'パンダポスター',src:'f39_poster.webp',z:6,cond:'朝の運動5回',memory:'朝が気持ちよかった日の記憶☀️',hs:{l:76.5,t:20.7,w:7.0,h:13.3},ok:st.morningCount>=5},
    {id:'ramen_noren',icon:'🏮',name:'ラーメンのれん',src:'f39_ramen_noren.webp',z:6,cond:'食事メモ5回',memory:'おいしい記憶が増えてきた🍜',hs:{l:63.0,t:39.66,w:8.0,h:7.34},ok:st.foodCount>=5},
    {id:'wallclock',icon:'🕐',name:'まるい壁時計',src:'f39_wallclock.webp',z:6,cond:'7日つづけて記録',memory:'続いた日々の記憶だよ',hs:{l:77.5,t:10.25,w:6.5,h:9.75},ok:streak>=7},
    {id:'tissuebox',icon:'🧻',name:'ティッシュ箱',src:'f39_tissuebox.webp',z:27,cond:'記録15回',memory:'生活感がちょっと増えたね',hs:{l:34.0,t:48.29,w:4.5,h:4.91},ok:st.total>=15},
    {id:'curtain_charm',icon:'🔔',name:'カーテンのチャーム',src:'f39_curtain_charm.webp',z:6,cond:'お部屋に20回あそびに来る',memory:'よく来てくれる人へのお礼🐼',hs:{l:55.5,t:31.23,w:3.2,h:8.77},ok:(ps.roomVisits||0)>=20},
    {id:'panda_plush',icon:'🧸',name:'パンダのぬいぐるみ',src:'f39_panda_plush.webp',z:28,cond:'記録50回',memory:'ずっと一緒にいた証だよ',hs:{l:3.0,t:60.77,w:5.5,h:8.73},ok:st.total>=50},
    {id:'wall_garland',icon:'🎀',name:'お祝いガーランド',src:'f39_wall_garland.webp',z:1,cond:'記録100回',memory:'100回。もう立派な習慣だね🎉',hs:{l:24.0,t:0.55,w:22.0,h:10.45},ok:st.total>=100}
  ];
  // 成長家具の解放数(基本3点を除く)→ storagebox判定
  const grown=L.filter(i=>!i.always&&i.ok).length;
  const sb=L.find(i=>i.id==='storagebox'); sb.ok=grown>=5;
  // 一度でも達成した家具は永続化(everOk)
  try{
    const memo=loadRoomUnlockMemo(state&&state.auth);
    if(memo&&memo.everOk&&memo.everOk.length){
      for(const it of L){ if(memo.everOk.indexOf(it.id)>=0)it.ok=true; }
    }
  }catch(e){}
  return L;
}
/* 思い出コレクション(部屋には出ない・一覧のみ。旧v29項目の互換) */
function room30Memories(state,streak){
  const st=roomStats(state,streak);
  const ps=loadPandaStats(state&&state.auth);
  return [
    {id:'chat',icon:'💬',name:'はじめての会話',cond:'パンダと1回お話',ok:(ps.talkTotal||0)>=1},
    {id:'timecapsule',icon:'⏳',name:'未来への手紙',cond:'タイムカプセル1通',ok:(state.timeCapsules||[]).length>=1},
    {id:'missionPlant',icon:'🌿',name:'ミッション若葉',cond:'ミッション5回',ok:st.missionDone>=5},
    {id:'crown',icon:'👑',name:'常連の王冠',cond:'7日続けて会えた記念',ok:st.streak>=7}
  ].map(m=>{
    try{
      const memo=loadRoomUnlockMemo(state&&state.auth);
      if(memo&&memo.everOk.indexOf(m.id)>=0)m.ok=true;
    }catch(e){}
    return m;
  });
}
/* パンダ画像の決定(バイブル§7.3の優先順位)。tempは'happy'等の一時状態 */
function pandaImgFor(temp,ramenOk,hour){
  const h=(hour===undefined?new Date().getHours():hour);
  // バイブル§7.3の優先順位。未着状態は normal にフォールバックする。
  let st='normal';
  if(temp==='happy')st='happy';                 // 1,2: 解放/タップの喜ぶ
  else if(temp==='ramen')st='ramen';            // 3: 生活イベント(昼)
  else if(h>=23||h<5)st='sleepy';               // 4: 深夜
  if(!pandaState30Ready(st))st='normal';        // 素材未着なら通常へ
  return PANDA30[st];
}

const ROOM_TALKLOG_KEY='yurutore_room_talklog_v1';
const ROOM_SETTINGS_KEY='yurutore_room_settings_v1';
const ROOM_SETTINGS_DEFAULT={motion:true,sound:true,night:'auto'};

/* ───────────────────────────────────────────────
   「今日はパンジロー何してる？」= 毎日少しだけ変化する世界。
   すべて通日シード(today)から決定的に選ぶので、保存もstateも増やしません。
   会話ではなく“独り言・行動描写”。ユーザーに行動を促す表現や圧は入れません。
   素材追加なし・localStorage不変・CSSと既存ロジックのみ。
   ─────────────────────────────────────────────── */
/* 通日シード。端末のローカル日付が変わる深夜0時に切り替わるようにする。
   UTC基準(Date.now()/86400000)だと日本では朝9時に日替わりしてしまうため、
   既存の日付キー生成(dk = ローカルの年-月-日)を流用して数値シードを作る。
   ※新しいlocalStorageキーは追加しない(その場で計算するだけ)。 */
function roomTodaySeed(){
  // dk(既存): `${getFullYear()}-${getMonth()}-${getDate()}` はローカル日付。
  // これを決定的な整数へ畳み込む(同じ日は同じ値・日付が変われば必ず変わる)。
  const d=new Date();
  return d.getFullYear()*10000 + d.getMonth()*100 + d.getDate();
}

/* 今日のひとり言(パンジロー本人の自然な独り言・全ひらがな)。時間帯ごとの生活の一場面。
   ユーザーへの命令・運動の促し・継続日数・評価・励ましは入れない。 */
const ROOM_TODAY_MONOLOGUE={
  morning:[
    'あさの ひかり、きもちいいな〜',
    'ふぁ〜、よく ねむれたなぁ。',
    'きょうは いい てんきみたい。',
    'まどの そと、あかるくなってきたね。',
    'んー、そろそろ おきようかな。',
    'あさの くうき、すきだなぁ。',
    'カーテン あけると うれしくなるね。'
  ],
  noon:[
    'きょうは まどべで ぼーっとする ひ。',
    'ざぶとん、やっぱり おちつくなぁ。',
    'おひるって なんだか のんびりするね。',
    'ゆかが あったかくて きもちいい〜',
    'ふふ、なんだか ごきげんだなぁ。',
    'すこし おなか すいたかも。',
    'くび かしげると せかいが かたむくね。'
  ],
  evening:[
    'ゆうやけ、きれいだなぁ。',
    'いちにち、あっというまだったね。',
    'そろそろ ゆうがたかぁ。',
    'あかねいろの へや、すきだなぁ。',
    'かぜが すこし ひんやりしてきたね。',
    'んーっと、せのび いっかい。'
  ],
  night:[
    'よるの へやって しずかで いいね。',
    'あかりの そば、あったかいなぁ。',
    'ほし、みえるかな〜。',
    'よるは のんびり できるね。',
    'ぬくぬく、しあわせだなぁ。',
    'ふぁ〜、ちょっと ねむいかも。'
  ],
  deepnight:[
    'そろそろ ねむくなってきたかも。',
    'ん〜、まぶたが おもいなぁ。',
    'しずかな よる、すきだよ。',
    'ゆめ、みられるかな〜。',
    'すぅ…すぅ…。'
  ]
};
function roomTodayMonologue(bandId){
  const pool=ROOM_TODAY_MONOLOGUE[bandId]||ROOM_TODAY_MONOLOGUE.noon;
  const off={morning:0,noon:1,evening:2,night:3,deepnight:4}[bandId]||0;
  return pool[(roomTodaySeed()+off*3)%pool.length];
}

/* ═══════════════ 【v42新規追加】パンジロー生活システム ═══════════════
   v41までの「常時ゆらす待機アニメーション」(pose-lean-l / pose-lean-r / pose-sway /
   pose-tilt / ROOM_TODAY_POSE / roomTodayPose)は廃止した。
   パンジローは"常に動いているキャラクター"ではなく、
   「静かに過ごしている → ときどき別のことをしている」存在として扱う。

   ・生活状態は6つ(normal / window / eat / relax_floor / workout / sofa)
   ・時間帯(既存の roomDisplayBand の band.id)ごとに出現確率を変える
   ・一定時間(既定60分)は同じ行動を維持する(開き直しても基本は変わらない)
   ・家具が未解放なら、その家具を使う行動は選ばない(安全な行動へ振り替える)
   ・素材(assets/panda-room/v42/)が未配置なら既存のv30立ち絵へフォールバックする
     ※CSSで回転させて「寝ている風」にはしない。404も出さない。
   ═══════════════════════════════════════════════════════════════════ */
const PANDA42_DIR='assets/panda-room/v42/';
const PANDA42_STATES=['normal','window','eat','relax_floor','workout','sofa'];

/* 【素材の追加手順】
   透明WebP(1536×1024基準で切り出した各行動の立ち絵)を assets/panda-room/v42/ に置き、
   下の PANDA42_READY へ id を1つ足すだけで有効になる(コードの他の変更は不要)。
   READY に無い行動は img を v42 のパスで生成しないため、404は1件も出ない。 */
/* 【v42.1】生活画像を正式実装したので、8ポーズすべてを有効化した。
   ここに無いキーは v42 のパスへ img を生成しないため、404は出ない。 */
const PANDA42_READY=['normal','window','eat','pizza','relax_floor','workout','sofa','beer'];

/* 各行動の表示位置とタップ領域(ステージ画像に対する%)。
   数値だけを後から調整できるよう、JSXへは絶対にベタ書きしない。
   left/top/width/height … 立ち絵の表示ボックス
   tapLeft/tapTop/tapWidth/tapHeight … タップ領域(立ち絵より少し広め)
   zIndex … 家具レイヤー(z2)より前・暖色レイヤー(z5)より後ろ。基本は4のまま。
   anim  … 動きのCSSクラス(§10。激しく動かさない) */
/* 各ポーズの表示位置・タップ領域・隠す家具(ステージ画像に対する%)。
   数値だけを後から調整できるよう、JSXへは絶対にベタ書きしない。
     left/top/width/height   … 立ち絵の表示ボックス
     tapLeft/tapTop/tapWidth/tapHeight … タップ領域。
       横長ポーズ(relax_floor / pizza / beer / sofa)は立ち絵用の固定領域を流用せず、
       その絵の中で「パンジロー本体」が写っている範囲に合わせて個別に持たせている。
     zIndex … 家具レイヤー(z2)より前・暖色レイヤー(z5)より後ろ。基本は4。
     ※【v42.2】常時ループの動き(anim)はこの表から廃止した。
       仕草は PANDA42_MINI（ミニアクション）が担当する。基本は完全に静止。
     hide   … このポーズのあいだ描かない家具。素材の中に同じ家具が描かれている場合の
              二重表示を防ぐ。v30アイテムid / v41スロットkey のどちらでも書ける。
   ※ 数値は 1536×1024 の部屋画像に対する%。?action= で1つずつ固定表示して調整できる。 */
/* 各ポーズの表示位置・タップ領域・隠す家具(部屋画像 1536x1024 に対する%)。
   数値だけを後から調整できるよう、JSXへは絶対にベタ書きしない。
     left/top/width/height … 立ち絵の表示ボックス
     tapLeft/tapTop/tapWidth/tapHeight … タップ領域。
       横長ポーズ(relax_floor / pizza / beer / sofa)は立ち絵用の固定領域を流用せず、
       その絵の中で「パンジロー本体」が写っている範囲に合わせて個別に持たせている。
     zIndex … 家具レイヤー(z2)より前・暖色レイヤー(z5)より後ろ。基本は4。
     anim   … 動きのCSSクラス(激しく動かさない)
     hide   … このポーズのあいだ描かない家具。素材の中に同じ家具が描かれている場合の
              二重表示を防ぐ。v30アイテムid / v41スロットkey のどちらでも書ける。

   【重要・セーフバンド】スマホでは部屋(比1.5)がカードより横に広く、中央寄せで
   横スクロールする。実測で 320px 幅の端末が最初に見せるのは stage の 28.6%〜71.4% だけ。
   そのため全ポーズの表示ボックスを left>=29% / right<=71% に収めている。
   位置を変えるときも、この範囲から出さないこと(出すと初期表示でキャラが切れる)。
   ?action= / ?variant= で1つずつ固定表示しながら調整できる。 */
const PANDA42_ACTIONS={
  normal:{
    // 部屋のまんなか(ざぶとん付近)で立って過ごす。立ち絵のみ
    src:'panda42_normal.webp', fallback:'normal',
    left:46.7, top:53.5, width:13.8, height:31.08,
    tapLeft:45.7, tapTop:52.5, tapWidth:15.8, tapHeight:33.08, zIndex:4,
    hide:[]
  },
  window:{
    // 窓ガラスの手前に立ち、後ろ姿で外を眺める
    src:'panda42_window.webp', fallback:'normal',
    left:31.5, top:51.9, width:13.0, height:32.14,
    tapLeft:30.5, tapTop:50.9, tapWidth:15.0, tapHeight:34.14, zIndex:4,
    hide:[]
  },
  eat:{
    // ラーメン。素材に小さなテーブルが描かれているので、部屋のテーブルと、
    // その上に載っているマグ・ティッシュを隠す(隠さないと宙に浮いて見える)
    src:'panda42_eat.webp', fallback:'ramen',
    left:32.0, top:53.2, width:20.0, height:31.76,
    tapLeft:35.0, tapTop:52.2, tapWidth:18.0, tapHeight:31.22, zIndex:4,
    hide:['table','mug','tissue']
  },
  pizza:{
    // eat のレアバリエーション(25%)。ピザ箱とドリンクつきで横に広い
    src:'panda42_pizza.webp', fallback:'ramen',
    left:31.0, top:52.1, width:25.0, height:34.9,
    tapLeft:37.0, tapTop:51.1, tapWidth:20.0, tapHeight:35.15, zIndex:4,
    hide:['table','mug','tissue']
  },
  relax_floor:{
    // ラグの上でゴロ寝。素材のラグは部屋のラグに重なって自然に見えるので何も隠さない
    src:'panda42_relax_floor.webp', fallback:'sleepy',
    left:33.0, top:60.0, width:27.0, height:30.44,
    tapLeft:33.62, tapTop:64.48, tapWidth:19.82, tapHeight:26.35, zIndex:4,
    hide:[]
  },
  workout:{
    // 筋トレ。素材にダンベルと水筒が描かれているので、部屋のジムコーナー(gym)は隠す
    src:'panda42_workout.webp', fallback:'normal',
    left:50.0, top:54.2, width:19.0, height:31.85,
    tapLeft:50.52, tapTop:53.2, tapWidth:19.48, tapHeight:33.85, zIndex:4,
    hide:['gym']
  },
  sofa:{
    // ソファでくつろぐ。素材にソファ本体が描かれているので、部屋のソファ(sofaスロット)は隠す
    // これで「ソファの前に立っている」ようにも「ソファが二重」にも見えない
    src:'panda42_sofa.webp', fallback:'normal',
    left:29.5, top:48.7, width:22.0, height:28.76,
    tapLeft:30.26, tapTop:48.56, tapWidth:16.74, tapHeight:24.72, zIndex:4,
    hide:['sofa']
  },
  beer:{
    // 【夜限定レア】19〜23時に sofa / eat が選ばれた夜だけ、まれに出る
    // 通常行動ではないので PANDA42_WEIGHTS には入れない
    src:'panda42_beer.webp', fallback:'normal',
    left:32.0, top:60.7, width:31.0, height:31.34,
    tapLeft:39.06, tapTop:60.33, tapWidth:24.01, tapHeight:32.71, zIndex:4,
    hide:['table','mug','tissue']
  }
};

/* 【§9 前後関係の将来対応】パンダより手前に描く家具パーツ(例: ソファの前面)。
   透過素材が用意できたら {key,src,l,t,w,z} を足すだけでパンダの前に重なる。
   いまは空配列なので描画も読み込みも一切発生しない(既存のレイヤー構造は無変更)。 */
const ROOM42_FRONT_LAYERS=[];

/* 時間帯ごとの出現確率(§4)。キーは既存の band.id をそのまま使う。
   新しい時間判定システムは作らない(roomDisplayBand が唯一の判定元)。
     morning(5-11) / noon(11-16) / evening(16-19) / night(19-23) / deepnight(23-5) */
const PANDA42_WEIGHTS={
  morning:  {window:40, normal:30, workout:20, sofa:10},
  noon:     {workout:30, normal:25, window:15, eat:15, relax_floor:15},
  evening:  {eat:35, window:25, sofa:20, normal:10, relax_floor:10},
  night:    {sofa:40, relax_floor:25, eat:15, window:10, normal:10},
  deepnight:{relax_floor:60, sofa:30, normal:10}   // 深夜に workout は出さない
};

/* 生活状態を固定する時間の長さ(分)。§5「30〜90分程度」。
   同じブロックの間は、画面を閉じて開き直しても同じ行動のまま。 */
const PANDA42_BLOCK_MIN=60;

/* 家具が未解放のときの振り替え先(§6)。
   ・sofa    … 未解放なら relax_floor(朝だけは normal のほうが自然)
   ・workout … dumbbell 未解放なら normal
   ・eat     … テーブルは初期家具なので常に可能 */
function panda42FallbackAction(action,bandId,okSet){
  if(action==='sofa'&&!(okSet&&okSet.sofa))return (bandId==='morning')?'normal':'relax_floor';
  if(action==='workout'&&!(okSet&&okSet.dumbbell))return 'normal';
  return action;
}

/* 生活状態の決定(§5 決定的な選択)。
   seed = ユーザーID + ローカル日付 + 時間帯 + 時間ブロック
   → 同じ時間ブロックの間は必ず同じ行動。日付が変われば必ず変わる。
   保存キーは増やさない(その場で計算するだけ・localStorageは一切さわらない)。 */
/* 出現「率」を factor 倍にする(重みを factor 倍にするのとは違う点に注意)。
   重みだけ増やすと母数も一緒に増えてしまい、30%→45%にしたつもりが39%にしかならない。
   ここでは他の候補の重みは動かさず、目的の出現率になるよう当該の重みだけを解き直す。 */
function panda42BoostShare(pool,key,factor,cap){
  if(!pool[key])return;
  const total=Object.keys(pool).reduce((s,k)=>s+pool[k],0);
  const rest=total-pool[key];
  if(rest<=0)return;
  const target=Math.min(pool[key]/total*factor,(cap===undefined?0.5:cap));
  pool[key]=Math.max(1,Math.round(target*rest/(1-target)));
}

function panda42PickAction({bandId,okSet,userId,now,exercisedToday,ramenOk}){
  const d=now||new Date();
  const weights=PANDA42_WEIGHTS[bandId]||PANDA42_WEIGHTS.noon;
  // ① 家具の解放状態に合わせて候補を振り替える(重みは振り替え先へ合算)
  const pool={};
  Object.keys(weights).forEach(act=>{
    const to=panda42FallbackAction(act,bandId,okSet);
    pool[to]=(pool[to]||0)+weights[act];
  });
  /* ② 運動記録との連動(§7)。当日の運動記録があれば workout の出現率を1.5倍にする。
        (例: 昼 30% → 45%)。「ユーザーが運動したからパンジローも少しやる気になった」
        くらいの表現にとどめ、競争・連続記録・煽りにはしない。
        ダンベル未解放のときは①で workout が候補から消えているので、何も起きない。 */
  if(exercisedToday)panda42BoostShare(pool,'workout',1.5,0.5);
  /* ③ ラーメン棚を解放していたら、食事の出現率を少しだけ上げる(§6。35%→約41%) */
  if(ramenOk)panda42BoostShare(pool,'eat',1.15,0.5);
  const keys=Object.keys(pool).filter(k=>pool[k]>0);
  if(!keys.length)return 'normal';
  const total=keys.reduce((s,k)=>s+pool[k],0);
  // ④ 決定的な乱数(同じブロック内は同じ値・日付/時間帯/ブロックが変われば必ず変わる)
  const block=Math.floor((d.getHours()*60+d.getMinutes())/PANDA42_BLOCK_MIN);
  const seed=fnv1a([(userId||'guest'),todayStrLocal(d),bandId,String(block)].join('|'));
  let r=seed%total;
  for(const k of keys){ r-=pool[k]; if(r<0)return k; }
  return keys[keys.length-1];
}

/* ═══════════════ 【v42.1新規追加】食事バリエーションと夜限定レア ═══════════════
   生活状態(6つ)の決定ロジックは v42 のまま一切作り直していない。
   ここは「選ばれた生活状態を、どの絵で見せるか」だけを決める後段の処理。

   ・eat  … ラーメン75% / ピザ25%
   ・beer … 夜(19〜23時)に sofa または eat が選ばれたときだけ、12%で置き換わる
            朝・昼・夕方・深夜は0%。毎晩は出さない。ユーザーが選ぶUIは作らない。
   どちらも v42 と同じ「日付＋時間帯＋時間ブロック」のシードから決定的に選ぶので、
   同じ時間帯に閉じて開き直しても変わらない。localStorageは増やさない。
   ═══════════════════════════════════════════════════════════════════ */
const PANDA42_EAT_PIZZA_PCT=25;   // eat のうちピザになる割合(%)
const PANDA42_BEER_PCT=12;        // 夜に sofa / eat がビールへ置き換わる割合(%)
const PANDA42_BEER_BANDS=['night'];       // 既存の band.id をそのまま使う。night=19〜23時
const PANDA42_BEER_BASE=['sofa','eat'];   // この行動が選ばれた夜だけ候補になる

/* v42のブロックシードに「用途ごとの塩」を足して、独立だが決定的な0〜99を作る。
   同じ時間ブロックの間は必ず同じ値になり、ブロック/日付が変われば変わる。 */
function panda42BlockRoll(salt,userId,now,bandId){
  const d=now||new Date();
  const block=Math.floor((d.getHours()*60+d.getMinutes())/PANDA42_BLOCK_MIN);
  return fnv1a([salt,(userId||'guest'),todayStrLocal(d),bandId,String(block)].join('|'))%100;
}

/* 生活状態 → 実際に表示するポーズ(PANDA42_ACTIONS のキー)を決める。
   生活状態そのものは panda42PickAction が決めており、ここでは変えない。 */
function panda42PickPose({action,bandId,userId,now}){
  // ① 夜限定レア: ビール。ここが唯一の出現経路(通常行動を置き換える)
  if(PANDA42_BEER_BANDS.indexOf(bandId)>=0 && PANDA42_BEER_BASE.indexOf(action)>=0){
    if(panda42BlockRoll('beer',userId,now,bandId)<PANDA42_BEER_PCT)return 'beer';
  }
  // ② 食事の中身: ラーメン or ピザ
  if(action==='eat'){
    return (panda42BlockRoll('meal',userId,now,bandId)<PANDA42_EAT_PIZZA_PCT)?'pizza':'eat';
  }
  return action;
}

/* 【開発用】?action=window などで生活状態を強制表示する。本番UIには一切表示されない。 */
function roomActionOverride(){
  try{
    const q=new URLSearchParams(window.location.search).get('action');
    return (q&&PANDA42_STATES.indexOf(q)>=0)?q:null;
  }catch(e){return null;}
}
/* 【開発用】?variant=ramen / pizza / beer で、表示するポーズを直接指定する。
   位置合わせ用の強制表示なので、時間帯や家具の条件は無視する。本番UIには出さない。 */
const PANDA42_VARIANT_POSE={ramen:'eat',pizza:'pizza',beer:'beer'};
function roomVariantOverride(){
  try{
    const q=new URLSearchParams(window.location.search).get('variant');
    return (q&&PANDA42_VARIANT_POSE[q])?PANDA42_VARIANT_POSE[q]:null;
  }catch(e){return null;}
}
/* 【開発用】?mini=1 でミニアクションの待ち時間を短縮し、候補を順番に再生する。
   位置合わせ・動作確認用。本番UIには一切出さない。 */
function roomMiniFast(){
  try{return new URLSearchParams(window.location.search).get('mini')==='1';}catch(e){return false;}
}

/* ═══════════════ 【v42.2新規追加】ミニアクション ═══════════════
   考え方: パンジローは「常に動いているキャラクター」ではない。
   基本は完全に静止していて、ときどき短い仕草をして、また静止へ戻る。
   → v42/v42.1 にあった常時ループのCSSアニメーション
      (act-normal / act-window / act-eat / act-relax / act-workout / act-sofa,
       および常時まばたきの anim-blink42) は廃止した。
      いまはJS側のタイマーが、一定間隔で「1回だけ再生されるCSSクラス」を
      短時間だけ付け外しする方式になっている。

   データの意味:
     first  … 部屋を開いてから最初のミニアクションまでの待ち時間 [最小ms, 最大ms]
              (開いた瞬間に動かさないための助走)
     delay  … 2回目以降の間隔 [最小ms, 最大ms] (毎回ランダムなので同じ秒数にならない)
     acts   … 候補。w=抽選の重み / dur=動く時間(ms) / cls=1回だけ再生するCSSクラス
              fx      … 一瞬だけ出る小さな文字(任意)
              fxEmoji … 絵文字のときtrue(チップ背景を付けず、そのまま出す)
              fxChance… その文字が出る確率(毎回は出さない)
              fxDur   … 文字が消えるまでのms
              fxAt    … 立ち絵のボックスに対する表示位置(%)
   ※ここの数値を変えるだけで頻度・強さを調整できる。JSXにはベタ書きしない。
   ═══════════════════════════════════════════════════════════════ */
const PANDA42_MINI={
  /* 通常立ち。基本は静止。まばたき/小さく首を傾ける/片手を小さく上げる */
  normal:{
    first:[3000,8000], delay:[9000,22000],
    acts:[
      {id:'blink', cls:'mini-blink', dur:440,  w:4},
      {id:'tilt',  cls:'mini-tilt',  dur:1500, w:3},
      {id:'wave',  cls:'mini-wave',  dur:1300, w:2}
    ]
  },
  /* 窓。いちばん静か。「外を見ながらぼーっとしている」感じを優先する。
     動かすのはパンジローの立ち絵だけで、窓の景色やカーテンには触れない。 */
  window:{
    first:[5000,10000], delay:[15000,30000],
    acts:[
      {id:'gaze', cls:'mini-gaze', dur:2400, w:3},   // 頭をほんの少し傾ける
      {id:'lean', cls:'mini-lean', dur:2800, w:2}    // 体を2〜3pxだけ横へ寄せてすぐ戻る
    ]
  },
  /* ラーメン。ほんの少し上下して「一口すする」。ズズ…はたまにだけ。 */
  eat:{
    first:[3000,7000], delay:[8000,18000],
    acts:[
      {id:'slurp', cls:'mini-slurp', dur:900, w:5,
       fx:'ズズ…', fxChance:0.35, fxDur:1300, fxAt:{left:58,top:-4}},
      {id:'blink', cls:'mini-blink', dur:440, w:2}
    ]
  },
  /* ピザ。持っている側(絵の左)を軽く上げて「もぐ」。画像全体は大きく動かさない。 */
  pizza:{
    first:[3000,7000], delay:[8000,18000],
    acts:[
      {id:'bite',  cls:'mini-bite',  dur:950, w:5,
       fx:'🍕', fxEmoji:true, fxChance:0.22, fxDur:1300, fxAt:{left:62,top:-7}},
      {id:'munch', cls:'mini-bite',  dur:950, w:3},
      {id:'blink', cls:'mini-blink', dur:440, w:2}
    ]
  },
  /* ゴロ寝。いちばん動かさない状態。呼吸と、たまにZが1〜2個だけ。 */
  relax_floor:{
    first:[5000,10000], delay:[12000,28000],
    acts:[
      {id:'breathe', cls:'mini-breathe', dur:3200, w:4},
      {id:'sleepz',  cls:'mini-breathe', dur:3200, w:2,
       fx:'Z z', fxChance:1, fxDur:3000, fxAt:{left:74,top:-6}, fxSlow:true}
    ]
  },
  /* 筋トレ。ここだけ少し動く。2〜3回上げたら止まって、次まで10〜25秒休む。 */
  workout:{
    first:[3000,8000], delay:[10000,25000],
    acts:[
      {id:'reps', cls:'mini-reps', dur:2600, w:1,
       fx:'💦', fxEmoji:true, fxChance:0.3, fxDur:1500, fxAt:{left:48,top:-10}}
    ]
  },
  /* ソファ。ほぼ静止。少し姿勢を変える / 小さく息をつく。 */
  sofa:{
    first:[4000,9000], delay:[12000,28000],
    acts:[
      {id:'shift', cls:'mini-shift', dur:1900, w:3},
      {id:'sigh',  cls:'mini-sigh',  dur:1700, w:2,
       fx:'ふぅ〜', fxChance:0.3, fxDur:1400, fxAt:{left:46,top:-10}}
    ]
  },
  /* ビール。ジョッキを少し持ち上げて、すぐ戻す。コミカルな晩酌の範囲に留める。
     酔ってフラフラする・何杯も飲む・常時ジョッキを振る表現はしない。 */
  beer:{
    first:[4000,9000], delay:[15000,30000],
    acts:[
      {id:'cheers', cls:'mini-cheers', dur:1000, w:4,
       fx:'ぷは〜', fxChance:0.25, fxDur:1400, fxAt:{left:30,top:-11}},
      {id:'blink',  cls:'mini-blink', dur:440, w:2}
    ]
  }
};

/* ミニアクションのタイマー。
   ・setInterval は使わない。setTimeout → 実行 → 次の setTimeout の連鎖方式。
   ・タイマーIDは常に1つだけ(timerRef)。張り替える前に必ず clearTimeout する。
   ・pose / enabled が変わったら作り直す。アンマウント時は必ず止める(多重・リークなし)。
   ・enabled=false(モーション低減 / 部屋を離れた / タブが非表示 など)では
     タイマーを1本も走らせない。生活画像そのものは表示したままになる。 */
function usePanjiroMiniAction({pose,enabled,fast}){
  const [mini,setMini]=useState(null);
  const timerRef=useRef(null);
  const restartRef=useRef(null);
  useEffect(()=>{
    const stop=()=>{ if(timerRef.current){clearTimeout(timerRef.current);timerRef.current=null;} };
    stop(); setMini(null); restartRef.current=null;
    const cfg=PANDA42_MINI[pose];
    if(!enabled||!cfg||!cfg.acts||!cfg.acts.length)return stop;
    let alive=true, turn=0;
    const rnd=(lo,hi)=>lo+Math.random()*(hi-lo);
    const pick=()=>{
      // ?mini=1 のときは候補を順番に回して、全部の仕草をすぐ確認できるようにする
      if(fast)return cfg.acts[(turn++)%cfg.acts.length];
      const tot=cfg.acts.reduce((n,a)=>n+(a.w||1),0);
      let r=Math.random()*tot;
      for(const a of cfg.acts){ r-=(a.w||1); if(r<0)return a; }
      return cfg.acts[cfg.acts.length-1];
    };
    const schedule=(first)=>{
      if(!alive)return;
      const range=first?cfg.first:cfg.delay;
      // 通常は8〜30秒。?mini=1 のときだけ 0.8〜2.4秒まで短縮する(開発用)
      const wait=fast?rnd(800,2400):rnd(range[0],range[1]);
      stop();
      timerRef.current=setTimeout(run,wait);
    };
    const run=()=>{
      if(!alive)return;
      const a=pick();
      const showFx=!!(a.fx&&(fast||Math.random()<(a.fxChance||0)));
      setMini({id:a.id,cls:a.cls,fx:showFx?a.fx:null,fxAt:a.fxAt,fxSlow:!!a.fxSlow,fxEmoji:!!a.fxEmoji});
      // 仕草が終わったら必ず静止へ戻す → そのあと次の待ち時間へ
      const dur=Math.max(a.dur||1000, showFx?(a.fxDur||1400):0);
      stop();
      timerRef.current=setTimeout(()=>{
        if(!alive)return;
        setMini(null);
        schedule(false);
      },dur);
    };
    // タップされたとき用: 進行中の仕草をすぐ止めて、次の間隔から仕切り直す
    restartRef.current=()=>{ if(!alive)return; stop(); setMini(null); schedule(false); };
    schedule(true);
    return ()=>{ alive=false; restartRef.current=null; stop(); };
  },[pose,enabled,fast]);
  const interrupt=()=>{ if(restartRef.current)restartRef.current(); };
  return {mini,interrupt};
}

/* 端末の「動きを減らす」設定。matchMedia が無い環境でも落ちないようにする。 */
function prefersReducedMotion(){
  try{return !!(window.matchMedia&&window.matchMedia('(prefers-reduced-motion:reduce)').matches);}catch(e){return false;}
}

/* 部屋が実際に画面に出ているあいだだけ true。
   ・タブが非表示 → false
   ・スクロールで画面外 → false
   ・全画面パンダルームに隠れている(paused) → false
   これでパンダルーム以外ではタイマーが1本も動かない。 */
function useRoomOnScreen(ref,paused){
  const [visible,setVisible]=useState(true);
  const [inView,setInView]=useState(true);
  useEffect(()=>{
    const onVis=()=>setVisible(document.visibilityState!=='hidden');
    onVis();
    document.addEventListener('visibilitychange',onVis);
    return ()=>document.removeEventListener('visibilitychange',onVis);
  },[]);
  useEffect(()=>{
    const el=ref&&ref.current;
    if(!el||typeof IntersectionObserver==='undefined')return;
    const io=new IntersectionObserver(es=>{ if(es&&es.length)setInView(es[es.length-1].isIntersecting); },{threshold:0.01});
    io.observe(el);
    return ()=>io.disconnect();
  },[ref]);
  return visible&&inView&&!paused;
}

/* 素材未配置のときのフォールバック(§3)。
   v42素材が無い行動は、既存の assets/panda-room/v30/ の立ち絵をそのまま使う。
   ・回転や横倒しは一切しない(CSSで「寝ている風」に加工しない)
   ・v30素材は1536×1024の全面レイヤーなので、全面表示＋既存のタップ領域で描く */
function panda42AssetReady(action){return PANDA42_READY.indexOf(action)>=0;}
function panda42FallbackImg(action,temp){
  if(temp==='happy'&&pandaState30Ready('happy'))return PANDA30.happy;
  const a=PANDA42_ACTIONS[action]||PANDA42_ACTIONS.normal;
  let st=a.fallback||'normal';
  if(!pandaState30Ready(st))st='normal';
  return PANDA30[st];
}

/* 行動別のセリフ(§13)。既存の会話DB(ROOM_TALK_DB)は消さず、これと混ぜて使う。 */
const PANDA42_TALK={
  normal:[
    'よんだ〜？🐼',
    'ここでのんびりしてたよ〜',
    'なんにもしてない時間、すきだなぁ'
  ],
  window:[
    'ぼーっとする時間も大事だよ〜',
    '外、いい天気だね🐼',
    '何も考えない時間も好き〜'
  ],
  eat:[
    '一口いる？🍜',
    '運動のあとのごはん最高〜',
    'これは飯テロじゃないよ…たぶん'
  ],
  relax_floor:[
    '床と仲良くしてた〜',
    '今日はここから動かないかも',
    'ゴロゴロも立派な予定です🐼'
  ],
  workout:[
    'もう1回だけやろっかな',
    'がんばりすぎは禁止〜',
    'ちょっとだけ動いた！えらい！'
  ],
  sofa:[
    'ここ、落ち着く〜',
    '今日はゆっくりしよ',
    '座ったら動けなくなった🐼'
  ],
  /* 【v42.1】ピザの日だけのセリフ */
  pizza:[
    'ピザは別腹だよ〜🍕',
    '一枚だけのつもりだったんだけど…',
    'チーズ伸びすぎ〜！',
    '運動したからゼロカロリー…ってことで🐼'
  ],
  /* 【v42.1】夜限定レア。ねぎらいと「のんびり」だけにして、
     お酒をすすめる表現・健康効果を示唆する表現は入れない。 */
  beer:[
    '今日はおつかれさま〜🐼',
    'ぷは〜……って言ってみたかった',
    '枝豆も欲しくなってきた…',
    '今日はのんびり夜です'
  ]
};

/* 今日の小物変化(1か所だけ)。通日シードは「今日どの家具が動くか」だけを選ぶ。
   動きの種類は家具ごとにCSS側で固定(rug=呼吸 / zabuton=沈む / table=明るさ)。 */
const ROOM_TODAY_ACCENT_TARGETS=['rug','zabuton','table'];
function roomTodayAccentTarget(){return ROOM_TODAY_ACCENT_TARGETS[roomTodaySeed()%ROOM_TODAY_ACCENT_TARGETS.length];}
function roomTodayAccentClass(id){return 'accent-'+id;} // 家具idから固定クラス
function loadRoomTalkLog(){try{const a=JSON.parse(localStorage.getItem(ROOM_TALKLOG_KEY)||'[]');return Array.isArray(a)?a:[];}catch(e){return[];}}
function pushRoomTalkLog(text){try{const a=loadRoomTalkLog();a.unshift({text:String(text||''),ts:Date.now()});localStorage.setItem(ROOM_TALKLOG_KEY,JSON.stringify(a.slice(0,30)));}catch(e){}}
function loadRoomSettings(){try{const s=JSON.parse(localStorage.getItem(ROOM_SETTINGS_KEY)||'{}');return{...ROOM_SETTINGS_DEFAULT,...(s&&typeof s==='object'?s:{})};}catch(e){return{...ROOM_SETTINGS_DEFAULT};}}
function saveRoomSettings(s){try{localStorage.setItem(ROOM_SETTINGS_KEY,JSON.stringify(s));}catch(e){}}
function isRoomNightNow(){const h=new Date().getHours();return h>=18||h<6;}
// 小さな「ポン」という効果音（音声ファイル不使用・WebAudioで生成。失敗しても無視）
function playRoomPop(){
  try{
    const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;
    if(!playRoomPop._ctx)playRoomPop._ctx=new AC();
    const ctx=playRoomPop._ctx;if(ctx.state==='suspended')ctx.resume();
    const o=ctx.createOscillator(),g=ctx.createGain();
    o.type='sine';o.frequency.setValueAtTime(660,ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(330,ctx.currentTime+0.12);
    g.gain.setValueAtTime(0.05,ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+0.15);
    o.connect(g);g.connect(ctx.destination);o.start();o.stop(ctx.currentTime+0.16);
  }catch(e){}
}
/* 画像(panda_room_v3_world.png 1536x1024)内に描かれたボタンの位置。
   画像に対する%指定なので、表示サイズや横スワイプに関係なく画像と一緒に動く。 */
const ROOM_HOTSPOTS=[
  {id:'talklog', label:'会話ログ',       left:59.0, top:1.5,  width:8.6,  height:12.5},
  {id:'gift',    label:'プレゼント',     left:67.6, top:1.5,  width:7.7,  height:12.5},
  {id:'album',   label:'思い出アルバム', left:75.3, top:1.5,  width:8.0,  height:12.5},
  {id:'settings',label:'設定',           left:83.3, top:1.5,  width:6.7,  height:12.5},
  {id:'shop',    label:'ショップ',       left:91.5, top:16.0, width:8.5,  height:12.0},
  {id:'mission', label:'ミッション',     left:90.0, top:32.0, width:10.0, height:26.0},
  {id:'gohome',  label:'ホームへ',       left:88.0, top:86.0, width:12.0, height:12.0}
];
const ROOM_PANDA_SPOT={left:47,top:53,width:14,height:31};

/* 【v27新規追加】全画面ビュー/モーダルの描画先。
   ホーム画面のカードは .fade-up(アニメのtransform)の中にあり、
   その中で position:absolute/fixed を使うと基準がずれてしまう。
   そこでReactのポータルで「デバイス枠(.frame-ios/.frame-android)」直下へ描画する。
   （既存の記録シート .overlay と同じ基準に揃える） */
function roomLayerTarget(fromEl){
  try{
    const t=fromEl&&fromEl.closest&&fromEl.closest('.frame-ios,.frame-android');
    if(t)return t;
  }catch(e){}
  return document.body;
}

/* エラー時に画面全体が白くならないための保険（やさしいパンダのエラー表示） */
class RoomErrorBoundary extends React.Component{
  constructor(props){super(props);this.state={err:false};}
  static getDerivedStateFromError(){return{err:true};}
  componentDidCatch(e){try{console.error('PandaRoom error:',e);}catch(_){}}
  render(){
    if(this.state.err){
      return(
        <div className="card" style={{textAlign:'center',padding:'24px 16px'}}>
          <div style={{fontSize:36,marginBottom:8}}>🐼</div>
          <div style={{fontSize:14,fontWeight:800,color:'#1a5044',marginBottom:6}}>ごめんね〜、お部屋がちょっと休憩中みたい</div>
          <div style={{fontSize:12,color:'#7aada0',marginBottom:14}}>もう一度開いてみてね</div>
          {this.props.onExit&&<button type="button" className="room-modal-btn" onClick={this.props.onExit}>ホームへ戻る</button>}
        </div>
      );
    }
    return this.props.children;
  }
}

/* 共通モーダル（パンダルーム内メニュー用）。targetが渡されたらそこへポータル描画する */
function RoomModal({title,onClose,children,target}){
  const body=(
    <div className="room-modal-backdrop" onClick={onClose}>
      <div className="room-modal" role="dialog" aria-label={title} onClick={e=>e.stopPropagation()}>
        <div className="room-modal-head">
          <div className="room-modal-title">{title}</div>
          <button type="button" className="room-modal-close" aria-label="閉じる" onClick={onClose}>×</button>
        </div>
        <div className="room-modal-body">{children}</div>
      </div>
    </div>
  );
  if(target&&ReactDOM.createPortal)return ReactDOM.createPortal(body,target);
  return body;
}

function PandaRoom({state,setState,streak,hero,fullView,onExitRoom,entryTalk,paused}){
  const [selected,setSelected]=useState(null);
  // 【v28変更】初期セリフも状況(同日再入室=P4/テーマ/時間帯)に応じて選ぶ
  const [pandaTalk,setPandaTalk]=useState(()=>{
    try{
      const name=(state&&state.user&&state.user.name)||'あなた';
      if(Math.random()<0.5)return roomFillName(roomPick(ROOM_TALK_DB.greet.revisit),name);
      return pickRoomTalk({userId:state&&state.auth,name,todayDone:(state.reports||[]).some(r=>dk(r.ts)===tk())});
    }catch(e){return 'おなかすいた〜！ラーメン最高だよ〜！💕';}
  });
  const [talkKey,setTalkKey]=useState(0);        // 吹き出しのscaleアニメ再生用
  const [fxKey,setFxKey]=useState(0);            // パンダタップ演出の再生用
  const [modal,setModal]=useState(null);         // 開いているモーダル
  const [talkLog,setTalkLog]=useState([]);       // 会話ログ(モーダル表示用)
  const [rs,setRs]=useState(loadRoomSettings);   // ルーム設定
  const greetedRef=useRef(false);                // 入室あいさつは1回だけ
  const fxTimerRef=useRef(null);
  const cardRef=useRef(null);                    // モーダルのポータル先を探すための起点
  const [layerT,setLayerT]=useState(null);       // モーダルの描画先(デバイス枠)
  useEffect(()=>{setLayerT(roomLayerTarget(cardRef.current));},[]);
  // 【v29新規追加】現在時刻(表示チップとライティング用)。60秒ごとに更新
  const [nowT,setNowT]=useState(()=>new Date());
  useEffect(()=>{
    const t=setInterval(()=>setNowT(new Date()),60000);
    return()=>clearInterval(t);
  },[]);
  // 【v29新規追加】家具解放の演出キューと開封ハイライト
  const [unlockQueue,setUnlockQueue]=useState([]);
  const [revealId,setRevealId]=useState(null);
  // 【v41】新しく入った家具のスロットを一瞬だけ光らせる
  const [revealKey,setRevealKey]=useState(null);
  const revealTimerRef=useRef(null);
  useEffect(()=>()=>{if(revealTimerRef.current)clearTimeout(revealTimerRef.current);},[]);
  // 【v25新規追加】スマホ実機では部屋を大きく表示し、横スワイプで見わたせる（案A）。
  // 初期表示は部屋の中央（パンダのいる位置）にスクロールしておく。
  const worldRef=useRef(null);
  useEffect(()=>{
    const el=worldRef.current;
    if(!el)return;
    const center=()=>{
      const dx=(el.scrollWidth-el.clientWidth)/2;
      if(dx>0)el.scrollLeft=dx;
    };
    center();
    // 画像読み込み完了後にも中央合わせ（読み込み前はscrollWidthが確定しないため）
    const img=el.querySelector('img');
    if(img&&!img.complete){img.addEventListener('load',center,{once:true});}
  },[]);
  // 【v27新規追加】パンダの発言はここを必ず通す（吹き出しアニメ＋会話ログ保存）
  // 【v28変更】同一入室中に同じ文言を何度もログへ保存しない(表示はする)
  const spokenRef=useRef(null);
  if(!spokenRef.current)spokenRef.current=new Set();
  const speak=(text)=>{
    setPandaTalk(text);
    setTalkKey(k=>k+1);
    setSpeechOpen(true); // 【v30】発言時のみ会話ボックスを表示
    if(!spokenRef.current.has(text)){
      spokenRef.current.add(text);
      pushRoomTalkLog(text);
      recordTalkStat(state&&state.auth); // 【v30】talkTotal+1 / talkDaysは同日1回
    }
  };
  // 【v28新規追加】会話抽選に使う状況コンテキスト
  const talkCtx=()=>({
    userId:state&&state.auth,
    name:(state&&state.user&&state.user.name)||'あなた',
    todayDone:(state.reports||[]).some(r=>dk(r.ts)===tk())
  });
  // 【v28新規追加】入室あいさつ(P1〜P3)＋木の実のおすそわけを順番に話す。
  // entryTalkはHomeScreenが1日1回だけ組み立てて渡す(ルーム開閉では再発火しない)。
  // propの到着が非同期のため、到着を監視しつつrefで「1マウント1回だけ」再生する。
  const entryTimersRef=useRef([]);
  const entryDoneRef=useRef(false);
  useEffect(()=>{
    if(entryDoneRef.current)return;
    if(!entryTalk||!entryTalk.lines||!entryTalk.lines.length)return;
    entryDoneRef.current=true;
    speak(entryTalk.lines[0]);
    if(entryTalk.joy>0&&rs.motion){ // おかえりのよろこび(ハート演出を流用)
      setFxKey(Date.now());
      entryTimersRef.current.push(setTimeout(()=>setFxKey(0),950));
    }
    entryTalk.lines.slice(1).forEach((line,i)=>{
      entryTimersRef.current.push(setTimeout(()=>speak(line),2400*(i+1)));
    });
  },[entryTalk]);
  useEffect(()=>()=>{entryTimersRef.current.forEach(clearTimeout);entryTimersRef.current=[];},[]);
  // 【v27新規追加/v28変更】全画面を開いて3秒後に1回だけ、軽いあいさつ(P4)や近況を表示
  useEffect(()=>{
    if(!fullView)return;
    const t=setTimeout(()=>{
      if(greetedRef.current)return;
      greetedRef.current=true;
      if(entryTalk&&entryTalk.lines&&entryTalk.lines.length)return; // 入室あいさつ済みなら重ねない
      const c=talkCtx();
      const line=Math.random()<0.5
        ?roomFillName(roomPick(ROOM_TALK_DB.greet.revisit),c.name)
        :pickRoomTalk(c);
      speak(line);
    },3000);
    return()=>clearTimeout(t);
  },[fullView]);
  useEffect(()=>()=>{if(fxTimerRef.current)clearTimeout(fxTimerRef.current);},[]);
  // 【v30変更】家具レジストリ(room30Items)が表示条件の唯一の判定元
  const items=room30Items(state,streak);
  const memoryItems=room30Memories(state,streak); // 思い出コレクション(一覧のみ)
  const unlocked=items.filter(i=>i.ok);
  const next=items.find(i=>!i.ok&&!i.future);
  const level=roomLevelOf(unlocked.length);
  const okIds=unlocked.map(i=>i.id);
  // 【v41】スロット判定用の集合（解放済みidを { id:true } にしただけ）
  const okSet={};okIds.forEach(id=>{okSet[id]=true;});
  // 【v30新規追加】旧ID(mat/lamp/photo/ramen/pointStar/plant)の解放記録を新IDへ移行
  useEffect(()=>{migrateUnlockIds(state&&state.auth);},[]);
  // 【v30新規追加】全画面入室でroomVisits+1(1マウント1回)
  const visitBumpedRef=useRef(false);
  useEffect(()=>{
    if(fullView&&!visitBumpedRef.current){
      visitBumpedRef.current=true;
      bumpPandaStats(state&&state.auth,s=>{s.roomVisits=(s.roomVisits||0)+1;return s;});
    }
  },[fullView]);
  // 【v30新規追加】パンダの一時状態(happy/ramen)。終了後は時刻に適した状態へ自動復帰
  const [pandaTemp,setPandaTemp]=useState(null);
  const pandaTempTimerRef=useRef(null);
  const setTempState=(st,ms)=>{
    if(!rs.motion&&st==='happy'){/* 動きを減らす設定でも表情変化自体は許可 */}
    setPandaTemp(st);
    if(pandaTempTimerRef.current)clearTimeout(pandaTempTimerRef.current);
    if(ms)pandaTempTimerRef.current=setTimeout(()=>setPandaTemp(null),ms);
  };
  useEffect(()=>()=>{if(pandaTempTimerRef.current)clearTimeout(pandaTempTimerRef.current);},[]);
  /* 【v42変更】昼の一時イベント(ramenEventRef)は、生活行動 'eat' に統合した。
     ラーメン棚を解放していると eat の出現率が少し上がる(panda42PickAction の ramenOk)。 */
  const ramenOk=okIds.indexOf('ramen_shelf')>=0;
  // 【v30新規追加】レイヤー読み込み失敗の管理(その家具だけ非表示)
  const [hiddenLayers,setHiddenLayers]=useState([]);
  const hideLayer=(id)=>setHiddenLayers(h=>h.indexOf(id)<0?h.concat(id):h);
  const [baseFallback,setBaseFallback]=useState(false);
  // 【v42新規追加/v42.1変更】v42の生活立ち絵が読み込めなかったときだけ、v30立ち絵へ戻す保険。
  // READY方式で通常は404自体が出ないが、配信ミスなどでも部屋が壊れないようにする。
  // 失敗は「ファイル単位」で覚える。1枚だけ配信に失敗しても、他のポーズまでv30に落ちない。
  const [panda42Failed,setPanda42Failed]=useState({});
  // 【v42.2】端末のモーション低減設定。マウント時に1度だけ判定する(途中で変わらない前提)
  const reduceMotionRef=useRef(null);
  if(reduceMotionRef.current===null)reduceMotionRef.current=prefersReducedMotion();
  const markPanda42Failed=(src)=>setPanda42Failed(m=>m[src]?m:{...m,[src]:1});
  // 窓夜景の公式素材が読み込めたか(失敗したらCSS窓マスクへフォールバック)。
  const [windowImgOk,setWindowImgOk]=useState(true);
  // 【v41.2fix】一度読み込みに失敗すると windowImgOk が false のまま固定され、
  // 時間帯が変わっても夜景が出なくなるため、srcが変わったら必ず true へ戻す。
  const winSrcKey=windowNightSrcFor(roomDisplayBand(roomHourOverride()).id)||'';
  useEffect(()=>{setWindowImgOk(true);},[winSrcKey]);

  // 【v30新規追加】会話ボックスの開閉(発言時のみ表示)
  const [speechOpen,setSpeechOpen]=useState(false);
  // 【v30-polish/B1】初回入室のみ、パンダに一度だけ控えめなハイライト(視線誘導)
  const [pandaIntro,setPandaIntro]=useState(false);
  useEffect(()=>{
    const t=setTimeout(()=>setPandaIntro(true),400);
    const t2=setTimeout(()=>setPandaIntro(false),2400); // 約2秒で自然に終了(1回のみ)
    return()=>{clearTimeout(t);clearTimeout(t2);};
  },[]);
  // 【今日のひとり言】入室後だけ静かに表示→フェードアウト。常時表示にはしない。
  //   保存キーは増やさない(開くたびに出てよい)。会話ボックスが開いたら即座に隠す。
  // 【今日の独り言の表示範囲】
  //  ・ホーム内のパンダルーム(hero)…今日の独り言を約4秒表示。
  //  ・全画面パンダルーム(fullView)…既存の入室あいさつ(speak)を優先し、独り言は出さない。
  //    (fullViewでは entryTalk による自動あいさつが動くため、重複・早期消失を避ける)
  const [monologueOn,setMonologueOn]=useState(false);
  useEffect(()=>{
    if(fullView)return; // 全画面では独り言を起動しない(入室あいさつ優先)
    const tin=setTimeout(()=>setMonologueOn(true),700);   // 入室して少し落ち着いてから
    const tout=setTimeout(()=>setMonologueOn(false),4700); // 約4秒表示してフェードアウト
    return()=>{clearTimeout(tin);clearTimeout(tout);};
  },[fullView]);
  // 次の解放候補1〜2点をアイドル時にプリロード(バイブル§9.6)
  useEffect(()=>{
    const t=setTimeout(()=>{
      try{
        /* 【v42修正】v30フォルダに実体がある素材だけを先読みする。
           以前は素材の無い家具(room30_croc_plush.webp 等・実体はv41側のr41_*.webp)まで
           先読みしていたため、部屋を開くたびに404が2件出ていた。表示には影響しないが、
           「404を出さない」方針にそろえるためガードを1つ足す(挙動は変えていない)。 */
        items.filter(i=>!i.ok&&!i.future&&roomFurnVisible(i.id)&&room30HasAsset(i.id)).slice(0,2).forEach(i=>{
          const im=new Image(); im.src=ROOM30_DIR+i.src;
        });
      }catch(e){}
    },3000);
    return()=>clearTimeout(t);
  },[okIds.join(',')]);
  // 【v29新規追加】解放の記録。
  // ・初回(キー未作成)は現時点の解放分をまとめて記録し、演出は出さない(連発防止)
  // ・以降は「新しくokになった家具」だけをeverOkへ追記し、未演出なら演出キューへ
  useEffect(()=>{
    try{
      const uid=state&&state.auth;
      let memo=loadRoomUnlockMemo(uid);
      if(!memo){
        saveRoomUnlockMemo(uid,{seen:okIds.slice(),everOk:okIds.slice()});
        return;
      }
      let changed=false;
      for(const id of okIds){
        if(memo.everOk.indexOf(id)<0){memo.everOk.push(id);changed=true;}
      }
      // 【v39修正】実際に部屋へ描画できる家具だけ通知する（通知だけ出て部屋が変わらない状態を防ぐ）
      const newly=okIds.filter(id=>memo.seen.indexOf(id)<0&&roomFurnVisible(id));
      if(changed)saveRoomUnlockMemo(uid,memo);
      if(newly.length){
        setUnlockQueue(q=>{
          const add=newly.filter(id=>q.indexOf(id)<0);
          return add.length?q.concat(add):q;
        });
      }
    }catch(e){}
  },[okIds.join(',')]);
  // 演出モーダルを閉じたとき: seenに記録し、包みが開くハイライトを表示
  const closeUnlockModal=()=>{
    const id=unlockQueue[0];
    try{
      const uid=state&&state.auth;
      const memo=loadRoomUnlockMemo(uid)||{seen:[],everOk:okIds.slice()};
      if(memo.seen.indexOf(id)<0){memo.seen.push(id);saveRoomUnlockMemo(uid,memo);}
    }catch(e){}
    setUnlockQueue(q=>q.slice(1));
    setTempState('happy',1600); // 【v30】家具解放の喜ぶは1.6秒(バイブル§7.3-1)
    if(rs.motion){
      setRevealId(id);
      // 【v41】その家具が入るスロットを1秒だけ光らせる（交換で姿が変わる家具にも対応）
      const sl=ROOM41_SLOTS.find(s=>s.pick.some(p=>p.need.indexOf(id)>=0));
      setRevealKey(sl?sl.slot:null);
      if(revealTimerRef.current)clearTimeout(revealTimerRef.current);
      revealTimerRef.current=setTimeout(()=>{setRevealId(null);setRevealKey(null);},1000);
    }
  };
  // 【v29新規追加】表示用の時間帯・季節・ライティング
  // 【v30-polish/A3】開発時の時刻上書き: URLに ?hour=0〜23 があればその時刻で
  //   時間帯ライティングを確認できる(本番UIには何も表示しない・会話等の実ロジックは実時刻のまま)。
  const hourOverride=roomHourOverride();
  /* 【v42修正】roomHourOverride() は ?hour= が無いとき undefined を返すが、
     以前の判定が (!==null) だったため、通常時に effHour が undefined になり
     時刻チップが「undefined:00」と表示されていた。判定を hasHour に統一して直す。 */
  const hasHour=(hourOverride!==null&&hourOverride!==undefined);
  const effHour=hasHour?hourOverride:nowT.getHours();
  const band=roomDisplayBand(effHour);
  const season=roomSeasonInfo(nowT);
  const lightBg=roomLightStyle(band.id,rs);
  /* ═══ 【v42新規追加】パンジローの生活状態 ═══
     ・時間帯(band.id)＋家具の解放状態＋当日の運動記録から決定的に選ぶ
     ・同じ時間ブロック(既定60分)の間は、開き直しても同じ行動のまま
     ・?action=... があれば開発用に強制表示(本番UIには何も出さない) */
  const exercisedToday=(state.reports||[]).some(r=>dk(r.ts)===tk());
  const actionOverride=roomActionOverride();
  const livingAction=actionOverride||panda42PickAction({
    bandId:band.id, okSet, userId:state&&state.auth,
    now:hasHour?new Date(nowT.getFullYear(),nowT.getMonth(),nowT.getDate(),effHour,nowT.getMinutes()):nowT,
    exercisedToday, ramenOk
  });
  /* 【v42.1】生活状態(6つ)から、実際に表示するポーズ(8つ)を決める。
     eat → ラーメン / ピザ、夜の sofa・eat → まれにビール。
     ?variant=ramen|pizza|beer があれば開発用にそれを強制表示する。 */
  const variantOverride=roomVariantOverride();
  const livingPose=variantOverride||panda42PickPose({
    action:livingAction, bandId:band.id, userId:state&&state.auth,
    now:hasHour?new Date(nowT.getFullYear(),nowT.getMonth(),nowT.getDate(),effHour,nowT.getMinutes()):nowT
  });
  const actionDef=PANDA42_ACTIONS[livingPose]||PANDA42_ACTIONS.normal;
  const actionAssetOk=panda42AssetReady(livingPose);
  /* このポーズのあいだ描かない家具(素材の中に同じ家具が描かれている場合の二重表示対策)。
     素材へフォールバックしているとき(v30立ち絵)は家具を隠す理由がないので何も隠さない。 */
  const poseImgOk=actionAssetOk&&!panda42Failed[actionDef.src];
  const actionHide=poseImgOk?(actionDef.hide||[]):[];
  const isHiddenByAction=(key)=>actionHide.indexOf(key)>=0;
  /* ═══ 【v42.2】ミニアクション ═══
     基本は静止。8〜30秒に1回だけ短い仕草をして、また静止へ戻る。
     タイマーを動かすのは、次のすべてを満たすときだけ:
       ・部屋の絵が v42素材で出ている(poseImgOk)
       ・アプリの「動きを減らす」設定がオフ(rs.motion)
       ・端末の prefers-reduced-motion が reduce でない
       ・パンダルームが実際に画面に出ている(タブ表示中・画面内・全画面に隠れていない) */
  const roomOnScreen=useRoomOnScreen(cardRef,!!paused);
  const miniFast=roomMiniFast();                       // ?mini=1（開発用）
  const miniEnabled=!!(poseImgOk&&rs.motion&&!reduceMotionRef.current&&roomOnScreen);
  const {mini:miniAct,interrupt:interruptMini}=usePanjiroMiniAction({
    pose:livingPose, enabled:miniEnabled, fast:miniFast
  });
  const lampOk=okIds.indexOf('lamp')>=0;
  const clockText=hasHour
    ? `${effHour}:00`
    : `${nowT.getHours()}:${String(nowT.getMinutes()).padStart(2,'0')}`;
  // 【v28変更】固定プールをやめ、テーマ/時間帯/状態/汎用の重み抽選に。
  // (旧talkPoolの文言はROOM_TALK_DB.genericへ移動し、名前も{name}で置換されるよう修正)
  // 【v29新規追加】深夜(23時〜4時)は眠そうな会話を優先する
  const pickTalkForNow=(c)=>{
    const b=roomDisplayBand(new Date().getHours());
    if(b.id==='deepnight'&&Math.random()<0.5){
      return roomFillName(roomPick(ROOM_TALK_DB.time.night),c.name);
    }
    return pickRoomTalk(c);
  };
  const chooseTalk=()=>{
    const c=talkCtx();
    let line=pickTalkForNow(c);
    if(line===pandaTalk)line=pickTalkForNow(c); // 直前と同じなら1回だけ引き直す
    speak(line);
  };
  // 【v27新規追加】パンダ本体をタップした時の演出＋会話
  const onPandaTap=(e)=>{
    e.stopPropagation(); // 背景の会話変更と二重発火しないように
    trackEvent('panda_tap');
    /* 【v42.2】自動ミニアクションとタップリアクションが重なったら、タップを優先する。
       進行中の仕草をその場で止め、次の間隔から仕切り直す(タイマーは増やさない)。 */
    interruptMini();
    setTempState('happy',1200); // 【v30】タップで喜ぶ→1.2秒後に時刻状態へ復帰
    bumpPandaStats(state&&state.auth,s=>{s.tapTotal=(s.tapTotal||0)+1;return s;});
    const c=talkCtx();
    /* 【v42変更】いま何をしていたか(生活状態)に応じた専用セリフを混ぜる。
       既存の会話DB(ROOM_TALK_DB)は削除していない。
         行動別セリフ 40% / なでなで反応 30% / 状況にあわせた会話 30% */
    const r=Math.random();
    const actLines=PANDA42_TALK[livingPose]||PANDA42_TALK[livingAction]||PANDA42_TALK.normal;
    const line=(r<0.40)?roomFillName(roomPick(actLines),c.name)
              :(r<0.70)?roomFillName(roomPick(ROOM_TALK_DB.tap),c.name)
              :pickTalkForNow(c);
    speak(line);
    if(rs.sound)playRoomPop();
    if(rs.motion){
      setFxKey(Date.now());
      if(fxTimerRef.current)clearTimeout(fxTimerRef.current);
      fxTimerRef.current=setTimeout(()=>setFxKey(0),950);
    }
  };
  // 【v27新規追加】画像内メニューのタップ処理
  const onHotspot=(e,id)=>{
    e.stopPropagation(); // 背景の会話変更と二重発火しないように
    if(id==='talklog'){setTalkLog(loadRoomTalkLog());setModal('talklog');return;}
    if(id==='album'){setModal('album');return;}
    if(id==='settings'){setModal('settings');return;}
    if(id==='mission'){setModal('mission');return;}
    if(id==='items'){setModal('items');return;} // 【v30新規追加】家具一覧
    if(id==='gift'||id==='shop'){setModal(id);return;} // 準備中モーダル
    if(id==='gohome'){
      if(onExitRoom){onExitRoom();}
      else{speak('ここがホームだよ〜、ゆっくりしてね🐼');}
      return;
    }
  };
  const updateRs=(patch)=>{const nx={...rs,...patch};setRs(nx);saveRoomSettings(nx);};
  /* 【v29変更】旧nightOn(18時判定)は時間帯バンド方式(roomDisplayBand+roomLightStyle)へ統合 */
  const activeItems=[
    {key:'sofa',icon:'🛋️',name:'ソファ',desc:'くつろぎの場所。今日はここで一息つこう〜'},
    {key:'ramen',icon:'🍜',name:'ラーメン棚',desc:'飯テロの証！今日もおいしそう〜'},
    {key:'plant',icon:'🪴',name:'観葉植物',desc:'みんなの応援ですくすく成長中♪'},
    {key:'neon',icon:'💗',name:'ネオン看板',desc:'ゆるトレ倶楽部のシンボルだよ！'},
    {key:'bed',icon:'🛏️',name:'ベッド',desc:'夜はここでゆっくり休もう〜'}
  ];
  const pickItem=(it)=>{setSelected(it);speak(`${it.icon} ${it.name}：${it.desc}`)};
  // 思い出アルバム用：既存の運動記録(写真/メモ)とタイムカプセルをまとめる（保存構造は変更しない）
  const memories=(state.reports||[]).filter(r=>r.photo||r.note).slice(-20).reverse();
  const capsules=(state.timeCapsules||[]);
  const dailyMission=daily365Mission();
  const dailyMissionDone=missionDoneToday(state);
  const missionTotalCount=missionCount(state);
  const completeMissionFromRoom=()=>{
    if(dailyMissionDone||!setState)return;
    trackEvent('mission_completed'); // 【v28新規追加】計測
    const key=missionDayKey();
    setState(s=>({
      ...s,
      completedMissions:{...(s.completedMissions||{}),[key]:{...dailyMission,ts:Date.now()}},
      missionHistory:[...(s.missionHistory||[]),{...dailyMission,dayKey:key,ts:Date.now()}],
      pandaPoints:(s.pandaPoints||0)+(dailyMission.points||5)
    }));
    speak('ミッション達成！えらいえらい〜🐼✨');
    if(rs.sound)playRoomPop();
  };
  return(
    <div ref={cardRef} className={`card panda-room-card room-v3-card${(hero||fullView)?' room-v3-hero':''}`}>
      <div className="room-v3-head">
        <div>
          <div className="room-v3-title">🏠 パンダルーム <span>🌿</span></div>
          {/* 【v26変更】hero/全画面モードでは説明文を省略して部屋を主役に */}
          {!(hero||fullView)&&<div className="room-v3-sub">パンダのくつろぎ空間。タップするとお話できるよ</div>}
        </div>
        <div className="room-v3-level">Lv.{level}<small>{unlocked.length}/{items.length}</small></div>
      </div>

      <div className="room-v3-world" ref={worldRef} onClick={chooseTalk}>
        {/* 【v30変更】家具なし背景+解放済み透過レイヤー方式(バイブル§9.4)。
            背景imgが通常フローでステージの大きさを決め、各レイヤーはinset:0で完全に追従する。
            未解放家具はimgタグ自体を生成しない。読み込み失敗はその家具のみ非表示。 */}
        <div className={`room-v3-stage room-v30-stage${(band.id==='night'||band.id==='deepnight')?' is-night':''}`}>
          {/* z0: 背景 */}
          <img src={baseFallback?'panda_room_v3_world.png':(ROOM30_DIR+ROOM30_BASE)}
            className="room-base-img" alt="パンダルーム"
            onError={e=>{if(!baseFallback)setBaseFallback(true);}}/>
          {/* z1: 窓夜景レイヤー(公式素材が来たら表示)。night/deepnightのみ。
              素材が無い/読み込み失敗のときは img を作らず、③CSS窓マスクへフォールバック。
              バイブル§9.5どおり他レイヤーと同じ inset:0 / 全面透過で重ねる。 */}
          {/* 【v41.2fix】窓の外＝外の世界なので、室内の明るさ設定(rs.night)とは切り離す。
              以前は lightBg(=室内ライティング)が無いと夜景が出ない条件になっていて、
              「常に明るい」設定のときに窓だけ昼のまま残るケースがあった。 */}
          {!baseFallback&&(band.id==='night'||band.id==='deepnight'||band.id==='evening')&&windowNightSrcFor(band.id)&&windowImgOk&&(
            <img src={ROOM30_DIR+windowNightSrcFor(band.id)+ROOM_WINDOW_VER} alt="" className="room-layer room-window-night"
              onError={e=>{try{console.warn('[panda-room] 窓の夜景素材を読み込めませんでした:',e&&e.currentTarget&&e.currentTarget.src);}catch(_){}setWindowImgOk(false);}}/>
          )}
          {/* z1.5: CSS窓マスク(公式窓夜景が無い/失敗のときだけ)。窓ガラス内だけ紺に沈める。
              公式素材が正常表示のときは重ねない(二重に暗くしない)。 */}
          {!baseFallback&&lightBg&&lightBg.windowMask&&!(windowNightSrcFor(band.id)&&windowImgOk)&&(
            <div className="room-window-mask" aria-hidden="true"
              style={{background:lightBg.windowMask.background,mixBlendMode:lightBg.windowMask.mix}}/>
          )}
          {/* z2: 家具レイヤー。今日の小物(1か所)にだけ微細なゆらぎクラスを日替わりで付ける。 */}
          {!baseFallback&&items.filter(i=>i.ok&&room30HasAsset(i.id)&&hiddenLayers.indexOf(i.id)<0&&!isHiddenByAction(i.id))
            .slice().sort((a,b)=>(a.z||10)-(b.z||10))
            .map(it=>(
              <img key={it.id} src={ROOM30_DIR+it.src} alt=""
                className={'room-layer'+(revealId===it.id&&rs.motion?' fur-appear':'')+((rs.motion&&it.id===roomTodayAccentTarget())?' '+roomTodayAccentClass(it.id):'')}
                onError={()=>hideLayer(it.id)}/>
          ))}
          {/* 【v39新規追加】獲得した家具を、家具ごとの固定位置に実際に描画する。
              ここが無かったため「通知は出るのに部屋が変わらない」状態になっていた。 */}
          {!baseFallback&&(
            /* 【v41】家具は1つのレイヤー(z-index:2)にまとめる。中の重ね順は z のとおり。
               容器が重ね合わせコンテキストを作るので、パンダ(z-index:4)より前には出ない。 */
            <div className="room-furn41-layer" aria-hidden="true">
              {room41Layers(okSet).filter(f=>hiddenLayers.indexOf(f.key)<0&&!isHiddenByAction(f.key)).map(f=>(
                <img key={f.key} src={ROOM41_DIR+f.src} alt=""
                  className={'room-furn41'+(f.key==='lampglow'?' glow':'')+(revealKey===f.key&&rs.motion?' fur-appear':'')}
                  style={{left:f.l+'%',top:f.t+'%',width:f.w+'%',zIndex:f.z}}
                  onError={()=>hideLayer(f.key)}/>
              ))}
            </div>
          )}
          {/* z3: 部屋全体の夜色/光(家具の上・パンダの下)。パンダには直接被せない。 */}
          {!baseFallback&&lightBg&&lightBg.roomOverlay&&(
            <div className="room-night-overlay" aria-hidden="true"
              style={{background:lightBg.roomOverlay.background,mixBlendMode:lightBg.roomOverlay.mix}}/>
          )}
          {/* パンダ本体レイヤー(状態で切替。読み込み失敗はnormalへ)。
              【B1視線誘導】rs.motion時はごく小さな待機呼吸。初回入室のみ1度だけ
              控えめなハイライト(intro-breathe)で「主役=パンダ」をそっと示す。 */}
          {/* z4: パンダ本体。夜は roomOverlay を被せず、代わりに顔の白を守るため
              night時のみごく弱い明度調整クラス(room-panda-night)を付ける(青黒くしない)。 */}
          {/* z4: パンダ本体。アニメーション競合を避けるため3層ラッパーに分離。
              外=しぐさ(rotate/translate) / 中=初回演出(drop-shadow) / 内=呼吸(scale)+まばたき&夜間補正(filter)。
              rs.motion=false のときは動きを付けず、夜間補正だけ静的に当てる。 */}
          {/* 【v42変更】常時ゆれる待機アニメーション(pose-sway等)は廃止。
              いまの生活状態(livingAction)にあわせて、絵・位置・ごく小さな動きを切り替える。
              v42素材が未配置の行動は、既存のv30立ち絵を全面レイヤーのまま表示する
              (回転・横倒しなどの加工は一切しない)。 */}
          {!baseFallback&&(()=>{
            const isNight=(band.id==='night'||band.id==='deepnight')&&!!lightBg;
            const midCls='room-panda-mid'+(pandaIntro&&rs.motion?' anim-intro':'');
            const nightCls=(isNight?(rs.motion?' is-night':' is-night-static'):'');
            // ── ① v42素材あり: 行動ごとの位置に、切り出した立ち絵を置く ──
            if(poseImgOk){
              /* 【v42.2】常時ループのアニメーションは廃止。基本は class なし＝完全に静止。
                 ミニアクション中だけ、1回再生のクラスが短時間ついて、また外れる。
                 タップ反応(mini-tap)は自動ミニアクションより優先する(同時に付けない)。 */
              const tapping=!!(fxKey&&rs.motion);
              const bodyCls=tapping?'mini-tap':((miniAct&&miniAct.cls&&miniAct.cls!=='mini-blink')?miniAct.cls:'');
              const blinking=!tapping&&!!(miniAct&&miniAct.cls==='mini-blink');
              const wrapCls='room-panda42-wrap'+(bodyCls?' '+bodyCls:'');
              const imgCls='room-panda42-img'+(blinking?' mini-blink':'')+nightCls;
              const fx=(!tapping&&miniAct&&miniAct.fx)?miniAct:null;
              return (
                <div className={wrapCls} aria-hidden="true"
                  style={{left:actionDef.left+'%',top:actionDef.top+'%',width:actionDef.width+'%',height:actionDef.height+'%',zIndex:actionDef.zIndex||4}}>
                  <div className={midCls} style={{position:'absolute',inset:0}}>
                    <img src={PANDA42_DIR+actionDef.src} className={imgCls} alt=""
                      onError={e=>markPanda42Failed(actionDef.src)}/>
                  </div>
                  {/* 一瞬だけ出る小さな文字(ズズ… / 💦 / Z z など)。毎回は出さない。
                      JS側のタイマーで必ず消すので、画面に残り続けることはない。 */}
                  {fx&&(
                    <span className={'pj-mini-fx'+(fx.fxSlow?' slow':'')+(fx.fxEmoji?' emo':'')} aria-hidden="true"
                      style={{left:((fx.fxAt&&fx.fxAt.left)||60)+'%',top:((fx.fxAt&&fx.fxAt.top)||0)+'%'}}>{fx.fx}</span>
                  )}
                </div>
              );
            }
            // ── ② 素材未配置(または読み込み失敗): 既存v30立ち絵へ安全にフォールバック ──
            const imgCls='room-layer room-panda-img'
              +(rs.motion?' anim-blink':'')
              +(rs.motion&&isNight?' is-night':'')
              +(!rs.motion&&isNight?' is-night-static':'');
            return (
              <div className="room-panda-wrap" aria-hidden="true">
                <div className={midCls}>
                  <img src={ROOM30_DIR+panda42FallbackImg(livingPose,pandaTemp)}
                    className={imgCls} alt=""
                    onError={e=>{const el=e.currentTarget;if(!el.dataset.fb){el.dataset.fb='1';el.src=ROOM30_DIR+PANDA30.normal;}else{el.style.display='none';}}}/>
                </div>
              </div>
            );
          })()}
          {/* 【v42・§9】将来のソファ前面など「パンダより手前に描く家具パーツ」の受け皿。
              ROOM42_FRONT_LAYERS が空のあいだは何も描画しない(既存レイヤー構造は無変更)。 */}
          {!baseFallback&&ROOM42_FRONT_LAYERS.length>0&&(
            <div className="room-furn42-front" aria-hidden="true">
              {ROOM42_FRONT_LAYERS.filter(f=>hiddenLayers.indexOf(f.key)<0).map(f=>(
                <img key={'fr-'+f.key} src={ROOM41_DIR+f.src} alt="" className="room-furn41"
                  style={{left:f.l+'%',top:f.t+'%',width:f.w+'%',zIndex:f.z||1}}
                  onError={()=>hideLayer(f.key)}/>
              ))}
            </div>
          )}
          {/* z5: パンダ周辺のごく弱い暖色(顔の白を殺さず室内の温かみと一体化)。夜のみ。 */}
          {!baseFallback&&lightBg&&lightBg.warmTop&&(
            <div className="room-warm-top" aria-hidden="true"
              style={{background:lightBg.warmTop.background,mixBlendMode:lightBg.warmTop.mix}}/>
          )}
          {/* 解放済み家具のタップ(名前+入手理由を会話ボックスへ)。未解放にはホットスポットを作らない */}
          {room41Layers(okSet).filter(f=>f.key!=='lampglow'&&hiddenLayers.indexOf(f.key)<0&&!isHiddenByAction(f.key)).map(f=>{
            const iid=room41SlotItemId(f.key,okSet);
            const it=items.find(x=>x.id===iid)||{name:'',memory:'',icon:'🐼'};
            const hh=(ROOM41_SLOTS.find(s=>s.slot===f.key)||{}).pick;
            const ph=(hh&&hh.find(p=>p.src===f.src))||{h:8};
            return (
            <button key={'hs-'+f.key} type="button" className="room-hotspot furn-hotspot" aria-label={it.name}
              style={{left:f.l+'%',top:f.t+'%',width:f.w+'%',height:ph.h+'%'}}
              onClick={e=>{e.stopPropagation();speak(`${it.icon} ${it.name}：${it.memory}`);}}/>
          );})}
          {/* パンダのタップボタン(従来どおり・演出つき)。
              【v42変更】パンジローがどこにいてもタップできるよう、
              いまの生活状態の tap 領域へ一緒に移動させる。
              v42素材が無い(=v30立ち絵を全面表示している)ときは、従来の
              ROOM_PANDA_SPOT をそのまま使う(絵と領域がずれないようにするため)。 */}
          <button type="button" className="room-hotspot room-panda-btn" aria-label="パンジローに声をかける"
            style={poseImgOk
              ?{left:actionDef.tapLeft+'%',top:actionDef.tapTop+'%',width:actionDef.tapWidth+'%',height:actionDef.tapHeight+'%'}
              :{left:ROOM_PANDA_SPOT.left+'%',top:ROOM_PANDA_SPOT.top+'%',width:ROOM_PANDA_SPOT.width+'%',height:ROOM_PANDA_SPOT.height+'%'}}
            onClick={onPandaTap}>
            {fxKey&&rs.motion?<span className="panda-tap-fx" aria-hidden="true">{['💕','🎵','✨'].map((ic,i)=><i key={i} className="panda-float" style={{left:`${18+i*22}%`,animationDelay:`${i*0.09}s`}}>{ic}</i>)}</span>:null}
          </button>
          {/* z5: 天井照明の基本照明(floorlamp未解放でも夜だけ点く・背景の天井ライト由来)。
              派手な発光や大きな光輪は作らない。上部中央からのごく淡い暖色のみ。
              「外は暗いが室内は安心できる」を最低限つくる。 */}
          {!baseFallback&&lightBg&&(band.id==='night'||band.id==='deepnight')&&(
            <div className="room-ceiling-glow" aria-hidden="true"/>
          )}
          {/* フロアランプの発光(解放済み+読み込み成功+夜/深夜のみ・こちらは追加の点光源) */}
          {okIds.indexOf('floorlamp')>=0&&roomFurnVisible('floorlamp')&&hiddenLayers.indexOf('floorlamp')<0&&!isHiddenByAction('floorlamp')&&lightBg&&(band.id==='night'||band.id==='deepnight')&&(
            <div className="room-lamp-glow" aria-hidden="true"
              style={{left:'70%',top:'36%',width:'14%',height:'26%'}}/>
          )}
          {/* 今日のひとり言(パンジロー本人の独り言)。入室後4秒だけ静かに出てフェードアウト。
              会話ボックスが開いたら隠す。保存キーは増やさない(開くたびに出てよい)。 */}
          {!baseFallback&&!fullView&&monologueOn&&!speechOpen&&(
            <div className="room-today-monologue" aria-live="off">{roomTodayMonologue(band.id)}</div>
          )}
          {/* 時刻・季節チップ(小さく・部屋を隠さない) */}
          <div className="room-status-chip" aria-label={`いまは${band.label} ${clockText}、季節は${season.label}`}>
            <span>{band.icon} {band.label} {clockText}</span>
            <span className="rsc-season">{season.icon} {season.label} {season.dateText}</span>
          </div>
        </div>
      </div>
      {/* 【v41.2fix】自己診断表示。URLに ?debug=1 を付けたときだけ出る（通常は一切表示されない）。
          実機で「夜にならない」ときは、どの値が想定と違うかをここで確認できる。 */}
      {roomDebugOn()&&(
        <div className="room-debug">
          {`hour: ${effHour} / band: ${band.id}\nwindow: ${windowNightSrcFor(band.id)||'(なし)'}\nwindowImgOk: ${windowImgOk} / baseFallback: ${baseFallback} / night: ${rs.night}\naction: ${livingAction}${actionOverride?' (?action=強制)':''}\npose: ${livingPose}${variantOverride?' (?variant=強制)':''} / hide: ${actionHide.join(',')||'(なし)'}\nmini: ${miniEnabled?(miniAct?miniAct.id+(miniAct.fx?' +'+miniAct.fx:''):'静止中'):'停止(motion/画面外)'}${miniFast?' [?mini=1]':''}\nasset42: ${actionAssetOk?(poseImgOk?'あり':'読込失敗→v30'):'未配置→v30'} / 当日運動: ${exercisedToday?'あり':'なし'}\nsofa: ${okSet.sofa?'解放':'未解放'} / dumbbell: ${okSet.dumbbell?'解放':'未解放'} / ramen_shelf: ${ramenOk?'解放':'未解放'}`}
        </div>
      )}
      {/* 【v25新規追加】スマホ実機のみCSSで表示される横スワイプの案内 */}
      <div className="room-v3-swipe-hint">← 左右にスワイプしてお部屋を見わたせるよ →</div>

      {/* 【v30新規追加】今日のゆるミッションカード(常時・ステージ直下・バイブル§8.3)。
          「できた！」はstopPropagationでカード本体タップ(モーダル)と二重発火させない。
          達成はmissionDoneTodayで冪等(連打・再読み込みで二重付与なし)。 */}
      <div className="room30-mission-card" role="button" tabIndex={0} aria-label="今日のゆるミッション"
        onClick={e=>onHotspot(e,'mission')}
        onKeyDown={e=>{if(e.key==='Enter'||e.key===' ')onHotspot(e,'mission');}}>
        <div className="rm30-head">🎯 今日のゆるミッション</div>
        {dailyMissionDone?(
          <div className="rm30-done">今日はできたね🐼✨</div>
        ):(
          <div className="rm30-row">
            <div className="rm30-text">{dailyMission.title||dailyMission.text}</div>
            {setState&&<button type="button" className="rm30-btn"
              onClick={e=>{e.stopPropagation();completeMissionFromRoom();}}>できた！</button>}
          </div>
        )}
      </div>

      {/* 【v30新規追加】会話ボックス(ステージ外・発言時のみ・バイブル§8.4) */}
      {speechOpen&&(
        <div className="room30-speech" key={talkKey}>
          <span className="rs30-avatar" aria-hidden="true">🐼</span>
          <div className="rs30-body">
            <div className="rs30-name">パンジロー</div>
            <div className="room-v3-speech rs30-text">{pandaTalk}</div>
            <button type="button" className="rs30-log" onClick={e=>onHotspot(e,'talklog')}>ログを見る</button>
          </div>
          <button type="button" className="rs30-close" aria-label="会話を閉じる" onClick={()=>setSpeechOpen(false)}>×</button>
        </div>
      )}

      {/* メニュー(実HTMLボタン)。v30で🏠家具一覧を追加 */}
      <div className="room-menu-bar">
        {[
          {id:'items',icon:'🏠',label:'家具一覧'},
          {id:'talklog',icon:'💬',label:'会話ログ'},
          {id:'gift',icon:'🎁',label:'プレゼント'},
          {id:'album',icon:'📷',label:'アルバム'},
          {id:'settings',icon:'⚙️',label:'設定'},
          {id:'shop',icon:'🛒',label:'ショップ'},
          {id:'mission',icon:'🎯',label:'ミッション'}
        ].concat(fullView?[{id:'gohome',icon:'🚪',label:'ホームへ'}]:[]).map(b=>(
          <button key={b.id} type="button" className="room-menu-btn" aria-label={b.label}
            onClick={e=>onHotspot(e,b.id)}>
            <span className="rm-ic">{b.icon}</span>{b.label}
          </button>
        ))}
      </div>

      {/* 【v30変更】家具チップ・進捗・次の解放は常時表示をやめ、🏠家具一覧モーダルへ移動(部屋を大きく保つ) */}

      {/* ═══ 【v29新規追加】家具解放の演出モーダル(1家具につき1回だけ) ═══ */}
      {unlockQueue.length>0&&(()=>{
        const it=items.find(x=>x.id===unlockQueue[0]);
        if(!it)return null;
        return(
          <RoomModal target={layerT} title="🐼 部屋がちょっと育ったよ" onClose={closeUnlockModal}>
            <div style={{textAlign:'center',padding:'10px 0 4px'}}>
              <div style={{fontSize:40,marginBottom:6}} className="unlock-pop">{it.icon}</div>
              <div style={{fontWeight:900,fontSize:16,color:'#6a431f',marginBottom:2}}>{it.icon} {it.name}をゲット！</div>
              <div style={{fontWeight:800,fontSize:13,color:'#3d8f78',marginBottom:6}}>パンダルームに{it.name}が増えたよ</div>
              <div style={{fontSize:12,color:'#9b7a4b',marginBottom:4}}>{it.cond}</div>
              <div style={{fontSize:13,color:'#4a3a20'}}>{it.memory}</div>
            </div>
            <button type="button" className="room-modal-btn" onClick={closeUnlockModal}>部屋を見てみる！</button>
          </RoomModal>
        );
      })()}

      {/* ═══ 【v30新規追加】🏠家具一覧モーダル(解放済み=思い出/未解放=🔒条件/将来=これから) ═══ */}
      {modal==='items'&&(
        <RoomModal target={layerT} title="🏠 家具一覧" onClose={()=>setModal(null)}>
          <div className="room-progress room-v3-progress" style={{marginTop:0}}>
            <div><b>{unlocked.length}</b> / {items.length} 個 解放</div>
            <div className="room-progress-bar"><span style={{width:`${Math.round(unlocked.length/items.length*100)}%`}}/></div>
          </div>
          {next&&<div className="next-room-item room-v3-next">次のたのしみ：<b>{next.icon} {next.name}</b><span>{next.cond}</span></div>}
          <div className="items30-list">
            {items.map(it=>(
              <div key={it.id} className={'items30-row'+(it.ok?' ok':'')}>
                <span className="i30-ic">{it.ok?it.icon:'🔒'}</span>
                <span className="i30-name">{it.name}</span>
                <span className="i30-sub">{it.ok?it.memory:(it.future?'これから(将来のたのしみ)':it.cond)}</span>
              </div>
            ))}
          </div>
          <div style={{fontWeight:950,color:'#6a431f',margin:'12px 0 6px',fontSize:13}}>🎗️ 思い出コレクション</div>
          <div className="items30-list">
            {memoryItems.map(mm=>(
              <div key={mm.id} className={'items30-row'+(mm.ok?' ok':'')}>
                <span className="i30-ic">{mm.ok?mm.icon:'🔒'}</span>
                <span className="i30-name">{mm.name}</span>
                <span className="i30-sub">{mm.cond}</span>
              </div>
            ))}
          </div>
        </RoomModal>
      )}

      {/* ═══ 【v27新規追加】メニューから開くモーダル群 ═══ */}
      {modal==='talklog'&&(
        <RoomModal target={layerT} title="💬 会話ログ" onClose={()=>setModal(null)}>
          {talkLog.length===0&&<div style={{textAlign:'center',padding:'14px 0',color:'#9b7a4b'}}>まだ会話がないよ。<br/>パンダをタップするとお話できるよ🐼</div>}
          {talkLog.map((l,i)=>(
            <div key={i} className="room-log-row">
              <div>🐼 {l.text}</div>
              <div className="room-log-time">{fmtTs(l.ts)}</div>
            </div>
          ))}
        </RoomModal>
      )}
      {modal==='album'&&(
        <RoomModal target={layerT} title="📷 思い出アルバム" onClose={()=>setModal(null)}>
          {(memories.length===0&&capsules.length===0)?(
            <div style={{textAlign:'center',padding:'16px 0',color:'#9b7a4b'}}>まだ思い出がないよ。<br/>運動を記録すると増えていくよ🐼</div>
          ):(
            <>
              {capsules.length>0&&(
                <div className="room-log-row" style={{background:'#fff7e9'}}>
                  ⏳ タイムカプセル：{capsules.length}通<span style={{fontSize:11,color:'#9b7a4b'}}>（開封日を楽しみにね）</span>
                </div>
              )}
              {memories.map(r=>{
                const a=ACTS.find(x=>x.id===r.aid);
                return(
                  <div key={r.id} className="room-log-row" style={{display:'flex',gap:10,alignItems:'flex-start'}}>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontWeight:800}}>{a?a.icon:'🏃'} {a?a.label:'運動'}</div>
                      {r.note&&<div style={{marginTop:3}}>{r.note}</div>}
                      <div className="room-log-time">{fmtTs(r.ts)}</div>
                    </div>
                    {r.photo&&r.photo.dataUrl&&<img src={r.photo.dataUrl} alt="思い出写真" style={{width:56,height:56,objectFit:'cover',borderRadius:12,flexShrink:0}}/>}
                  </div>
                );
              })}
            </>
          )}
        </RoomModal>
      )}
      {modal==='settings'&&(
        <RoomModal target={layerT} title="⚙️ パンダルーム設定" onClose={()=>setModal(null)}>
          <div className="room-setting-row">
            <div>パンダの動き<small>タップ演出のオン／オフ</small></div>
            <button type="button" className={`pf-toggle${rs.motion?' on':''}`} aria-label={`パンダの動きを${rs.motion?'オフ':'オン'}にする`} onClick={()=>updateRs({motion:!rs.motion})}><span/></button>
          </div>
          <div className="room-setting-row">
            <div>効果音<small>タップ時の小さな音</small></div>
            <button type="button" className={`pf-toggle${rs.sound?' on':''}`} aria-label={`効果音を${rs.sound?'オフ':'オン'}にする`} onClick={()=>updateRs({sound:!rs.sound})}><span/></button>
          </div>
          <div className="room-setting-row" style={{alignItems:'flex-start'}}>
            <div>夜間モード<small>18時〜6時に部屋が夜になるよ</small></div>
            <div style={{display:'flex',gap:6}}>
              <button type="button" className={`room-night-chip${rs.night==='auto'?' sel':''}`} onClick={()=>updateRs({night:'auto'})}>自動</button>
              <button type="button" className={`room-night-chip${rs.night==='bright'?' sel':''}`} onClick={()=>updateRs({night:'bright'})}>常に明るい</button>
            </div>
          </div>
          <div style={{fontSize:11,color:'#b39a6a',marginTop:8}}>設定はこの端末に保存されるよ</div>
        </RoomModal>
      )}
      {modal==='mission'&&(
        <RoomModal target={layerT} title="🎯 今日のミッション" onClose={()=>setModal(null)}>
          <div className="room-log-row" style={{background:'#f3fff9'}}>
            <div style={{fontWeight:900,fontSize:14}}>{dailyMission.icon||'🎯'} {dailyMission.title||dailyMission.text}</div>
            {dailyMission.text&&dailyMission.title&&<div style={{marginTop:3}}>{dailyMission.text}</div>}
          </div>
          {dailyMissionDone?(
            <div style={{textAlign:'center',padding:'8px 0',color:'#3da888',fontWeight:900}}>今日は達成済み！えらい〜🐼✨</div>
          ):(
            setState?<button type="button" className="room-modal-btn" onClick={completeMissionFromRoom}>できた！（達成する）</button>
            :<div style={{textAlign:'center',padding:'8px 0',color:'#9b7a4b'}}>ホーム画面から達成できるよ🐼</div>
          )}
          <div style={{fontSize:11,color:'#9b7a4b',textAlign:'center',marginTop:8}}>いままでの達成：{missionTotalCount}回</div>
        </RoomModal>
      )}
      {(modal==='gift'||modal==='shop')&&(
        <RoomModal target={layerT} title={modal==='gift'?'🎁 プレゼント':'🛒 ショップ'} onClose={()=>setModal(null)}>
          <div style={{textAlign:'center',padding:'18px 0 8px'}}>
            <div style={{fontSize:34,marginBottom:8}}>🐼🔨</div>
            <div style={{fontWeight:900,color:'#6a431f',marginBottom:4}}>もうすぐオープンするよ🐼</div>
            <div style={{fontSize:12,color:'#9b7a4b'}}>たのしみに待っててね〜</div>
          </div>
          <button type="button" className="room-modal-btn" onClick={()=>setModal(null)}>わかった！</button>
        </RoomModal>
      )}
    </div>
  );
}

function addMonthsFromNow(months){
  const d=new Date();
  d.setMonth(d.getMonth()+months);
  d.setHours(9,0,0,0);
  return d.getTime();
}
function fmtCapsuleDate(ts){
  const d=new Date(ts);
  return `${d.getFullYear()}年${d.getMonth()+1}月${d.getDate()}日`;
}
const TIME_CAPSULE_OPTIONS=[
  {months:1,label:'1ヶ月後',icon:'🌱'},
  {months:3,label:'3ヶ月後',icon:'🌷'},
  {months:6,label:'半年後',icon:'🌸'},
  {months:12,label:'1年後',icon:'🎁'}
];
function TimeCapsuleCard({state,setState}){
  const [msg,setMsg]=useState('');
  const [months,setMonths]=useState(1);
  const [photo,setPhoto]=useState(null);
  const [photoErr,setPhotoErr]=useState('');
  const [photoLoading,setPhotoLoading]=useState(false);
  const [selected,setSelected]=useState(null);
  const fileRef=useRef(null);
  const capsules=[...(state.timeCapsules||[])].sort((a,b)=>(a.openAt||0)-(b.openAt||0));
  const now=Date.now();
  const ready=capsules.filter(c=>(c.openAt||0)<=now).sort((a,b)=>(b.openAt||0)-(a.openAt||0));
  const sealed=capsules.filter(c=>(c.openAt||0)>now).slice(0,3);
  const opt=TIME_CAPSULE_OPTIONS.find(o=>o.months===Number(months))||TIME_CAPSULE_OPTIONS[0];
  const openAt=addMonthsFromNow(Number(months));
  const pickPhoto=async(e)=>{
    const file=e.target.files&&e.target.files[0];
    if(!file)return;
    setPhotoErr('');
    setPhotoLoading(true);
    try{setPhoto(await readPhotoFile(file));}
    catch(err){setPhotoErr(err.message||'写真を読み込めなかったよ');}
    finally{setPhotoLoading(false);if(fileRef.current)fileRef.current.value='';}
  };
  const createCapsule=()=>{
    const text=msg.trim();
    if(!text){setPhotoErr('未来の自分への一言を入れてね');return;}
    const cap={id:'tc'+Date.now(),message:text,photo:photo||null,createdAt:Date.now(),openAt,delayLabel:opt.label,opened:false};
    setState(s=>({...s,timeCapsules:[...(s.timeCapsules||[]),cap]}));
    setMsg('');setPhoto(null);setPhotoErr('');
  };
  const openCapsule=(cap)=>{
    setSelected(cap);
    setState(s=>({...s,timeCapsules:(s.timeCapsules||[]).map(c=>c.id===cap.id?{...c,opened:true,openedAt:Date.now()}:c)}));
  };
  const latestReady=ready[0];
  return(
    <div className="card time-capsule-card">
      <div className="tc-head">
        <div>
          <div className="card-title" style={{marginBottom:2}}>📮 タイムカプセル</div>
          <div className="tc-sub">未来の自分へ、今日の気持ちを届けよう</div>
        </div>
        <div className="tc-count"><b>{capsules.length}</b><span>通保存</span></div>
      </div>
      {latestReady?(
        <div className={`tc-delivery ${latestReady.opened?'opened':''}`}>
          <div className="tc-envelope">✉️</div>
          <div style={{flex:1,minWidth:0}}>
            <div className="tc-delivery-title">お届けものだよ〜！</div>
            <div className="tc-delivery-text">{fmtCapsuleDate(latestReady.createdAt)}の自分から手紙が届いてる🐼</div>
          </div>
          <button className="tc-open-btn" onClick={()=>openCapsule(latestReady)}>{latestReady.opened?'もう一度読む':'開封する'}</button>
        </div>
      ):(
        <div className="tc-waiting">🐼 届く日まで、パンダが大事に預かってるよ</div>
      )}
      <div className="tc-form">
        <textarea value={msg} onChange={e=>setMsg(e.target.value)} placeholder="例：最近ちょっと疲れてるけど、1年後の自分が笑ってたら嬉しい。" maxLength={180}/>
        <div className="tc-row">
          {TIME_CAPSULE_OPTIONS.map(o=><button key={o.months} type="button" className={`tc-option ${Number(months)===o.months?'sel':''}`} onClick={()=>setMonths(o.months)}>{o.icon}<span>{o.label}</span></button>)}
        </div>
        <div className="tc-photo-actions">
          <input ref={fileRef} type="file" accept="image/*" onChange={pickPhoto} style={{display:'none'}}/>
          <button type="button" className="tc-photo-btn" onClick={()=>fileRef.current&&fileRef.current.click()} disabled={photoLoading}>{photoLoading?'読み込み中…':photo?'写真を変更':'写真も入れる'}</button>
          {photo&&<button type="button" className="tc-remove-btn" onClick={()=>setPhoto(null)}>写真を外す</button>}
          <span className="tc-open-date">開封日：{fmtCapsuleDate(openAt)}</span>
        </div>
        {photo&&<img className="tc-photo-preview" src={photo.dataUrl} alt="タイムカプセル写真"/>}
        {photoErr&&<div className="tc-error">{photoErr}</div>}
        <button className="tc-save-btn" onClick={createCapsule}>未来の自分へ保存する 📮</button>
      </div>
      <div className="tc-list">
        <div className="tc-list-title">預かり中の手紙</div>
        {sealed.length?sealed.map(c=><div key={c.id} className="tc-sealed-item"><span>🔒 {c.delayLabel}</span><b>{fmtCapsuleDate(c.openAt)} 開封</b></div>):<div className="tc-empty">まだ預かり中の手紙はないよ</div>}
      </div>
      {selected&&(
        <div className="tc-modal-back" onClick={()=>setSelected(null)}>
          <div className="tc-modal" onClick={e=>e.stopPropagation()}>
            <div className="tc-modal-envelope">💌</div>
            <div className="tc-modal-title">過去の自分から手紙が届いたよ</div>
            <div className="tc-modal-date">作成日：{fmtCapsuleDate(selected.createdAt)}</div>
            {selected.photo&&<img className="tc-modal-photo" src={selected.photo.dataUrl} alt="思い出写真"/>}
            <div className="tc-modal-message">{selected.message}</div>
            <div className="tc-modal-panda">🐼「この頃の自分、ちゃんと頑張ってたね〜」</div>
            <button className="tc-save-btn" onClick={()=>setSelected(null)}>閉じる</button>
          </div>
        </div>
      )}
    </div>
  );
}

function RewardPopup({reward,onClose}){
  return(
    <div className="overlay" onClick={onClose}>
      <div className="reward-popup" onClick={e=>e.stopPropagation()}>
        <div className="confetti">✨ 🌸 ✨ 🎁 ✨</div>
        <div className="reward-big">{reward.emoji}</div>
        <div className="reward-popup-title">ごほうび解放！</div>
        <div className="reward-popup-name">{reward.title}</div>
        <div className="reward-popup-text">{reward.label}<br/>続けた自分、ちゃんとすごいよ〜🐼</div>
        <button className="btn btn-primary" onClick={onClose}>受け取る</button>
      </div>
    </div>
  );
}

function ReportSheet({onClose,onSubmit,postMode}){
  const [aid,setAid]=useState(null);
  const [note,setNote]=useState('');
  const [photo,setPhoto]=useState(null);
  const [photoErr,setPhotoErr]=useState('');
  const [photoLoading,setPhotoLoading]=useState(false);
  const fileRef=useRef(null);
  const pickPhoto=async(e)=>{
    const file=e.target.files&&e.target.files[0];
    if(!file)return;
    setPhotoErr('');
    setPhotoLoading(true);
    try{
      const data=await readPhotoFile(file);
      setPhoto(data);
    }catch(err){
      setPhotoErr(err.message||'写真を読み込めなかったよ');
    }finally{
      setPhotoLoading(false);
      if(fileRef.current)fileRef.current.value='';
    }
  };
  return(
    <div className="sheet" onClick={e=>e.stopPropagation()}>
      <div className="grab"/>
      <div style={{display:'flex',alignItems:'center',gap:9,marginBottom:14}}>
        <button onClick={onClose} style={{color:'#a0b8b0',fontSize:22,background:'none',border:'none',cursor:'pointer',lineHeight:1,padding:0}}>‹</button>
        <div style={{fontSize:16,fontWeight:800,color:'#1a4038'}}>{postMode?'記録してタイムラインへ投稿':'今日どんな運動した？'}</div>
      </div>
      <div style={{fontSize:12,color:'#7aada0',marginBottom:2}}>{postMode?'記録と同時にみんなに共有されるよ':'ちょっとでもOK。写真も一緒に残せるよ'}</div>
      <div className="act-grid">
        {ACTS.map(a=>(
          <button key={a.id} className={`act-btn${aid===a.id?' sel':''}`} onClick={()=>setAid(a.id)}>
            <span className="act-icon">{a.icon}</span>
            <span className="act-lbl">{a.label}</span>
          </button>
        ))}
      </div>
      <div className="photo-picker-box">
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:10,marginBottom:8}}>
          <div>
            <div className="lbl" style={{marginBottom:2}}>写真（任意）</div>
            <div style={{fontSize:11,color:'#8ab0a8',lineHeight:1.5}}>ジム・散歩道・ラーメンも思い出に残せるよ</div>
          </div>
          <button type="button" className="mini-btn" onClick={()=>fileRef.current&&fileRef.current.click()}>{photo?'写真を変更':'写真を追加'}</button>
        </div>
        <input ref={fileRef} type="file" accept="image/*" onChange={pickPhoto} style={{display:'none'}}/>
        {photoLoading&&<div className="photo-loading">写真を小さくして保存準備中…🐼</div>}
        {photoErr&&<div className="photo-error">{photoErr}</div>}
        {photo&&(
          <div className="photo-preview-wrap">
            <img src={photo.dataUrl} className="photo-preview" alt="選択した写真"/>
            <button type="button" className="photo-remove" onClick={()=>setPhoto(null)}>×</button>
            <div className="photo-caption">この写真が記録と思い出アルバムに残るよ</div>
          </div>
        )}
      </div>
      <div style={{marginBottom:14}}>
        <label className="lbl">ひとことメモ（任意）</label>
        <textarea className="field" placeholder="「今日もよく動いた！」など気軽に" value={note} onChange={e=>setNote(e.target.value)} maxLength={140}/>
      </div>
      <button className="btn btn-primary" disabled={!aid||photoLoading} onClick={()=>onSubmit({aid,note:note.trim(),photo})}>{postMode?'記録して投稿する ✨':'報告する ✓'}</button>
      <button className="btn-ghost" onClick={onClose}>やめる</button>
    </div>
  );
}

/* 【v38全面刷新】記録直後のごほうび画面。
   フェーズ: 0=軽いフラッシュ → 1=パンジロー登場 → 2=リアクション → 3=褒めメッセージ＋導線
   ・画面のどこをタップしても最後まで飛ばせる（タップでスキップ）
   ・既存の「タイムラインに投稿する」「ホームへ戻る」導線はそのまま維持 */
function PraiseScreen({praise,state,onHome,onTL,onRoom}){
  const act=ACTS.find(a=>a.id===praise.aid);
  const rx=praise.reaction||{id:'jump',anim:'jump',pose:'happy',tag:'ゆるトレ',lines:['やったーーー！！🐼']};
  const [phase,setPhase]=useState(0);
  const [imgStep,setImgStep]=useState(0); // 0=指定ポーズ 1=normalへ 2=絵文字へ
  const timersRef=useRef([]);
  useEffect(()=>{
    let reduce=false;
    try{reduce=!!(window.matchMedia&&window.matchMedia('(prefers-reduced-motion:reduce)').matches);}catch(e){}
    if(reduce){setPhase(3);return;}
    const t=[
      setTimeout(()=>setPhase(1),260),   // 登場 0.26秒
      setTimeout(()=>setPhase(2),760),   // リアクション（約1.7秒／全アニメがこの中で必ず動き終わる）
      setTimeout(()=>setPhase(3),2460)   // メッセージ（以降パンジローは静止）
    ];
    timersRef.current=t;
    return()=>t.forEach(clearTimeout);
  },[]);
  const skip=()=>{timersRef.current.forEach(clearTimeout);setPhase(3);};

  const poseSrc=PJ38[rx.pose]||PJ38.happy;
  // メッセージ表示(phase 3)に入ったらアニメーションを外し、静かに落ち着かせる
  const settled=phase>=3;
  const animCls=settled?'settled':(phase===0?'':(phase===1?'pj-a-enter':'pj-a-'+(rx.anim||'jump')));
  const props=rx.props||{};
  const roomNew=praise.roomNew||[];

  return(
    <div className="pj-stage" onClick={skip} role="button" aria-label="タップで進む">
      {phase===0&&<div className="pj-flash" aria-hidden="true"/>}
      {rx.confetti&&phase>=2&&(
        <div className="pj-confetti" aria-hidden="true">
          {['#ffd76a','#8dd8c0','#ff9bb2','#9ec9ff','#ffb480','#c6e78d','#f4a7d6','#7fd8e8'].map((c,i)=>(
            <i key={i} style={{left:`${6+i*11.5}%`,background:c,animationDuration:`${1.9+(i%4)*0.35}s`,animationDelay:`${i*0.12}s`}}/>
          ))}
        </div>
      )}
      {phase<3&&<button type="button" className="pj-skip" onClick={e=>{e.stopPropagation();skip();}}>スキップ</button>}

      <div className="pj-wrap">
        <div className="pj-tag"><span>{act?.icon}</span><span>{act?.label} 記録できたね！</span></div>

        <div className={`pj-panda-box${settled?' settled':''}`}>
          {props.top&&phase>=2&&<span className="pj-prop top" aria-hidden="true">{props.top}</span>}
          {props.l&&phase>=2&&<span className="pj-prop l" aria-hidden="true">{props.l}</span>}
          {props.r&&phase>=2&&<span className="pj-prop r" aria-hidden="true">{props.r}</span>}
          {imgStep<2?(
            <img
              src={PJ38_DIR+(imgStep===0?poseSrc:PJ38.normal)}
              className={`pj-panda${rx.big?' big':''} ${animCls}`}
              alt="パンジロー"
              onError={()=>setImgStep(s=>s+1)}/>
          ):(
            <div className={`pj-emoji ${animCls}`} aria-hidden="true">🐼</div>
          )}
        </div>

        <div className="pj-lines">
          {phase>=2&&(rx.lines||[]).map((ln,i)=>(
            <div key={i} className={`pj-line${i>0?' sm':''}`} style={{animationDelay:`${i*0.34}s`}}>{ln}</div>
          ))}
        </div>

        {phase>=3&&(
          <>
            <div className="pj-msg-card">
              <div className="pj-msg-act"><span>💬</span><span>パンジローからのひとこと</span></div>
              <div className="pj-msg">{praise.msg}</div>
              {praise.memory&&<div className="pj-memory">🐼 {praise.memory}</div>}
              {rx.kind==='milestone'&&(
                <div className="pj-milestone">🎉 {praise.streak}回そろったよ。ゆるくても、ちゃんと続いてる。</div>
              )}
              {roomNew.length>0&&(
                <div className="pj-room">
                  {/* 【v39修正】通知だけで終わらせず、増えた家具の名前をそのまま伝える */}
                  <div className="pj-room-t">あれ……？<br/>{roomNew.map(f=>`${f.icon} ${f.name}`).join('・')}をゲット！<br/>パンダルームに飾られたよ🐼</div>
                  <button type="button" className="pj-room-btn" onClick={e=>{e.stopPropagation();onRoom&&onRoom();}}>見に行く</button>
                </div>
              )}
            </div>
            <div className="pj-btns">
              <button className="pj-btn ghost" onClick={e=>{e.stopPropagation();onTL();}}>タイムラインに<br/>投稿する</button>
              <button className="pj-btn main" onClick={e=>{e.stopPropagation();onHome();}}>ホームへ戻る</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   【v43】タイムライン — 実ユーザーの実投稿を表示する

   ・Supabaseの posts から新着順に取得（ダミー投稿は混ぜない）
   ・「みんな」＝全体 / 「フォロー中」＝フォローした人だけ
     将来「おすすめ」「地域」を足すときも、snsFetchTimeline に mode を増やして
     ここのタブに1つ足すだけで済む構造にしてある(§10)
   ・投稿ゼロ・未ログイン・通信失敗のどれでも真っ白にしない(§16 §17)
   ═══════════════════════════════════════════════════════════════════════════ */
const SNS_FEEDS=[
  {id:'all',      label:'みんな'},
  {id:'following',label:'フォロー中'}
];

/* 通信中・空・エラーの共通表示。パンジローが一言そえる。 */
function SnsNotice({icon,title,sub,actionLabel,onAction}){
  return(
    <div className="card" style={{textAlign:'center',padding:'26px 18px'}}>
      <div style={{fontSize:34,marginBottom:8}}>{icon||'🐼'}</div>
      <div style={{fontSize:14,fontWeight:800,color:'#1a5044',marginBottom:6,lineHeight:1.6}}>{title}</div>
      {sub&&<div style={{fontSize:12,color:'#7aada0',lineHeight:1.7,marginBottom:actionLabel?14:0}}>{sub}</div>}
      {actionLabel&&onAction&&(
        <button type="button" onClick={onAction}
          style={{background:'#fff',color:'#4DB89E',border:'2px solid #d0ede5',borderRadius:14,
                  padding:'10px 20px',fontSize:13,fontWeight:800,cursor:'pointer',fontFamily:'inherit'}}>
          {actionLabel}
        </button>
      )}
    </div>
  );
}

/* 投稿づくり。競争を煽る表現・数字は出さない(§6 §15)。 */
function SnsComposer({state,onPosted,showToast}){
  const [body,setBody]=useState('');
  const [aid,setAid]=useState(null);
  const [busy,setBusy]=useState(false);
  const [err,setErr]=useState('');
  const uid=state&&state.auth;
  const send=async()=>{
    if(busy)return;
    setBusy(true);setErr('');
    const r=await snsCreatePost(uid,{body,activityType:aid},state.user);
    setBusy(false);
    if(r.error){setErr(r.error);return;}
    setBody('');setAid(null);
    if(showToast)showToast('投稿したよ ✨');
    if(onPosted)onPosted(r.data);
  };
  return(
    <div className="card" style={{marginBottom:12}}>
      <div style={{fontSize:12.5,fontWeight:900,color:'#1a5044',marginBottom:8}}>今日の「ちょっとだけ」を投稿</div>
      <textarea className="field" rows={2} maxLength={SNS_POST_MAX}
        placeholder="今日は10分だけ歩いた〜　など、ひとことでOK"
        value={body} onChange={e=>setBody(e.target.value)}
        style={{width:'100%',resize:'vertical',fontSize:13,lineHeight:1.6,fontFamily:'inherit'}}/>
      <div style={{display:'flex',flexWrap:'wrap',gap:6,margin:'9px 0 4px'}}>
        {ACTS.map(a=>(
          <button key={a.id} type="button" onClick={()=>setAid(aid===a.id?null:a.id)}
            style={{border:'1.5px solid '+(aid===a.id?'#4DB89E':'#dceee8'),
                    background:aid===a.id?'#eafaf4':'#fff',color:aid===a.id?'#2f8a72':'#6d8a83',
                    borderRadius:999,padding:'6px 11px',fontSize:11.5,fontWeight:800,
                    cursor:'pointer',fontFamily:'inherit'}}>
            {a.icon} {a.label}
          </button>
        ))}
      </div>
      {err&&<div style={{fontSize:11.5,color:'#c2683f',marginTop:6}}>{err}</div>}
      <div style={{display:'flex',alignItems:'center',gap:10,marginTop:10}}>
        <div style={{flex:1,fontSize:10.5,color:'#a0b8b0'}}>{body.length}/{SNS_POST_MAX}</div>
        <button type="button" onClick={send} disabled={busy}
          style={{background:busy?'#bcd9cf':'linear-gradient(135deg,#5DCBA8,#3da888)',color:'#fff',border:'none',
                  borderRadius:999,padding:'9px 20px',fontSize:12.5,fontWeight:900,
                  cursor:busy?'default':'pointer',fontFamily:'inherit',
                  boxShadow:'0 4px 12px rgba(77,184,158,0.35)'}}>
          {busy?'送信中…':'投稿する'}
        </button>
      </div>
    </div>
  );
}

function TimelineScreen({state,setState,showToast,onOpenReport,onOpenUser}){
  const uid=state&&state.auth;
  const [feed,setFeed]=useState('all');
  const [status,setStatus]=useState('loading'); // loading | ready | error | guest
  const [err,setErr]=useState('');
  const [tl,setTl]=useState({posts:[],profiles:{},reactions:{},commentCounts:{}});
  const [reloadKey,setReloadKey]=useState(0);
  const aliveRef=useRef(true);
  useEffect(()=>()=>{aliveRef.current=false;},[]);

  useEffect(()=>{
    let alive=true;
    if(!uid||uid==='guest'){setStatus('guest');return;}
    setStatus('loading');
    snsFetchTimeline(uid,feed).then(r=>{
      if(!alive)return;
      if(r.error){setErr(r.error);setStatus('error');return;}
      setTl({posts:r.data.posts||[],profiles:r.data.profiles||{},
             reactions:r.data.reactions||{},commentCounts:r.data.commentCounts||{}});
      setStatus('ready');
    });
    return ()=>{alive=false;};
  },[uid,feed,reloadKey]);

  const reload=()=>setReloadKey(k=>k+1);
  /* 投稿直後は、通信を待たずに先頭へ差し込む（体感を軽くする） */
  const onPosted=(post)=>{
    if(!post)return;
    setTl(t=>({...t,posts:[post,...t.posts]}));
    setState&&setState(s=>({...s,snsPostCount:(s.snsPostCount||0)+1}));
  };

  return(
    <div className="fade-up">
      <PH msg="みんなの記録★" sub="完璧じゃなくていい。続けてる人を応援しよう" pct={75}/>

      {/* タブ（将来「おすすめ」「地域」を足せる） */}
      <div style={{display:'flex',gap:7,padding:'12px 13px 0'}}>
        {SNS_FEEDS.map(f=>(
          <button key={f.id} type="button" onClick={()=>setFeed(f.id)}
            style={{border:'1.5px solid '+(feed===f.id?'#4DB89E':'#dceee8'),
                    background:feed===f.id?'#eafaf4':'#fff',color:feed===f.id?'#2f8a72':'#7aada0',
                    borderRadius:999,padding:'7px 15px',fontSize:12,fontWeight:900,
                    cursor:'pointer',fontFamily:'inherit'}}>{f.label}</button>
        ))}
        <div style={{flex:1}}/>
        <button type="button" onClick={reload} aria-label="読みこみ直す"
          style={{border:'1.5px solid #dceee8',background:'#fff',color:'#7aada0',borderRadius:999,
                  padding:'7px 12px',fontSize:12,fontWeight:900,cursor:'pointer',fontFamily:'inherit'}}>↻</button>
      </div>

      <div style={{padding:'12px 13px 0'}}>
        {status!=='guest'&&<SnsComposer state={state} onPosted={onPosted} showToast={showToast}/>}

        {status==='guest'&&(
          <SnsNotice icon="🐼" title="ログインすると、みんなの投稿が見られるよ"
            sub={"体験版のあいだは、自分の記録だけを残しておけるよ。\nゆっくりでだいじょうぶ〜"}/>
        )}
        {status==='loading'&&(
          <SnsNotice icon="🌿" title="よみこみ中…" sub="ちょっとだけ待ってね"/>
        )}
        {status==='error'&&(
          <SnsNotice icon="🐼" title={err||'うまく読めなかったみたい'}
            sub="電波のいいところで、もう一度ためしてみてね"
            actionLabel="もう一度よみこむ" onAction={reload}/>
        )}
        {status==='ready'&&tl.posts.length===0&&(
          feed==='following'
            ? <SnsNotice icon="🌱" title="フォロー中の人の投稿はまだないよ"
                sub={"気になる人のアイコンをタップして、フォローしてみよう〜"}
                actionLabel="みんなの投稿を見る" onAction={()=>setFeed('all')}/>
            : <SnsNotice icon="🐼" title="まだ投稿がないよ"
                sub={"今日の“ちょっとだけ”を投稿してみよう。\n1分でも、ストレッチだけでも大歓迎〜"}/>
        )}
      </div>

      {status==='ready'&&tl.posts.length>0&&(
        <div style={{padding:'4px 0 0'}}>
          {tl.posts.map(p=>(
            <SnsPostCard key={p.id} post={p} me={uid} state={state}
              author={tl.profiles[p.user_id]}
              initialReactions={tl.reactions[p.id]||{}}
              initialCommentCount={tl.commentCounts[p.id]||0}
              onOpenUser={onOpenUser} showToast={showToast}
              onDeleted={()=>setTl(t=>({...t,posts:t.posts.filter(x=>x.id!==p.id)}))}/>
          ))}
          <div style={{textAlign:'center',padding:'14px',fontSize:11,color:'#a0c0b8'}}>ここまで読んでくれてありがとう 🐼</div>
        </div>
      )}

      {/* 記録から投稿したい人向けの導線（既存の記録シートを開くだけ） */}
      {status==='ready'&&(
        <div style={{padding:'0 13px 8px'}}>
          <button type="button" onClick={()=>onOpenReport&&onOpenReport(true)}
            style={{width:'100%',background:'#fff',color:'#4DB89E',border:'2px solid #d0ede5',borderRadius:14,
                    padding:'12px',fontSize:13,fontWeight:800,cursor:'pointer',fontFamily:'inherit'}}>
            ✨ 運動を記録して投稿する
          </button>
        </div>
      )}

      {snsDebugOn()&&<DevSnsDebug state={state} feed={feed} status={status} err={err} tl={tl}/>}
    </div>
  );
}

/* ═══════════════ 【v43】投稿カード（実データ版） ═══════════════ */
function SnsPostCard({post,me,state,author,initialReactions,initialCommentCount,onOpenUser,showToast,onDeleted}){
  const act=ACTS.find(x=>x.id===post.activity_type);
  const isMine=post.user_id===me;
  const [rx,setRx]=useState(initialReactions||{});
  const [busyType,setBusyType]=useState(null);
  const [open,setOpen]=useState(false);
  const [cmts,setCmts]=useState(null);        // null=未取得
  const [cmtProfiles,setCmtProfiles]=useState({});
  const [cmtCount,setCmtCount]=useState(initialCommentCount||0);
  const [inp,setInp]=useState('');
  const [msg,setMsg]=useState('');
  const [err,setErr]=useState('');
  const [cmtErr,setCmtErr]=useState('');

  const name=snsDisplayName(author,isMine?(state.user&&state.user.name):null);
  const avatar=(author&&author.avatar_url)||(isMine&&state.user&&(state.user.avatarUrl||state.user.avatar))||null;

  const toggle=async(r)=>{
    if(busyType)return;
    const cur=rx[r.key]||{count:0,mine:false};
    const turnOn=!cur.mine;
    setBusyType(r.key);
    // 先に画面へ反映して、失敗したら戻す（連打しても数が二重に増えない）
    setRx(m=>({...m,[r.key]:{count:Math.max(0,cur.count+(turnOn?1:-1)),mine:turnOn}}));
    const res=await snsToggleReaction(me,post.id,r.key,turnOn,state.user);
    setBusyType(null);
    if(res.error){ setRx(m=>({...m,[r.key]:cur})); setErr(res.error); setTimeout(()=>setErr(''),2600); return; }
    if(turnOn){ setMsg(r.line); setTimeout(()=>setMsg(''),2200); }
  };

  const openComments=async()=>{
    const next=!open; setOpen(next);
    if(next&&cmts===null){
      const r=await snsFetchComments(me,post.id);
      if(r.error){setCmtErr(r.error);setCmts([]);return;}
      setCmts(r.data.comments); setCmtProfiles(r.data.profiles); setCmtCount(r.data.comments.length);
    }
  };
  const sendComment=async()=>{
    const t=inp.trim(); if(!t)return;
    setCmtErr('');
    const r=await snsAddComment(me,post.id,t,state.user);
    if(r.error){setCmtErr(r.error);return;}
    setCmts(list=>[...(list||[]),r.data]);
    setCmtProfiles(m=>({...m,[me]:m[me]||{id:me,nickname:(state.user&&state.user.name)||'',avatar_url:(state.user&&state.user.avatarUrl)||null}}));
    setCmtCount(c=>c+1); setInp('');
    if(showToast)showToast('応援を送ったよ 🌿');
  };
  const removePost=async()=>{
    const r=await snsSoftDeletePost(me,post.id);
    if(r.error){setErr(r.error);return;}
    if(showToast)showToast('投稿を削除したよ');
    onDeleted&&onDeleted();
  };

  const total=Object.keys(rx).reduce((n,k)=>n+((rx[k]&&rx[k].count)||0),0);
  return(
    <div className="post">
      <div className="post-head">
        <button type="button" onClick={()=>onOpenUser&&onOpenUser(post.user_id)}
          aria-label={name+'さんのプロフィール'}
          style={{background:'none',border:0,padding:0,cursor:'pointer',display:'flex',alignItems:'center',gap:9,flex:1,minWidth:0,textAlign:'left',fontFamily:'inherit'}}>
          {avatar
            ?<img src={avatar} className="avatar" style={{objectFit:'cover'}} alt=""/>
            :<div className="avatar" style={{background:snsColorOf(post.user_id)}}>{snsInitial(author,name)}</div>}
          <div style={{flex:1,minWidth:0}}>
            <div className="post-name">{name}{isMine&&<span style={{color:'#4DB89E',fontSize:10,marginLeft:4}}>(自分)</span>}</div>
            <div className="post-sub">{snsTimeText(post.created_at)}</div>
          </div>
        </button>
        {act&&<span className="act-tag">{act.icon} {act.label}</span>}
      </div>

      {post.body&&<div className="post-body">{post.body}</div>}

      <div className="reaction-panel">
        <div className="reaction-title">ゆるリアクション {total>0&&<span>{total}</span>}</div>
        <div className="yuru-reactions">
          {YURU_REACTIONS.map(r=>{
            const c=rx[r.key]||{count:0,mine:false};
            return(
              <button key={r.key} type="button" title={r.line}
                className={`yuru-reaction ${c.mine?'active':''}`} onClick={()=>toggle(r)}>
                <span className="reaction-emoji">{r.emoji}</span>
                <span className="reaction-label">{r.label}{c.count>0?` ${c.count}`:''}</span>
              </button>
            );
          })}
        </div>
        {msg&&<div className="reaction-bubble">🐼 {msg}</div>}
        {err&&<div className="reaction-mini" style={{color:'#c2683f'}}>{err}</div>}
      </div>

      <div className="post-foot">
        <button type="button" onClick={openComments}>💬 応援コメント{cmtCount>0?` ${cmtCount}`:''}</button>
        {isMine&&<button type="button" onClick={removePost} style={{marginLeft:'auto',color:'#b98a7a'}}>削除</button>}
      </div>

      {open&&(
        <div style={{marginTop:7}}>
          {cmts===null&&<div style={{fontSize:11.5,color:'#a0b8b0',padding:'6px 0'}}>よみこみ中…</div>}
          {cmts&&cmts.length===0&&!cmtErr&&(
            <div style={{fontSize:11.5,color:'#a0b8b0',padding:'6px 0'}}>まだコメントはないよ。最初のひとことをどうぞ🐼</div>
          )}
          {(cmts||[]).map(c=>(
            <div key={c.id} style={{fontSize:12,color:'#4a6860',padding:'5px 0',borderTop:'1px solid #f0f7f5'}}>
              <button type="button" onClick={()=>onOpenUser&&onOpenUser(c.user_id)}
                style={{background:'none',border:0,padding:0,marginRight:5,cursor:'pointer',fontFamily:'inherit',
                        color:'#1a4038',fontWeight:800,fontSize:12}}>
                {snsDisplayName(cmtProfiles[c.user_id],c.user_id===me?(state.user&&state.user.name):null)}
              </button>
              {c.body}
            </div>
          ))}
          {cmtErr&&<div style={{fontSize:11.5,color:'#c2683f',padding:'6px 0'}}>{cmtErr}</div>}
          <div style={{display:'flex',gap:7,marginTop:9,paddingTop:7,borderTop:'1px solid #f0f7f5'}}>
            <input className="field" style={{flex:1,padding:'7px 11px',fontSize:12}} placeholder="応援コメント…"
              value={inp} onChange={e=>setInp(e.target.value)}
              onKeyDown={e=>e.key==='Enter'&&sendComment()} maxLength={SNS_COMMENT_MAX}/>
            <button type="button" onClick={sendComment}
              style={{color:'#4DB89E',fontWeight:700,fontSize:13,background:'none',border:'none',cursor:'pointer',fontFamily:'inherit'}}>送る</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════ 【v43】ほかの人のプロフィール ═══════════════
   タイムラインでアイコン／名前をタップすると開く。
   フォロワー数を大きく見せたり、ランキングを出したりはしない(§15)。 */
function SnsUserScreen({userId,state,onClose,onOpenUser,showToast}){
  const me=state&&state.auth;
  const isMe=userId===me;
  const [status,setStatus]=useState('loading');
  const [err,setErr]=useState('');
  const [prof,setProf]=useState(null);
  const [counts,setCounts]=useState({posts:0,following:0,followers:0});
  const [following,setFollowing]=useState(false);
  const [followBusy,setFollowBusy]=useState(false);
  const [tl,setTl]=useState({posts:[],profiles:{},reactions:{},commentCounts:{}});
  const [reloadKey,setReloadKey]=useState(0);

  useEffect(()=>{
    let alive=true; setStatus('loading');
    Promise.all([
      snsFetchProfile(me,userId),
      snsFetchUserCounts(me,userId),
      snsFetchUserPosts(me,userId),
      isMe?Promise.resolve({data:false,error:null}):snsIsFollowing(me,userId)
    ]).then(([p,c,posts,f])=>{
      if(!alive)return;
      const bad=p.error||c.error||posts.error;
      if(bad){setErr(bad);setStatus('error');return;}
      setProf(p.data); setCounts(c.data);
      setTl({posts:posts.data.posts||[],profiles:posts.data.profiles||{},
             reactions:posts.data.reactions||{},commentCounts:posts.data.commentCounts||{}});
      setFollowing(!!f.data); setStatus('ready');
    });
    return ()=>{alive=false;};
  },[userId,me,reloadKey]);

  const toggleFollow=async()=>{
    if(followBusy||isMe)return;
    setFollowBusy(true);
    const next=!following;
    setFollowing(next);
    setCounts(c=>({...c,followers:Math.max(0,c.followers+(next?1:-1))}));
    const r=await snsSetFollow(me,userId,next,state.user);
    setFollowBusy(false);
    if(r.error){
      setFollowing(!next);
      setCounts(c=>({...c,followers:Math.max(0,c.followers+(next?-1:1))}));
      setErr(r.error); setTimeout(()=>setErr(''),2600);
      return;
    }
    if(showToast)showToast(next?'フォローしたよ 🌿':'フォローをやめたよ');
  };

  const name=snsDisplayName(prof,isMe?(state.user&&state.user.name):null);
  const avatar=(prof&&prof.avatar_url)||(isMe&&state.user&&(state.user.avatarUrl||state.user.avatar))||null;

  return(
    <div className="room-full-view">
      <div className="room-full-head">
        <button type="button" className="room-full-back" onClick={onClose}>← もどる</button>
        <div className="room-full-title">プロフィール</div>
        <div style={{width:104,flexShrink:0}}/>
      </div>
      <div className="room-full-body">
        {status==='loading'&&<SnsNotice icon="🌿" title="よみこみ中…"/>}
        {status==='error'&&(
          <SnsNotice icon="🐼" title={err||'うまく読めなかったみたい'} sub="もう一度ためしてみてね"
            actionLabel="もう一度よみこむ" onAction={()=>setReloadKey(k=>k+1)}/>
        )}
        {status==='ready'&&(
          <>
            <div className="card" style={{textAlign:'center'}}>
              {avatar
                ?<img src={avatar} alt="" style={{width:76,height:76,borderRadius:'50%',objectFit:'cover',margin:'0 auto 8px',display:'block'}}/>
                :<div style={{width:76,height:76,borderRadius:'50%',margin:'0 auto 8px',background:snsColorOf(userId),
                              color:'#fff',fontSize:30,fontWeight:900,display:'flex',alignItems:'center',justifyContent:'center'}}>
                    {snsInitial(prof,name)}
                 </div>}
              <div style={{fontSize:16,fontWeight:900,color:'#1a4038'}}>{name}</div>
              {prof&&prof.region&&<div style={{fontSize:11.5,color:'#7aada0',marginTop:3}}>📍 {prof.region}</div>}
              {prof&&(prof.intro||prof.hitokoto)&&(
                <div style={{fontSize:12.5,color:'#4a6860',lineHeight:1.7,marginTop:9,whiteSpace:'pre-wrap',textAlign:'left'}}>
                  {prof.intro||prof.hitokoto}
                </div>
              )}
              <div style={{display:'flex',justifyContent:'center',gap:22,marginTop:14}}>
                {[['投稿',counts.posts],['フォロー',counts.following],['フォロワー',counts.followers]].map(([l,v])=>(
                  <div key={l} style={{textAlign:'center'}}>
                    <div style={{fontSize:15,fontWeight:900,color:'#2f8a72'}}>{v}</div>
                    <div style={{fontSize:10.5,color:'#a0b8b0',marginTop:1}}>{l}</div>
                  </div>
                ))}
              </div>
              {!isMe&&(
                <button type="button" onClick={toggleFollow} disabled={followBusy}
                  style={{marginTop:14,width:'100%',borderRadius:14,padding:'11px',fontSize:13,fontWeight:900,
                          cursor:followBusy?'default':'pointer',fontFamily:'inherit',
                          border:following?'2px solid #d0ede5':'none',
                          background:following?'#fff':'linear-gradient(135deg,#5DCBA8,#3da888)',
                          color:following?'#4DB89E':'#fff'}}>
                  {following?'フォロー中':'フォローする'}
                </button>
              )}
              {isMe&&<div style={{marginTop:12,fontSize:11.5,color:'#a0b8b0'}}>これはあなたのプロフィールだよ🐼</div>}
              {err&&<div style={{fontSize:11.5,color:'#c2683f',marginTop:8}}>{err}</div>}
            </div>

            {tl.posts.length===0
              ?<SnsNotice icon="🌱" title="まだ投稿がないよ" sub={isMe?'今日の“ちょっとだけ”を投稿してみよう〜':'これからの投稿を待ってみよう〜'}/>
              :tl.posts.map(p=>(
                <SnsPostCard key={p.id} post={p} me={me} state={state}
                  author={tl.profiles[p.user_id]||prof}
                  initialReactions={tl.reactions[p.id]||{}}
                  initialCommentCount={tl.commentCounts[p.id]||0}
                  onOpenUser={onOpenUser} showToast={showToast}
                  onDeleted={()=>setTl(t=>({...t,posts:t.posts.filter(x=>x.id!==p.id)}))}/>
              ))}
            <div style={{height:24}}/>
          </>
        )}
      </div>
    </div>
  );
}

/* ═══════════════ 【開発用】?debug=sns ═══════════════
   本番UIには一切表示しない。URLに ?debug=sns を付けたときだけ出る。
   v42までのダミー投稿も、ここでだけ見られるようにしてある。 */
function DevSnsDebug({state,feed,status,err,tl}){
  const uid=(state&&state.auth)||'(未ログイン)';
  const lines=[
    'uid: '+uid,
    'supabase: '+(supabaseClient?'接続あり':'なし'),
    'feed: '+feed+' / status: '+status,
    'posts: '+((tl&&tl.posts&&tl.posts.length)||0)+' / authors: '+Object.keys((tl&&tl.profiles)||{}).length,
    'reactions付き投稿: '+Object.keys((tl&&tl.reactions)||{}).length,
    'error: '+(err||'(なし)')
  ].join('\n');
  return(
    <div style={{padding:'0 13px 12px'}}>
      <div className="room-debug" style={{position:'static',whiteSpace:'pre-wrap'}}>{lines}</div>
      <div className="card" style={{marginTop:8}}>
        <div style={{fontSize:11.5,fontWeight:900,color:'#8a7a5a',marginBottom:6}}>
          開発用デモ投稿（v42までのダミー。本番タイムラインには出ません）
        </div>
        {DEV_SAMPLE_POSTS.map(p=>{
          const u=DEV_SAMPLE_USERS.find(x=>x.id===p.uid);
          const a=ACTS.find(x=>x.id===p.aid);
          return(
            <div key={p.id} style={{fontSize:11.5,color:'#6d8a83',padding:'5px 0',borderTop:'1px solid #f0f7f5'}}>
              <strong style={{color:'#1a4038'}}>{u&&u.name}</strong> {a&&a.icon} {p.note}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WeeklyScreen({state,streak,pct}){
  const [mode,setMode]=useState('week');
  const [monthOffset,setMonthOffset]=useState(0);
  // 【v36改善】月別記録の「すべて見る」開閉状態（新しい画面は追加しない）
  const [showAllMonth,setShowAllMonth]=useState(false);

  /* ── 7日間・1年のグラフ用データ（従来ロジックのまま維持） ──
     1か月は「今日から過去31日」ではなく暦カレンダーで描くため、ここでは作らない */
  const days=[];
  if(mode!=='month'){
    const span=mode==='week'?7:365;
    for(let i=span-1;i>=0;i--){
      const d=new Date();d.setDate(d.getDate()-i);d.setHours(0,0,0,0);
      const k=dk(d);const cnt=state.reports.filter(r=>dk(r.ts)===k).length;
      days.push({k,cnt,done:cnt>0,lbl:mode==='week'?'日月火水木金土'[d.getDay()]:d.getDate(),isToday:i===0});
    }
  }
  const maxC=Math.max(1,...days.map(d=>d.cnt));
  const bd={};state.reports.forEach(r=>{bd[r.aid]=(bd[r.aid]||0)+1});
  const bl=Object.entries(bd).sort((a,b)=>b[1]-a[1]).map(([id,cnt])=>({...ACTS.find(a=>a.id===id),cnt}));
  let comeback=0;for(let i=1;i<state.reports.length;i++){if((state.reports[i].ts-state.reports[i-1].ts)/86400000>=7)comeback++;}

  /* ── 表示中の年月（上部カレンダーと下部アルバムで共通） ── */
  const ms=monthActivitySummary(state.reports,monthOffset);
  const monthRows=state.reports.filter(r=>monthKey(r.ts)===`${ms.year}-${String(ms.month).padStart(2,'0')}`).sort((a,b)=>b.ts-a.ts);
  const mem=memoryCard(state);

  /* ── 月間カレンダーの組み立て（日曜始まり・7列） ── */
  const monthCounts={};                                   // 日付ごとの記録件数
  monthRows.forEach(r=>{const dd=new Date(r.ts).getDate();monthCounts[dd]=(monthCounts[dd]||0)+1;});
  const firstDow=new Date(ms.year,ms.month-1,1).getDay(); // その月の1日の曜日（0=日）
  const lastDate=new Date(ms.year,ms.month,0).getDate();  // その月の末日
  const calCells=[];
  for(let i=0;i<firstDow;i++)calCells.push(null);         // 月初の空きマス
  for(let d=1;d<=lastDate;d++)calCells.push(d);
  while(calCells.length%7!==0)calCells.push(null);        // 月末の空きマス（行を揃える）
  const nowD=new Date();
  const isThisMonth=nowD.getFullYear()===ms.year&&(nowD.getMonth()+1)===ms.month;
  const todayDate=nowD.getDate();

  /* ── 年月ナビゲーション（未来月へは移動不可・最古の記録月まで選択可能） ── */
  const curY=nowD.getFullYear(),curM=nowD.getMonth();
  let minOffset=0;
  if(state.reports.length){
    const oldest=new Date(Math.min(...state.reports.map(r=>r.ts)));
    minOffset=Math.min(0,(oldest.getFullYear()-curY)*12+(oldest.getMonth()-curM));
  }
  const monthOptions=[];
  for(let o=0;o>=minOffset;o--){const t=new Date(curY,curM+o,1);monthOptions.push({v:o,label:`${t.getFullYear()}年${t.getMonth()+1}月`});}
  const goMonth=(o)=>{setMonthOffset(Math.max(minOffset,Math.min(0,o)));setShowAllMonth(false);};
  const monthNav=(
    <div className="month-nav">
      <button className="mini-btn" onClick={()=>goMonth(monthOffset-1)} disabled={monthOffset<=minOffset}>‹ 前月</button>
      <select className="month-select" value={monthOffset} onChange={e=>goMonth(Number(e.target.value))} aria-label="表示する年月を選ぶ">
        {monthOptions.map(o=><option key={o.v} value={o.v}>{o.label}</option>)}
      </select>
      <button className="mini-btn" onClick={()=>goMonth(monthOffset+1)} disabled={monthOffset>=0}>次月 ›</button>
      {monthOffset!==0&&<button className="mini-btn month-today-btn" onClick={()=>goMonth(0)}>今月</button>}
    </div>
  );

  const doneDays=mode==='month'?ms.days:days.filter(d=>d.done).length;

  return(
    <div className="fade-up">
      <PH msg="思い出と記録" sub="1週間・1か月・1年で、ゆるく振り返れるよ" pct={pct}/>
      <div style={{padding:'10px 13px 0'}}>
        <div className="period-tabs">
          {[
            ['week','7日間'],
            ['month','1か月'],
            ['year','1年']
          ].map(([id,label])=><button key={id} className={mode===id?'active':''} onClick={()=>setMode(id)}>{label}</button>)}
        </div>
      </div>
      <div style={{padding:'0 0 0'}}>
        <div className="card">
          <div className="card-title">📅 {mode==='week'?'過去7日間':mode==='month'?`${ms.year}年${ms.month}月`:'過去1年'}</div>
          {mode==='month'&&monthNav}
          <div style={{display:'flex',alignItems:'baseline',gap:8,marginBottom:11}}><span style={{fontSize:36,fontWeight:800,color:'#4DB89E'}}>{doneDays}</span><span style={{fontSize:14,color:'#7aada0'}}>日 動けた</span></div>
          {mode==='month'?(
            /* 【v36改善】暦どおりの月間カレンダー（日〜土の7列） */
            <div className="month-cal">
              <div className="cal-dow-row">
                {['日','月','火','水','木','金','土'].map((w,i)=><div key={w} className={`cal-dow${i===0?' sun':i===6?' sat':''}`}>{w}</div>)}
              </div>
              <div className="cal-grid">
                {calCells.map((d,i)=>{
                  if(d===null)return <div key={`e${i}`} className="cal-cell empty"/>;
                  const c=monthCounts[d]||0;
                  const isToday=isThisMonth&&d===todayDate;
                  return(
                    <div key={d} className={`cal-cell${c>0?' done':''}${isToday?' today':''}`} title={`${ms.year}年${ms.month}月${d}日${c>0?` ・${c}件`:''}`}>
                      <span className="cal-num">{d}</span>
                      {c===1&&<span className="cal-dot"/>}
                      {c>1&&<span className="cal-cnt">{c}</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          ):(
            <div className={mode==='year'?'year-heatmap':'week-bars'}>
              {days.map((d,i)=> mode==='week'?(
                <div key={d.k} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',gap:3}}>
                  <div style={{width:'100%',borderRadius:'6px 6px 0 0',height:`${d.done?(d.cnt/maxC)*66+13:5}px`,background:d.done?(d.isToday?'#4DB89E':'#8dd8c0'):'#dceee8',transition:'height 0.5s ease'}}/>
                  <div style={{fontSize:10,color:d.isToday?'#4DB89E':'#a0b8b0',fontWeight:d.isToday?700:500}}>{d.lbl}</div>
                </div>
              ):(
                <div key={d.k} title={d.k} className={`heat-dot ${d.done?'done':''} ${d.isToday?'today':''}`}></div>
              ))}
            </div>
          )}
        </div>
        <div className="card memory-card">
          <div className="card-title">🕰 懐かしカード</div>
          <div className="memory-hero">
            <div><div className="memory-tag">{mem.tag}</div><div className="memory-title">{mem.title}</div><div className="memory-body">{mem.body}</div></div>
            <div className="memory-panda">📖</div>
          </div>
        </div>
        <div className="card">
          {/* 【v36調整】年月ナビは月間カレンダーカード側の1か所のみ。ここは見出しだけ表示（monthOffsetで連動） */}
          <div className="card-title" style={{marginBottom:4}}>🗓 {ms.year}年{ms.month}月の記録</div>
          <div style={{fontSize:12,color:'#7aada0',marginBottom:10}}>{ms.days}日動いた / よくやった種目：{ms.top}</div>
          {monthRows.length===0?(
            <div style={{fontSize:12,color:'#9bb8b0',lineHeight:1.7,background:'#f8fffc',borderRadius:14,padding:12}}>この月は記録がなかったみたい。そんな月もあるよ🐼</div>
          ):(
            <>
              {(showAllMonth?monthRows:monthRows.slice(0,8)).map(r=>{const a=ACTS.find(x=>x.id===r.aid);return(
                <div key={r.id} className="rec-row">
                  <div><div style={{fontSize:13,fontWeight:700,color:'#1a3030'}}>{a?.icon} {a?.label}</div>{r.note&&<div style={{fontSize:11,color:'#a0b8b0',marginTop:1}}>{r.note}</div>}{r.photo&&<div className="rec-photo-mark">📷 写真あり</div>}</div>
                  {r.photo&&<img src={r.photo.dataUrl} className="rec-thumb" alt="記録写真"/>}
                  <span className="rec-tag">{fmtDateJP(r.ts)}</span>
                </div>
              );})}
              {monthRows.length>8&&(
                <button className="month-more-btn" onClick={()=>setShowAllMonth(v=>!v)}>
                  {showAllMonth?'閉じる':`この月の記録をすべて見る（${monthRows.length}件）`}
                </button>
              )}
            </>
          )}
        </div>
        {bl.length>0&&(
          <div className="card">
            <div className="card-title">🏆 種目の内訳（累計）</div>
            {bl.map(b=>{const p=Math.round((b.cnt/state.reports.length)*100);return(
              <div key={b.id} style={{marginBottom:11}}>
                <div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}><span style={{fontSize:13,fontWeight:600,color:'#1a3030'}}>{b.icon} {b.label}</span><span style={{fontSize:12,color:'#7aada0'}}>{b.cnt}回 ({p}%)</span></div>
                <div style={{height:7,background:'#e4f0ec',borderRadius:4}}><div style={{height:'100%',background:'linear-gradient(90deg,#5DCBA8,#3da888)',borderRadius:4,width:`${p}%`,transition:'width 0.6s ease'}}/></div>
              </div>
            );})}
          </div>
        )}
        <div className="card">
          <div className="card-title">🔄 戻ってきた回数</div>
          <div style={{display:'flex',alignItems:'baseline',gap:6,marginBottom:7}}><span style={{fontSize:36,fontWeight:800,color:'#ff6b6b'}}>{comeback}</span><span style={{fontSize:14,color:'#7aada0'}}>回</span></div>
          <div style={{fontSize:12,color:'#4a7060',lineHeight:1.75,background:'#fff5f5',borderRadius:12,padding:'9px 13px'}}>1週間以上空いてからまた動けた回数。<br/><strong>続かなかった日より、戻ってこれた日の方が大事</strong>だよ。</div>
        </div>
      </div>
    </div>
  );
}

function ProfileScreen({state,setState,showToast,onLogout}){
  const [editing,setEditing]=useState(false);
  const [name,setName]=useState(state.user.name);
  const [bio,setBio]=useState(state.user.bio||'');
  // 【v25新規追加】プロフィール項目の編集用state
  const [intro,setIntro]=useState(state.user.intro||'');            // 自己紹介文（最大150文字）
  const [avatar,setAvatar]=useState(state.user.avatar||null);       // プロフィール画像（dataURL）
  const [favActs,setFavActs]=useState(state.user.favActs||[]);      // 好きな運動（複数選択）
  const [pace,setPace]=useState(state.user.pace||'');               // 活動ペース
  const [region,setRegion]=useState(state.user.region||'未設定');   // 居住地域（任意）
  const [isPublic,setIsPublic]=useState(state.user.isPublic!==false); // 公開設定（初期値：公開）
  const [avatarErr,setAvatarErr]=useState('');
  const [saving,setSaving]=useState(false);
  const avatarFileRef=useRef(null);
  const total=state.reports.length;
  const streak=calcStreak(state.reports);
  const since=state.reports.length?dSince(state.reports[0].ts):0;
  const pct=Math.min(100,Math.max(5,Math.round((streak/30)*100)));

  // 編集開始時に最新の保存値をフォームへ反映する
  const startEdit=()=>{
    setName(state.user.name);setBio(state.user.bio||'');
    setIntro(state.user.intro||'');setAvatar(state.user.avatar||null);
    setFavActs(state.user.favActs||[]);setPace(state.user.pace||'');
    setRegion(state.user.region||'未設定');setIsPublic(state.user.isPublic!==false);
    setAvatarErr('');setEditing(true);
  };

  // プロフィール画像の選択（スマホの写真フォルダから選択 → 正方形トリミング＆圧縮）
  const pickAvatar=async(e)=>{
    const file=e.target.files&&e.target.files[0];
    if(!file)return;
    setAvatarErr('');
    try{setAvatar(await readAvatarFile(file));}
    catch(err){setAvatarErr(err.message||'画像を読み込めなかったよ🐼');}
    finally{if(avatarFileRef.current)avatarFileRef.current.value='';}
  };

  const toggleFav=(id)=>setFavActs(list=>list.includes(id)?list.filter(x=>x!==id):[...list,id]);

  // 保存処理：ローカル保存は必ず成功させ、Supabase(Storage/profiles)は可能なら同期する
  const save=async()=>{
    if(!name.trim()||saving)return;
    setSaving(true);
    try{
      let avatarUrl=state.user.avatarUrl||null;
      const avatarChanged=avatar!==state.user.avatar;
      if(avatarChanged&&avatar){
        // ログイン中ならSupabase Storageへアップロード（失敗してもdataURLで表示継続）
        avatarUrl=await uploadAvatarToSupabase(state.auth,avatar);
      }else if(!avatar){avatarUrl=null;}
      const nextUser={...state.user,
        name:name.trim(),bio:bio.trim(),intro:intro.trim(),
        avatar:avatar||null,avatarUrl,
        favActs,pace:pace||null,
        region:region==='未設定'?null:region,
        isPublic};
      setState(s=>({...s,user:nextUser}));
      syncProfileToSupabase(state.auth,nextUser); // profilesテーブルへも同期（未作成なら無視）
      snsEnsureProfile(state.auth,nextUser,{full:true}); // 【v43】SNS表示用の列(nickname/intro/region等)も更新（消した項目も反映）
      setEditing(false);
      showToast('プロフィールを保存しました 🐼');
    }catch(e){
      setAvatarErr('保存でつまずいたみたい。もう一度試してね🐼');
    }finally{
      setSaving(false); // エラー時もローディング状態を必ず解除
    }
  };

  if(editing)return(
    <div className="fade-up">
      <PH msg="プロフィール編集" sub="ぜんぶ任意だよ。埋めなくても大丈夫🐼" pct={pct}/>
      <div style={{padding:'13px 0 100px'}}><div className="card">

        {/* プロフィール画像（丸型プレビュー） */}
        <div className="pf-avatar-wrap">
          {avatar
            ?<img src={avatar} className="pf-avatar" alt="プロフィール画像"/>
            :<div className="pf-avatar-fallback">{name.trim()?name.trim()[0]:'🐼'}</div>}
          <button type="button" className="pf-avatar-btn" onClick={()=>avatarFileRef.current&&avatarFileRef.current.click()}>📷 写真を変更</button>
          {avatar&&<button type="button" className="pf-avatar-del" onClick={()=>{setAvatar(null);setAvatarErr('');}}>画像を削除する</button>}
          <input ref={avatarFileRef} type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" style={{display:'none'}} onChange={pickAvatar}/>
        </div>
        {avatarErr&&<div className="pf-err">{avatarErr}</div>}

        <label className="lbl">ニックネーム</label>
        <input className="field" style={{marginBottom:11}} value={name} onChange={e=>setName(e.target.value)} maxLength={20}/>

        <label className="lbl">自己紹介文（任意）</label>
        <textarea className="pf-textarea" value={intro} onChange={e=>setIntro(e.target.value.slice(0,150))} maxLength={150} placeholder="例：三日坊主歴10年。ゆるく再スタート中です🐼"/>
        <div className={`pf-counter${150-intro.length<=10?' warn':''}`}>あと{150-intro.length}文字</div>

        <label className="lbl">ひとこと（任意）</label>
        <input className="field" style={{marginBottom:16}} value={bio} onChange={e=>setBio(e.target.value)} maxLength={40} placeholder="未記入でもOK"/>

        <label className="lbl">好きな運動（複数OK・任意）</label>
        <div className="pf-chips">
          {FAV_ACT_OPTIONS.map(o=><button key={o.id} type="button" className={`pf-chip${favActs.includes(o.id)?' on':''}`} onClick={()=>toggleFav(o.id)}>{o.label}</button>)}
        </div>

        <label className="lbl">活動ペース（任意）</label>
        <div className="pf-chips">
          {PACE_OPTIONS.map(o=><button key={o.id} type="button" className={`pf-chip${pace===o.id?' on':''}`} onClick={()=>setPace(p=>p===o.id?'':o.id)}>{o.label}</button>)}
        </div>

        <label className="lbl">居住地域（任意・都道府県まで）</label>
        <select className="pf-select" value={region} onChange={e=>setRegion(e.target.value)}>
          {PREF_LIST.map(p=><option key={p} value={p}>{p}</option>)}
        </select>

        <div className="pf-toggle-row">
          <div>
            <div className="pf-toggle-label">プロフィールを公開する</div>
            <div className="pf-toggle-sub">オフにすると、他の人にはニックネームだけ表示されるよ</div>
          </div>
          <button type="button" className={`pf-toggle${isPublic?' on':''}`} onClick={()=>setIsPublic(v=>!v)} aria-label="公開設定"><span/></button>
        </div>

        <button className="btn btn-primary" onClick={save} disabled={!name.trim()||saving}>{saving?'保存中…':'保存'}</button>
        <button className="btn-ghost" disabled={saving} onClick={()=>{setEditing(false);setAvatarErr('');}}>やめる</button>
      </div></div>
    </div>
  );

  return(
    <div className="fade-up">
      <PH msg="今日もおつかれさま！" sub="食べながらでもいいし、ゆるく楽しく続けよう" pct={pct}/>
      <div style={{padding:'14px 13px 0',textAlign:'center'}}>
        {/* 【v25変更】プロフィール画像があれば丸型で表示、なければ従来のイニシャル表示 */}
        {state.user.avatar
          ?<img src={state.user.avatar} alt="プロフィール画像" style={{width:88,height:88,borderRadius:'50%',objectFit:'cover',margin:'0 auto 9px',display:'block',boxShadow:'0 8px 24px rgba(77,184,158,0.38)',border:'3px solid #fff'}}/>
          :<div style={{width:88,height:88,borderRadius:'50%',background:'linear-gradient(145deg,#5DCBA8,#3da888)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:34,fontWeight:700,color:'white',margin:'0 auto 9px',boxShadow:'0 8px 24px rgba(77,184,158,0.38)'}}>{state.user.name[0]}</div>}
        <div style={{fontSize:20,fontWeight:800,color:'#1a4038'}}>{state.user.name}</div>
        {since>0&&<div style={{fontSize:11,color:'#7aada0',marginTop:2}}>2024年2月から参加</div>}
        {state.user.bio&&<div style={{fontSize:12,color:'#7aada0',marginTop:3}}>{state.user.bio}</div>}
        {state.user.intro&&<div style={{fontSize:12,color:'#4a6a60',marginTop:7,lineHeight:1.7,padding:'0 20px',whiteSpace:'pre-wrap'}}>{state.user.intro}</div>}
        {/* 【v25新規追加】好きな運動・活動ペース・地域・公開設定のタグ表示 */}
        {((state.user.favActs||[]).length>0||state.user.pace||state.user.region||state.user.isPublic===false)&&(
          <div className="pf-tags">
            {(state.user.favActs||[]).map(id=>{const o=FAV_ACT_OPTIONS.find(x=>x.id===id);return o?<span key={id} className="pf-tag">{o.label}</span>:null;})}
            {state.user.pace&&<span className="pf-tag">🗓 {PACE_OPTIONS.find(x=>x.id===state.user.pace)?.label}</span>}
            {state.user.region&&<span className="pf-tag">📍 {state.user.region}</span>}
            {state.user.isPublic===false&&<span className="pf-tag" style={{background:'#f4f4f0',borderColor:'#e0e0d8',color:'#8a8a80'}}>🔒 非公開</span>}
          </div>
        )}
        <div style={{marginTop:9,display:'flex',gap:7,justifyContent:'center',flexWrap:'wrap'}}>
          <button onClick={startEdit} style={{padding:'5px 16px',border:'2px solid #4DB89E',borderRadius:999,color:'#4DB89E',fontWeight:700,fontSize:12,background:'white',cursor:'pointer',fontFamily:'inherit'}}>編集</button>
          <div style={{padding:'6px 14px',borderRadius:999,background:'linear-gradient(135deg,#4DB89E,#3da888)',color:'white',fontWeight:700,fontSize:12}}>🐼 ゆるトレ継続中</div>
        </div>
      </div>
      <div style={{padding:'0 13px'}}>
        <div className="stat-row">
          <div className="stat-box"><div className="stat-num">{since||47}</div><div className="stat-unit">継続日数</div></div>
          <div className="stat-box"><div className="stat-num">{total||38}</div><div className="stat-unit">運動回数</div></div>
          <div className="stat-box"><div className="stat-num">{Object.values(state.likes).filter(Boolean).length||12}</div><div className="stat-unit">応援した数</div></div>
        </div>
        <div className="card" style={{background:'linear-gradient(135deg,#ecfaf5,#d4f0e8)'}}>
          <div style={{fontSize:13,color:'#1a3030',lineHeight:1.8,fontStyle:'italic',textAlign:'center'}}>「{since||47}日前に始めた{state.user.name}さん、今日も来てくれた。それだけで十分えらい。」</div>
        </div>
        <div className="card">
          <div className="card-title">📝 最近の記録</div>
          {state.reports.length===0?(
            <>
              <div className="rec-row"><div><div style={{fontSize:13,fontWeight:600,color:'#1a3030'}}>🚶 ウォーキング</div><div style={{fontSize:11,color:'#a0b8b0',marginTop:1}}>今日</div></div><span className="rec-tag">30分</span></div>
              <div className="rec-row"><div><div style={{fontSize:13,fontWeight:600,color:'#1a3030'}}>🧘 ストレッチ</div><div style={{fontSize:11,color:'#a0b8b0',marginTop:1}}>昨日</div></div><span className="rec-tag">15分</span></div>
            </>
          ):(
            state.reports.slice(-4).reverse().map(r=>{const a=ACTS.find(x=>x.id===r.aid);return(
              <div key={r.id} className="rec-row">
                <div><div style={{fontSize:13,fontWeight:600,color:'#1a3030'}}>{a?.icon} {a?.label}</div>{r.note&&<div style={{fontSize:11,color:'#a0b8b0',marginTop:1}}>{r.note}</div>}{r.photo&&<div className="rec-photo-mark">📷 写真あり</div>}</div>
                {r.photo&&<img src={r.photo.dataUrl} className="rec-thumb" alt="記録写真"/>}
                <span className="rec-tag">{fmtTs(r.ts)}</span>
              </div>
            );})
          )}
        </div>
        <button onClick={onLogout} style={{width:'100%',padding:12,borderRadius:14,border:'1.5px solid #dceee8',background:'white',color:'#a0b8b0',fontSize:13,cursor:'pointer',fontFamily:'inherit',marginBottom:18}}>ログアウト</button>
      </div>
    </div>
  );
}

/* ═══════════════ デバイスフレーム ═══════════════ */
function IOSDevice(){
  return(
    <div className="frame-ios">
      <div className="ios-island"/>
      <div className="ios-statusbar" style={{paddingTop:14}}/>
      <DevCtx.Provider value="ios"><AppLogic devId="ios"/></DevCtx.Provider>
    </div>
  );
}
function AndroidDevice(){
  return(
    <div className="frame-android">
      <div className="android-camera"/>
      <div className="android-statusbar"/>
      <DevCtx.Provider value="android"><AppLogic devId="android"/></DevCtx.Provider>
      <div className="android-navbar">
        <span className="android-nav-btn">◀</span>
        <span className="android-nav-btn" style={{fontSize:22}}>⬤</span>
        <span className="android-nav-btn">■</span>
      </div>
    </div>
  );
}

/* ═══════════════ OS判定（新規追加） ═══════════════ */
// 【修正内容】アクセスしている端末のOSを判定し、該当する画面だけを表示します。
// ・画面幅では判定しません（OS判定とレスポンシブ対応は別物のため）
// ・iPadOSはMacのようなuserAgentを名乗ることがあるため、
//   「MacIntel かつ タッチ対応」の場合もiOSとして判定します
const getDeviceOS=()=>{
  const userAgent=navigator.userAgent||'';
  const platform=navigator.platform||'';

  // Android判定
  if(/android/i.test(userAgent)){
    return 'android';
  }

  // iOS判定（iPhone / iPad / iPod ＋ デスクトップ表示モードのiPad対策）
  const isIOS=
    /iPad|iPhone|iPod/.test(userAgent)||
    (platform==='MacIntel'&&navigator.maxTouchPoints>1);
  if(isIOS){
    return 'ios';
  }

  // それ以外（Windows / Mac / Linux等のパソコン）
  return 'desktop';
};

function Root(){
  // 【修正内容】OS判定は初回レンダー時に1回だけ行う（途中で変わることはないため）
  const [deviceOS]=useState(getDeviceOS);

  // 実機（スマホ）のときはbodyに目印クラスを付け、CSS側で余白を消す
  useEffect(()=>{
    if(deviceOS==='android'||deviceOS==='ios'){
      document.body.classList.add('is-real-device');
    }
    return()=>document.body.classList.remove('is-real-device');
  },[deviceOS]);

  // ── Android端末：Android専用画面だけを表示（iPhone画面は描画しない） ──
  if(deviceOS==='android'){
    return(
      <div className="real-device">
        <AndroidDevice/>
      </div>
    );
  }

  // ── iOS端末（iPhone/iPad/iPod）：iOS専用画面だけを表示（Android画面は描画しない） ──
  if(deviceOS==='ios'){
    return(
      <div className="real-device">
        <IOSDevice/>
      </div>
    );
  }

  // ── パソコン（Windows/Mac等）：従来どおりのデバイスプレビュー表示（既存デザイン維持） ──
  return(
    <div>
      <div className="page-title">ゆるトレ倶楽部 — デバイスプレビュー</div>
      <div className="devices-row">
        <div className="device-col"><div className="device-label">iPhone (iOS)</div><IOSDevice/></div>
        <div className="device-col"><div className="device-label">Android</div><AndroidDevice/></div>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<Root/>);

