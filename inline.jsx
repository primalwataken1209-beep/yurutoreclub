const {useState,useEffect,useRef,createContext,useContext}=React;

/* ═══════════════ Supabase設定 ═══════════════ */
const SUPABASE_URL='https://eszheiabjwehcbrteqza.supabase.co';
const SUPABASE_ANON_KEY='sb_publishable_XINCdNEKIrUVQJY8tZlOPw_wp8eJ7CW';
const supabaseClient = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;


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



const YURU_REACTIONS=[
  {key:'panda',emoji:'🐼',label:'えらすぎ！',line:'えらすぎる〜！その一歩、パンダが見てたよ🐼'},
  {key:'ramen',emoji:'🍜',label:'飯テロ',line:'これは飯テロ認定！おいしく食べたら明日ちょい活で優勝🍜'},
  {key:'zero',emoji:'🔥',label:'実質ゼロ',line:'動いたから実質ゼロ！ゆるトレ的には完全勝利🔥'},
  {key:'night',emoji:'🌙',label:'深夜部',line:'深夜部、入部確認！無理せずゆるくいこ〜🌙'},
  {key:'yuru',emoji:'😴',label:'ゆるくいこ〜',line:'今日はゆるくて大正解。休む勇気もトレーニング😴'},
];
const getReaction=(key)=>YURU_REACTIONS.find(r=>r.key===key)||YURU_REACTIONS[0];
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

const SAMPLE_USERS=[
  {id:'u1',name:'みちこ', initial:'み',color:'#5DCBA8'},
  {id:'u2',name:'けんさん',initial:'け',color:'#6baed6'},
  {id:'u3',name:'さちこ', initial:'さ',color:'#fc8d62'},
];
const SAMPLE_POSTS=[
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
  const [tab,setTab]=useState('home');
  const [showRep,setShowRep]=useState(false);
  const [postAfter,setPostAfter]=useState(false);
  const [praise,setPraise]=useState(null);
  const [aiLoad,setAiLoad]=useState(false);
  const [toast,setToast]=useState(null);
  const [reward,setReward]=useState(null);
  const [showWelcomeGate,setShowWelcomeGate]=useState(()=>{try{if(location.hash==='#welcome'||location.search.includes('welcome=1')){localStorage.removeItem('yurutore_welcome_seen_v8_food');return true;}return localStorage.getItem('yurutore_welcome_seen_v8_food')!=='1';}catch(e){return true;}});

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

  const handleLogin=async(email,pass)=>{
    setAuthError('');
    setAuthNotice('');
    if(!email||!pass){setAuthError('メールアドレスとパスワードを入力してね');return;}
    if(!supabaseClient){setAuthError('Supabaseの読み込みに失敗しました');return;}
    setAuthLoading(true);
    const {error}=await supabaseClient.auth.signInWithPassword({email,password:pass});
    setAuthLoading(false);
    if(error)setAuthError('ログインできませんでした。メール・パスワードを確認してね');
  };

  const handleRegister=async(email,pass)=>{
    setAuthError('');
    setAuthNotice('');
    if(!email||!pass){setAuthError('メールアドレスとパスワードを入力してね');return;}
    if(pass.length<6){setAuthError('パスワードは6文字以上にしてね');return;}
    if(!supabaseClient){setAuthError('Supabaseの読み込みに失敗しました');return;}
    setAuthLoading(true);
    const {data,error}=await supabaseClient.auth.signUp({email,password:pass});
    setAuthLoading(false);
    if(error){setAuthError(error.message.includes('already')?'すでに登録済みのメールかも。ログインを試してね':'新規登録できませんでした：'+error.message);return;}
    if(data.session){setAuthNotice('新規登録できたよ！このままプロフィール設定に進んでね🐼');return;}
    setAuthNotice('新規登録できたよ！確認メールが届いていたら、メール内のリンクを押してからログインしてね🐼');
  };

  const handleGoogleLogin=async()=>{
    setAuthError('');
    if(!supabaseClient){setAuthError('Supabaseの読み込みに失敗しました');return;}
    setAuthLoading(true);
    const {error}=await supabaseClient.auth.signInWithOAuth({provider:'google',options:{redirectTo:location.href}});
    setAuthLoading(false);
    if(error)setAuthError('Googleログインの設定確認が必要です');
  };

  const handleLogout=async()=>{
    if(session&&supabaseClient)await supabaseClient.auth.signOut();
    setSt(s=>({...DEF,user:s?.user||null,onboard:!!s?.onboard}));
    setSession(null);
  };

  const closeWelcomeGate=()=>{try{localStorage.setItem('yurutore_welcome_seen_v8_food','1');}catch(e){};setShowWelcomeGate(false);};
  if(showWelcomeGate)return<WelcomeGate onContinue={closeWelcomeGate} onLogin={handleLogin} onRegister={handleRegister} authLoading={authLoading} authError={authError} authNotice={authNotice}/>;

  // 初回ユーザー向け：世界観が伝わるウェルカム画面 → 登録/体験 → 初期設定
  if(!st.user||!st.onboard)return<RegisterScreen onDone={u=>setSt(s=>({...s,user:u,onboard:true}))} onLogin={handleLogin} onRegister={handleRegister} authLoading={authLoading} authError={authError} authNotice={authNotice} hasSession={!!session}/>;
  if(praise)return<PraiseScreen praise={praise} state={st} onHome={()=>{setPraise(null);setTab('home');}} onTL={()=>{setSt(s=>({...s,posted:[...(s.posted||[]),praise.reportId]}));setPraise(null);setTab('timeline');showToast('タイムラインに投稿したよ ✨');}}/>;

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
    setSt(s=>({...s,reports:nrs,...(willPost?{posted:[...(s.posted||[]),nr.id]}:{})}));
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
      setPraise({msg,aid,streak,ds,reportId:nr.id});
    }
  };

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
        {tab==='home'    &&<HomeScreen     state={st} setState={setSt} streak={streak} pct={pct} aiLoad={aiLoad} onOpenReport={()=>setShowRep(true)}/>}
        {tab==='timeline'&&<TimelineScreen state={st} onReaction={toggleReaction} onCmt={addCmt} onOpenReport={(post)=>{setPostAfter(!!post);setShowRep(true);}} onPostExisting={(rid)=>{setSt(s=>({...s,posted:[...(s.posted||[]),rid]}));showToast('タイムラインに投稿したよ ✨');}}/>}
        {tab==='weekly'  &&<WeeklyScreen   state={st} streak={streak} pct={pct}/>}
        {tab==='profile' &&<ProfileScreen  state={st} setState={setSt} showToast={showToast} onLogout={handleLogout}/>}
        {toast&&<div className="toast">{toast}</div>}
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

/* ═══════════════ ログイン ═══════════════ */
function LoginScreen({onLogin,onRegister,onGoogleLogin,loading,error,notice}){
  const [email,setEmail]=useState('');
  const [pass,setPass]=useState('');
  const [mode,setMode]=useState('login');
  const platform=useContext(DevCtx);
  const submit=()=>{
    if(mode==='register')onRegister(email.trim(),pass);
    else onLogin(email.trim(),pass);
  };
  return(
    <div style={{display:'flex',flexDirection:'column',height:'100%',overflowY:'auto'}}>
      <div className="login-hero">
        <div className="ai-banner">
          <div className="ai-inner">
            <strong>今日もおつかれさま！</strong>
            <span>ゆるっと続けるあなたが いちばんすごいよ〜！💗</span>
          </div>
        </div>
        <Ring pct={75}/>
      </div>
      <div className="login-form fade-up">
        <div style={{textAlign:'center',marginBottom:22}}>
          <div style={{fontSize:24,fontWeight:800,color:'#1a4038',letterSpacing:0.5}}>ゆるトレ倶楽部</div>
          <div style={{fontSize:12,color:'#7aada0',marginTop:4,lineHeight:1.55}}>{mode==='register'?'まずはメールとパスワードで新規登録しよう。':'食べながらでもいいし、ゆるく、楽しく続けよう。'}</div>
        </div>
        {error&&<div style={{fontSize:12,color:'#d66',background:'#fff3f3',border:'1px solid #ffd6d6',borderRadius:12,padding:'9px 12px',marginBottom:12,lineHeight:1.5}}>{error}</div>}
        {notice&&<div style={{fontSize:12,color:'#2f8f76',background:'#effaf6',border:'1px solid #ccefe3',borderRadius:12,padding:'9px 12px',marginBottom:12,lineHeight:1.5}}>{notice}</div>}
        <label className="lbl">メールアドレス</label>
        <input className="field" style={{marginBottom:10}} placeholder="example@mail.com" value={email} onChange={e=>setEmail(e.target.value)} autoComplete="email"/>
        <label className="lbl">パスワード</label>
        <input className="field" style={{marginBottom:20}} type="password" placeholder="6文字以上" value={pass} onChange={e=>setPass(e.target.value)} autoComplete={mode==='register'?'new-password':'current-password'} onKeyDown={e=>{if(e.key==='Enter')submit();}}/>
        <button className="btn btn-primary" disabled={loading} onClick={submit}>{loading?'処理中…':mode==='register'?'新規登録する':'ログイン'}</button>
        {mode==='register'&&<div style={{fontSize:11,color:'#90a8a0',lineHeight:1.6,marginTop:10,textAlign:'center'}}>登録後、Supabase設定によっては確認メールが届くよ。</div>}
        <div style={{display:'flex',alignItems:'center',gap:8,margin:'13px 0'}}>
          <div style={{flex:1,height:1,background:'#dceee8'}}/><span style={{fontSize:11,color:'#b0c8c0'}}>または</span>
          <div style={{flex:1,height:1,background:'#dceee8'}}/>
        </div>
        <button className="btn btn-outline" disabled={loading} onClick={()=>onGoogleLogin()}><span style={{marginRight:6}}>G</span>Googleでログイン</button>
        <div style={{textAlign:'center',marginTop:16,fontSize:13,color:'#7aada0'}}>
          {mode==='login'?'アカウントをお持ちでない方 → ':'登録済みの方 → '}
          <button disabled={loading} onClick={()=>setMode(mode==='login'?'register':'login')} style={{color:'#4DB89E',fontWeight:700,background:'none',border:'none',cursor:'pointer',fontSize:13,fontFamily:'inherit'}}>{mode==='login'?'新規登録画面へ':'ログイン画面へ'}</button>
        </div>
        <div style={{textAlign:'center',marginTop:14,fontSize:11,color:'#90a8a0',lineHeight:1.7,background:'#f0faf8',borderRadius:platform==='android'?8:12,padding:'10px 14px'}}>
          完璧じゃなくていい。<br/>ピザ食べた日でも、また戻っておいで。
        </div>
      </div>
    </div>
  );
}

/* ═══════════════ 新規登録 ═══════════════ */




function WelcomeGate({onContinue,onLogin,onRegister,authLoading,authError,authNotice}){
  const [step,setStep]=useState(0);
  const [mode,setMode]=useState('register');
  const [email,setEmail]=useState('');
  const [pass,setPass]=useState('');
  const [localNotice,setLocalNotice]=useState('');
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
          <button className={mode==='register'?'sel':''} onClick={()=>setMode('register')}>新規登録</button>
          <button className={mode==='login'?'sel':''} onClick={()=>setMode('login')}>ログイン</button>
        </div>
        <label className="lbl">メールアドレス</label>
        <input className="field" placeholder="example@email.com" value={email} onChange={e=>setEmail(e.target.value)} autoCapitalize="none"/>
        <label className="lbl">パスワード</label>
        <input className="field" type="password" placeholder="6文字以上" value={pass} onChange={e=>setPass(e.target.value)}/>
        {(authError||authNotice||localNotice)&&<div className={`auth-entry-msg ${authError?'err':''}`}>{authError||authNotice||localNotice}</div>}
        <button className="yg8-primary" disabled={authLoading} onClick={async()=>{
          setLocalNotice('');
          if(mode==='register'&&onRegister){
            await onRegister(email,pass);
            setLocalNotice('登録メールを確認してね。今は体験版として先に進めるよ🐼');
            setTimeout(onContinue,350);
            return;
          }
          if(mode==='login'&&onLogin){
            await onLogin(email,pass);
            setLocalNotice('ログイン確認中だよ。入れない時は体験版で先に進めるよ🐼');
            setTimeout(onContinue,350);
          }
        }}>{authLoading?'確認中…':mode==='register'?'✨無料ではじめる✨':'ログインする'}</button>
        <button className="yg8-secondary" onClick={onContinue}>メール設定はあとで、体験版で始める</button>
        <button className="yg8-linkbtn" onClick={()=>setStep(3)}>← 戻る</button>
      </div>
    </div>
  );
}



function RegisterScreen({onDone,onLogin,onRegister,authLoading,authError,authNotice,hasSession}){
  const [step,setStep]=useState(0);
  const [selActs,setSelActs]=useState([]);
  const [freq,setFreq]=useState(null);
  const [name,setName]=useState('');
  const [bio,setBio]=useState('');
  const [email,setEmail]=useState('');
  const [pass,setPass]=useState('');
  const [mode,setMode]=useState('register');
  const [localNotice,setLocalNotice]=useState('');
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

  if(step===3)return(
    <div className="welcome-screen auth-entry-screen">
      <div className="welcome-bg-orb orb-one"/><div className="welcome-bg-orb orb-two"/>
      <div className="auth-entry-card fade-up">
        <div className="welcome-badge">START</div>
        <div className="auth-panda">🐼✨</div>
        <h1>一緒にゆるく続けよう</h1>
        <p>メール登録すると、将来データ保存や機種変更にもつなげやすくなるよ。</p>
        <div className="auth-mode-row">
          <button className={mode==='register'?'sel':''} onClick={()=>setMode('register')}>新規登録</button>
          <button className={mode==='login'?'sel':''} onClick={()=>setMode('login')}>ログイン</button>
        </div>
        <label className="lbl">メールアドレス</label>
        <input className="field" placeholder="example@email.com" value={email} onChange={e=>setEmail(e.target.value)} autoCapitalize="none"/>
        <label className="lbl">パスワード</label>
        <input className="field" type="password" placeholder="6文字以上" value={pass} onChange={e=>setPass(e.target.value)}/>
        {(authError||authNotice||localNotice)&&<div className={`auth-entry-msg ${authError?'err':''}`}>{authError||authNotice||localNotice}</div>}
        <button className="welcome-main-btn" disabled={authLoading} onClick={async()=>{
          setLocalNotice('');
          if(mode==='register'&&onRegister){
            await onRegister(email,pass);
            setLocalNotice('登録メールを確認してね。今は体験版として先に進めるよ🐼');
            goOnboard();
            return;
          }
          if(mode==='login'&&onLogin){
            await onLogin(email,pass);
            setLocalNotice('ログイン確認中だよ。入れない時は体験版で先に進めるよ🐼');
          }
          if(hasSession)goOnboard();
        }}>{authLoading?'確認中…':mode==='register'?'✨無料ではじめる✨':'ログインする'}</button>
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
        <input className="field" style={{marginBottom:11}} placeholder="例: ケンタロ" value={name} onChange={e=>setName(e.target.value)} maxLength={20}/>
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

function HomeScreen({state,setState,streak,pct,aiLoad,onOpenReport}){
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
      <PH msg={`こんにちは、${state.user.name}さん`}
          sub={todayDone?'今日もおつかれさまでした！ゆるっと続けてえらい':isComeback?'おかえり！また戻ってきてくれてうれしい':'ゆるっと続けるあなたが いちばんすごいよ〜！💗'}
          pct={pct}/>



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

      <div style={{display:'flex',gap:8,padding:'10px 13px 2px',flexWrap:'wrap'}}>
        <div style={{background:'white',borderRadius:999,padding:'6px 12px',boxShadow:'0 2px 8px rgba(0,0,0,0.07)',fontSize:12,fontWeight:700,color:'#e85858'}}>🔥 {streak}日継続</div>
        <div style={{background:'white',borderRadius:999,padding:'6px 12px',boxShadow:'0 2px 8px rgba(0,0,0,0.07)',fontSize:12,fontWeight:700,color:'#e8a820'}}>📅 今週{days.filter(d=>d.done).length}日</div>
        <div style={{background:'white',borderRadius:999,padding:'6px 12px',boxShadow:'0 2px 8px rgba(0,0,0,0.07)',fontSize:12,fontWeight:700,color:'#4DB89E'}}>🐼 AI褒め待機中</div>
      </div>

      {aiLoad&&(
        <div className="card" style={{marginTop:10}}>
          <div style={{display:'flex',alignItems:'center',gap:12}}>
            <div style={{width:36,height:36,borderRadius:'50%',background:'#4DB89E',display:'flex',alignItems:'center',justifyContent:'center',fontSize:18,flexShrink:0}}>🐼</div>
            <div><div style={{fontSize:12,color:'#7aada0',marginBottom:4,fontWeight:600}}>ゆるさん</div><div className="dot-anim"><span/><span/><span/></div></div>
          </div>
        </div>
      )}

      <div className="card" style={{marginTop:aiLoad?0:10}}>
        <div className="card-title">🗓 この1週間</div>
        <div className="week-dots">
          {days.map(d=><div key={d.k} className={`wdot ${d.done?'done':d.isToday?'today':'empty'}`}>{d.lbl}</div>)}
        </div>
        <div style={{fontSize:11,color:'#7aada0',marginTop:7,textAlign:'right'}}>動けた日 {days.filter(d=>d.done).length} / 7</div>
      </div>


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


      <RewardGarden state={state} streak={streak}/>
      <div data-guide-target="room" style={{scrollMarginTop:12}}><PandaRoom state={state} streak={streak}/></div>
      <PandaChatRoom state={state} setState={setState}/>
      <TimeCapsuleCard state={state} setState={setState}/>
      <MemoryPeek state={state}/>

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

      {isComeback&&(
        <div className="card" style={{background:'linear-gradient(135deg,#fff5ed,#ffe4d4)',border:'1.5px solid rgba(255,107,107,0.18)'}}>
          <div style={{fontSize:13,fontWeight:700,color:'#c04040',marginBottom:5}}>🐼 おかえりメッセージ</div>
          <div style={{fontSize:13,color:'#5a3030',lineHeight:1.7}}>少し間があいたみたいだけど、また戻ってきてくれてうれしいよ。今日はストレッチ10分だけでも十分だよ。</div>
        </div>
      )}

      {state.reports.length>0&&(
        <div className="card">
          <div className="card-title">📝 最近の記録</div>
          {state.reports.slice(-3).reverse().map(r=>{
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
  const chatCount=(state.pandaChats||[]).length;
  const missionDone=missionCount(state);
  const pandaPoints=pandaPointCount(state);
  return {total:reports.length,foodCount,walkCount,gymCount,photoCount,ramenReaction,nightCount,streak,chatCount,missionDone,pandaPoints};
}
function pandaRoomItems(state,streak){
  const st=roomStats(state,streak);
  return [
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
    {id:'pointStar',icon:'⭐',name:'パンダスター',desc:'パンダポイント100pt',ok:st.pandaPoints>=100,place:'天井'},
    {id:'crown',icon:'👑',name:'常連の王冠',desc:'7日継続',ok:st.streak>=7,place:'パンダの頭上'}
  ];
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
function PandaRoom({state,streak}){
  const items=pandaRoomItems(state,streak);
  const unlocked=items.filter(i=>i.ok);
  const next=items.find(i=>!i.ok);
  const mood=roomPandaMood();
  const roomLevel=unlocked.length>=9?'王冠ルーム':unlocked.length>=7?'にぎやかルーム':unlocked.length>=4?'ぽかぽかルーム':unlocked.length>=1?'はじまりルーム':'まっさらルーム';
  return(
    <div className="card panda-room-card room-v2-card">
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:8,marginBottom:10}}>
        <div>
          <div className="card-title" style={{marginBottom:2}}>🐼 パンダルーム</div>
          <div style={{fontSize:11,color:'#7aada0',fontWeight:800}}>運動・写真・飯テロ・会話で家具が増えるよ</div>
        </div>
        <div className="room-level-badge">{roomLevel}</div>
      </div>
      <div className="panda-room-stage room-v2-stage">
        <div className="room-back-wall">
          <div className="room-wall-deco cloud-a">☁️</div>
          <div className="room-window"><span>{roomSeasonIcon()}</span></div>
          <div className="room-frame frame-left">🐾</div>
          <div className="room-frame frame-right">ゆる</div>
          <div className="room-shelf shelf-right"><span>棚</span></div>
          <div className="room-baseboard"/>
        </div>
        <div className="room-floor-area">
          <div className="room-rug"/>
          <div className="room-shadow"/>
        </div>
        {items.map(it=><div key={it.id} className={`room-furniture room-${it.id} ${it.ok?'unlocked':'locked'}`} title={`${it.name}：${it.desc}`}>{it.ok?it.icon:<span className="lock-mark">🔒</span>}</div>)}
        <div className={`room-panda-v2 pose-${mood.pose}`}>
          {items.find(i=>i.id==='crown')?.ok&&<div className="room-crown-on-panda">👑</div>}
          <PandaMascot variant={mood.pose==='sleepy'?'sleepy':'happy'} size="sm"/>
          <div className="room-panda-label">{mood.label}</div>
        </div>
      </div>
      <div className="room-progress">
        <div><b>{unlocked.length}</b> / {items.length} 個 解放</div>
        <div className="room-progress-bar"><span style={{width:`${Math.round(unlocked.length/items.length*100)}%`}}/></div>
      </div>
      {next&&<div className="next-room-item">次のごほうび：<b>{next.icon} {next.name}</b><span>{next.desc} / 置き場所：{next.place}</span></div>}
      <div className="room-item-book">
        {items.map(it=><div key={it.id} className={`room-book-chip ${it.ok?'ok':''}`}><span>{it.ok?it.icon:'🔒'}</span><div><b>{it.name}</b><em>{it.desc}</em></div></div>)}
      </div>
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

function PraiseScreen({praise,state,onHome,onTL}){
  const act=ACTS.find(a=>a.id===praise.aid);
  const [play,setPlay]=useState(false);
  
  const bars=[38,62,82,55,72,44,60,78,48,65,38,55];
  const streak=calcStreak(state.reports);
  const pct=Math.min(100,Math.max(5,Math.round((streak/30)*100)));
  return(
    <div style={{height:'100%',overflowY:'auto',background:'linear-gradient(180deg,#e9fff6,#fffaf2)',position:'relative'}}>
      <PH msg="報告できたね！" sub="ゆるパンダが全力でほめに来たよ" pct={pct}/>
      <div style={{position:'fixed',inset:0,background:'rgba(24,80,68,0.16)',backdropFilter:'blur(4px)',zIndex:30,display:'flex',alignItems:'center',justifyContent:'center',padding:18}}>
        <div className="praise-card" style={{margin:0,width:'100%',maxWidth:360,position:'relative',border:'3px solid rgba(93,203,168,0.28)',boxShadow:'0 18px 45px rgba(44,120,100,0.25)'}}>
          <div style={{position:'absolute',top:-30,left:'50%',transform:'translateX(-50%)',fontSize:46,filter:'drop-shadow(0 5px 8px rgba(0,0,0,0.12))'}}>🐼</div>
          <div style={{textAlign:'center',paddingTop:18}}>
            <div className="check-circle">✓</div>
            <div style={{display:'inline-flex',alignItems:'center',gap:6,background:'#f1fff9',border:'1px solid #d3f2e8',borderRadius:999,padding:'7px 12px',fontSize:12,fontWeight:800,color:'#3d8f78',marginBottom:10}}>
              <span>{act?.icon}</span><span>{act?.label} 報告完了！</span>
            </div>
            <div style={{fontSize:12,fontWeight:800,color:'#f0a23a',marginBottom:8}}>ゆるパンダからのほめ言葉</div>
          </div>
          <div className="praise-msg" style={{fontSize:18,lineHeight:1.75,background:'linear-gradient(135deg,#fffdf7,#f2fff9)',border:'2px solid #e5f4ec',borderRadius:22,padding:'18px 16px',position:'relative'}}>
            <div style={{position:'absolute',top:-12,left:20,background:'#fffdf7',padding:'0 8px',fontSize:18}}>💬</div>
            {praise.msg}
          </div>
          
          
          <div style={{display:'flex',gap:9,marginTop:12}}>
            <button onClick={()=>{onTL();}} style={{flex:1,background:'white',border:'2px solid #d0ede5',borderRadius:14,padding:'12px',fontSize:12,fontWeight:700,color:'#4DB89E',cursor:'pointer',fontFamily:'inherit'}}>タイムラインに<br/>投稿する</button>
            <button onClick={()=>{onHome();}} style={{flex:1,background:'linear-gradient(135deg,#5DCBA8,#3da888)',border:'none',borderRadius:14,padding:'12px',fontSize:12,fontWeight:700,color:'white',cursor:'pointer',fontFamily:'inherit',boxShadow:'0 4px 14px rgba(77,184,158,0.4)'}}>ホームへ戻る</button>
          </div>
          <div style={{textAlign:'center',marginTop:12,fontSize:11,color:'#a0c0b8'}}>「投稿する」を押すと、みんなのタイムラインに届きます ✨</div>
        </div>
      </div>
    </div>
  );
}

function TimelineScreen({state,onReaction,onCmt,onOpenReport,onPostExisting}){
  const [pickerOpen,setPickerOpen]=useState(false);
  const [pickMode,setPickMode]=useState(null); // null | 'list'
  const postedSet=new Set(state.posted||[]);
  const myPosts=state.reports.filter(r=>postedSet.has(r.id)).slice(-5).map(r=>({id:r.id,uid:'me',aid:r.aid,note:r.note,photo:r.photo,mago:Math.floor((Date.now()-r.ts)/60000),likes:0,comments:[],isMine:true}));
  const all=[...myPosts,...SAMPLE_POSTS].sort((a,b)=>a.mago-b.mago);
  const unposted=state.reports.filter(r=>!postedSet.has(r.id)).slice().reverse();
  return(
    <div className="fade-up">
      <PH msg="みんなの記録★" sub="完璧じゃなくていい。続けてる人を応援しよう" pct={75}/>
      <div style={{padding:'10px 13px 0',display:'flex',justifyContent:'flex-end'}}>
        <button onClick={()=>{setPickMode(null);setPickerOpen(true);}} style={{background:'linear-gradient(135deg,#5DCBA8,#3da888)',color:'white',border:'none',borderRadius:999,padding:'8px 16px',fontSize:12,fontWeight:700,cursor:'pointer',fontFamily:'inherit',boxShadow:'0 4px 12px rgba(77,184,158,0.4)'}}>＋ 投稿する</button>
      </div>
      <div style={{padding:'10px 0 0'}}>
        {all.map(p=>{
          const u=p.isMine?{name:state.user.name,initial:state.user.name[0],color:'#4DB89E'}:SAMPLE_USERS.find(x=>x.id===p.uid);
          const a=ACTS.find(x=>x.id===p.aid);
          const selectedReaction=state.reactions?.[p.id] || (state.likes?.[p.id]?'panda':null);
          const myC=(state.myComments[p.id]||[]).map(c=>({name:state.user.name,text:c.txt}));
          return<PostCard key={p.id} post={p} u={u} act={a} selectedReaction={selectedReaction} baseLikes={p.likes||0} comments={[...(p.comments||[]),...myC]} onReaction={(key)=>onReaction(p.id,key)} onCmt={t=>onCmt(p.id,t)}/>;
        })}
        <div style={{textAlign:'center',padding:'14px',fontSize:11,color:'#a0c0b8'}}>ここまで読んでくれてありがとう 🐼</div>
      </div>
      {pickerOpen&&(
        <div className="overlay" onClick={()=>setPickerOpen(false)}>
          <div className="sheet" onClick={e=>e.stopPropagation()}>
            <div className="grab"/>
            {pickMode===null&&(
              <>
                <div style={{fontSize:16,fontWeight:800,color:'#1a4038',marginBottom:4}}>どう投稿する？</div>
                <div style={{fontSize:12,color:'#7aada0',marginBottom:14}}>方法を選んでね</div>
                <button onClick={()=>{setPickerOpen(false);onOpenReport(true);}} style={{width:'100%',background:'linear-gradient(135deg,#5DCBA8,#3da888)',color:'white',border:'none',borderRadius:14,padding:'14px',fontSize:14,fontWeight:700,cursor:'pointer',fontFamily:'inherit',marginBottom:10,boxShadow:'0 4px 14px rgba(77,184,158,0.4)'}}>✨ 新しく記録して投稿</button>
                <button onClick={()=>setPickMode('list')} disabled={unposted.length===0} style={{width:'100%',background:'white',color:unposted.length===0?'#c0d0c8':'#4DB89E',border:'2px solid #d0ede5',borderRadius:14,padding:'14px',fontSize:14,fontWeight:700,cursor:unposted.length===0?'not-allowed':'pointer',fontFamily:'inherit',marginBottom:10,opacity:unposted.length===0?0.5:1}}>📝 過去の記録から選ぶ {unposted.length>0&&`(${unposted.length}件)`}</button>
                <button className="btn-ghost" onClick={()=>setPickerOpen(false)}>やめる</button>
              </>
            )}
            {pickMode==='list'&&(
              <>
                <div style={{display:'flex',alignItems:'center',gap:9,marginBottom:14}}>
                  <button onClick={()=>setPickMode(null)} style={{color:'#a0b8b0',fontSize:22,background:'none',border:'none',cursor:'pointer',lineHeight:1,padding:0}}>‹</button>
                  <div style={{fontSize:16,fontWeight:800,color:'#1a4038'}}>過去の記録から選ぶ</div>
                </div>
                <div style={{fontSize:12,color:'#7aada0',marginBottom:10}}>まだ投稿してない記録だよ</div>
                <div style={{maxHeight:320,overflowY:'auto',marginBottom:10}}>
                  {unposted.map(r=>{const a=ACTS.find(x=>x.id===r.aid);return(
                    <button key={r.id} onClick={()=>{onPostExisting(r.id);setPickerOpen(false);}} style={{width:'100%',display:'flex',alignItems:'center',justifyContent:'space-between',background:'#f5fbf9',border:'1.5px solid #dceee8',borderRadius:12,padding:'11px 13px',marginBottom:7,cursor:'pointer',fontFamily:'inherit',textAlign:'left'}}>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:13,fontWeight:700,color:'#1a3030'}}>{a?.icon} {a?.label}</div>
                        {r.note&&<div style={{fontSize:11,color:'#7aada0',marginTop:2,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{r.note}</div>}
                        <div style={{fontSize:10,color:'#a0b8b0',marginTop:2}}>{fmtTs(r.ts)}</div>
                      </div>
                      <span style={{color:'#4DB89E',fontWeight:700,fontSize:12,marginLeft:10,flexShrink:0}}>投稿 ›</span>
                    </button>
                  );})}
                </div>
                <button className="btn-ghost" onClick={()=>setPickerOpen(false)}>やめる</button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function PostCard({post,u,act,selectedReaction,baseLikes,comments,onReaction,onCmt}){
  const [inp,setInp]=useState('');const [open,setOpen]=useState(false);
  const [reactionMsg,setReactionMsg]=useState('');
  const reactionOptions=suggestReactions(post,act);
  const totalReacts=(baseLikes||0)+(selectedReaction?1:0);
  const selectedObj=selectedReaction?getReaction(selectedReaction):null;
  const sub=()=>{if(!inp.trim())return;onCmt(inp);setInp('');setOpen(false);};
  return(
    <div className="post">
      <div className="post-head">
        <div className="avatar" style={{background:u?.color}}>{u?.initial||u?.name?.[0]}</div>
        <div style={{flex:1}}><div className="post-name">{u?.name}{post.isMine&&<span style={{color:'#4DB89E',fontSize:10,marginLeft:4}}>(自分)</span>}</div><div className="post-sub">{fmtM(post.mago)}</div></div>
        <span className="act-tag">{act?.icon} {act?.label}</span>
      </div>
      {post.note&&<div className="post-body">{post.note}</div>}
      {post.photo&&<img src={post.photo.dataUrl} className="post-photo" alt="投稿写真"/>}
      <div className="reaction-panel">
        <div className="reaction-title">ゆるリアクション {totalReacts>0&&<span>{totalReacts}</span>}</div>
        <div className="yuru-reactions">
          {reactionOptions.map(r=>(
            <button key={r.key} className={`yuru-reaction ${selectedReaction===r.key?'active':''}`} onClick={()=>{onReaction(r.key);setReactionMsg(r.line);setTimeout(()=>setReactionMsg(''),2200);}} title={r.line}>
              <span className="reaction-emoji">{r.emoji}</span><span className="reaction-label">{r.label}</span>
            </button>
          ))}
        </div>
        {reactionMsg&&<div className="reaction-bubble">🐼 {reactionMsg}</div>}
        {!reactionMsg&&selectedObj&&<div className="reaction-mini">あなたは「{selectedObj.emoji}{selectedObj.label}」したよ</div>}
      </div>
      <div className="post-foot">
        <button onClick={()=>setOpen(s=>!s)}>💬 応援コメント</button>
      </div>
      {comments.length>0&&<div style={{marginTop:7}}>{comments.map((c,i)=><div key={i} style={{fontSize:12,color:'#4a6860',padding:'4px 0',borderTop:'1px solid #f0f7f5'}}><strong style={{color:'#1a4038',marginRight:5}}>{c.name}</strong>{c.text||c.txt}</div>)}</div>}
      {open&&(
        <div style={{display:'flex',gap:7,marginTop:9,paddingTop:7,borderTop:'1px solid #f0f7f5'}}>
          <input className="field" style={{flex:1,padding:'7px 11px',fontSize:12}} placeholder="応援コメント…" value={inp} onChange={e=>setInp(e.target.value)} onKeyDown={e=>e.key==='Enter'&&sub()} autoFocus maxLength={80}/>
          <button onClick={sub} style={{color:'#4DB89E',fontWeight:700,fontSize:13,background:'none',border:'none',cursor:'pointer',fontFamily:'inherit'}}>送る</button>
        </div>
      )}
    </div>
  );
}

function WeeklyScreen({state,streak,pct}){
  const [mode,setMode]=useState('week');
  const [monthOffset,setMonthOffset]=useState(0);
  const days=[];
  const span=mode==='week'?7:mode==='month'?31:365;
  for(let i=span-1;i>=0;i--){
    const d=new Date();d.setDate(d.getDate()-i);d.setHours(0,0,0,0);
    const k=dk(d);const cnt=state.reports.filter(r=>dk(r.ts)===k).length;
    days.push({k,cnt,done:cnt>0,lbl:mode==='week'?'日月火水木金土'[d.getDay()]:d.getDate(),isToday:i===0});
  }
  const doneDays=days.filter(d=>d.done).length;
  const maxC=Math.max(1,...days.map(d=>d.cnt));
  const bd={};state.reports.forEach(r=>{bd[r.aid]=(bd[r.aid]||0)+1});
  const bl=Object.entries(bd).sort((a,b)=>b[1]-a[1]).map(([id,cnt])=>({...ACTS.find(a=>a.id===id),cnt}));
  let comeback=0;for(let i=1;i<state.reports.length;i++){if((state.reports[i].ts-state.reports[i-1].ts)/86400000>=7)comeback++;}
  const ms=monthActivitySummary(state.reports,monthOffset);
  const monthRows=state.reports.filter(r=>monthKey(r.ts)===`${ms.year}-${String(ms.month).padStart(2,'0')}`).sort((a,b)=>b.ts-a.ts);
  const mem=memoryCard(state);
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
          <div className="card-title">📅 過去{mode==='week'?'7日間':mode==='month'?'1か月':'1年'}</div>
          <div style={{display:'flex',alignItems:'baseline',gap:8,marginBottom:11}}><span style={{fontSize:36,fontWeight:800,color:'#4DB89E'}}>{doneDays}</span><span style={{fontSize:14,color:'#7aada0'}}>日 動けた</span></div>
          <div className={mode==='year'?'year-heatmap':mode==='month'?'month-heatmap':'week-bars'}>
            {days.map((d,i)=> mode==='week'?(
              <div key={d.k} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',gap:3}}>
                <div style={{width:'100%',borderRadius:'6px 6px 0 0',height:`${d.done?(d.cnt/maxC)*66+13:5}px`,background:d.done?(d.isToday?'#4DB89E':'#8dd8c0'):'#dceee8',transition:'height 0.5s ease'}}/>
                <div style={{fontSize:10,color:d.isToday?'#4DB89E':'#a0b8b0',fontWeight:d.isToday?700:500}}>{d.lbl}</div>
              </div>
            ):(
              <div key={d.k} title={d.k} className={`heat-dot ${d.done?'done':''} ${d.isToday?'today':''}`}>{mode==='month'&&i%5===0?d.lbl:''}</div>
            ))}
          </div>
        </div>
        <div className="card memory-card">
          <div className="card-title">🕰 懐かしカード</div>
          <div className="memory-hero">
            <div><div className="memory-tag">{mem.tag}</div><div className="memory-title">{mem.title}</div><div className="memory-body">{mem.body}</div></div>
            <div className="memory-panda">📖</div>
          </div>
        </div>
        <div className="card">
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
            <div className="card-title" style={{margin:0}}>🗓 月別アルバム</div>
            <div style={{display:'flex',gap:6}}>
              <button className="mini-btn" onClick={()=>setMonthOffset(o=>o-1)}>‹ 前月</button>
              <button className="mini-btn" onClick={()=>setMonthOffset(0)}>今月</button>
              <button className="mini-btn" onClick={()=>setMonthOffset(o=>Math.min(0,o+1))}>次月 ›</button>
            </div>
          </div>
          <div style={{fontSize:20,fontWeight:900,color:'#1a5044',marginBottom:4}}>{ms.year}年{ms.month}月</div>
          <div style={{fontSize:12,color:'#7aada0',marginBottom:10}}>{ms.days}日動いた / よくやった種目：{ms.top}</div>
          {monthRows.length===0?(
            <div style={{fontSize:12,color:'#9bb8b0',lineHeight:1.7,background:'#f8fffc',borderRadius:14,padding:12}}>この月はまだ記録なし。未来の「懐かしい」を、今日から作っていこう🐼</div>
          ):(
            monthRows.slice(0,8).map(r=>{const a=ACTS.find(x=>x.id===r.aid);return(
              <div key={r.id} className="rec-row">
                <div><div style={{fontSize:13,fontWeight:700,color:'#1a3030'}}>{a?.icon} {a?.label}</div>{r.note&&<div style={{fontSize:11,color:'#a0b8b0',marginTop:1}}>{r.note}</div>}{r.photo&&<div className="rec-photo-mark">📷 写真あり</div>}</div>
                {r.photo&&<img src={r.photo.dataUrl} className="rec-thumb" alt="記録写真"/>}
                <span className="rec-tag">{fmtDateJP(r.ts)}</span>
              </div>
            );})
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
  const total=state.reports.length;
  const streak=calcStreak(state.reports);
  const since=state.reports.length?dSince(state.reports[0].ts):0;
  const pct=Math.min(100,Math.max(5,Math.round((streak/30)*100)));
  const save=()=>{if(!name.trim())return;setState(s=>({...s,user:{...s.user,name:name.trim(),bio:bio.trim()}}));setEditing(false);showToast('保存したよ 🐼');};

  if(editing)return(
    <div className="fade-up">
      <PH msg="プロフィール編集" sub="ニックネームはいつでも変えられるよ" pct={pct}/>
      <div style={{padding:'13px 0 100px'}}><div className="card">
        <label className="lbl">ニックネーム</label>
        <input className="field" style={{marginBottom:11}} value={name} onChange={e=>setName(e.target.value)} maxLength={20}/>
        <label className="lbl">ひとこと</label>
        <input className="field" style={{marginBottom:16}} value={bio} onChange={e=>setBio(e.target.value)} maxLength={40} placeholder="未記入でもOK"/>
        <button className="btn btn-primary" onClick={save} disabled={!name.trim()}>保存</button>
        <button className="btn-ghost" onClick={()=>{setName(state.user.name);setBio(state.user.bio||'');setEditing(false);}}>やめる</button>
      </div></div>
    </div>
  );

  return(
    <div className="fade-up">
      <PH msg="今日もおつかれさま！" sub="食べながらでもいいし、ゆるく楽しく続けよう" pct={pct}/>
      <div style={{padding:'14px 13px 0',textAlign:'center'}}>
        <div style={{width:76,height:76,borderRadius:'50%',background:'linear-gradient(145deg,#5DCBA8,#3da888)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:30,fontWeight:700,color:'white',margin:'0 auto 9px',boxShadow:'0 8px 24px rgba(77,184,158,0.38)'}}>{state.user.name[0]}</div>
        <div style={{fontSize:20,fontWeight:800,color:'#1a4038'}}>{state.user.name}</div>
        {since>0&&<div style={{fontSize:11,color:'#7aada0',marginTop:2}}>2024年2月から参加</div>}
        {state.user.bio&&<div style={{fontSize:12,color:'#7aada0',marginTop:3}}>{state.user.bio}</div>}
        <div style={{marginTop:9,display:'flex',gap:7,justifyContent:'center',flexWrap:'wrap'}}>
          <button onClick={()=>setEditing(true)} style={{padding:'5px 16px',border:'2px solid #4DB89E',borderRadius:999,color:'#4DB89E',fontWeight:700,fontSize:12,background:'white',cursor:'pointer',fontFamily:'inherit'}}>編集</button>
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

function Root(){
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
