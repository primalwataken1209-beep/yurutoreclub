# v51.4.3 表示修正限定・確認報告

## 1. 変更ファイル
変更: index.html、app.js。追加: このREADME。ほかの全ファイルは元ZIPとバイト単位で一致。既存README、CSS、画像、法務、Supabase、公開設定は変更なし。外部サービス操作・デプロイなし。
ベースは添付の yurutore_v51_4_2_password_8chars_clean.zip。指定名の(2).zipとの同一性は未確認。

## 2. 変更内容
- プロフィールの架空フォールバック47日／38回／12回を削除。
- 日数は既存since（最初の記録から経過した満日数）を維持。未記録は0、初回記録当日も0日経過。メッセージは新規の日英キーで未記録用／当日用を分岐し、「0日前に始めた」と表示しない。
- 空の最近の記録からサンプル2件を削除し、既存home.noRecordを表示。実記録の表示は維持。
- 日英auth.leadGate／auth.leadRegを指示書推奨文面へ変更。
- 保存形式、実データ、認証・記録処理、プロフィール以外のサンプルは変更なし。

## 3. 確認結果
ローカルでBabelによるJSX解析と、実ProfileScreenを変換してJSXランタイムを簡易要素生成器に置き換えた描画テストを実施。実ブラウザ／React DOMの操作テストではない。
- 日英×体験版／ログイン済み×未記録／当日1件／過去1件と応援2件の計12パターン合格。
- 未記録: 日数0・運動0・応援0、記録行0。空状態と未記録メッセージが表示。
- 当日ストレッチ1件: 日数0・運動1・応援0、実記録1行。当日専用メッセージが表示。
- 3日前の記録1件・応援2件: 日数3・運動1・応援2、既存日数メッセージと実記録1行が表示。
- 日英の認証説明2キーを確認、既存画面のキー参照は維持。
- index.htmlインラインアプリコードとapp.jsは従来の先頭コメントを除き全文一致。JSX全文の構文解析合格。
- ProfileScreen以外の全トップレベル関数宣言が元版と一致。プロフィールsaveハンドラーも一致。登録・メールログイン・Googleログイン・記録保存・プロフィール保存の処理に差分なし。
- 元ZIPの全ファイル比較、変更2ファイル・追加READMEのみ。納品ZIPのCRC検証合格。

## 4. v51.4.2との差分
以下に変更2ファイルの完全差分を掲載。

## 5. 未確認事項
実ブラウザでの画面幅・改行・操作、実機、実アカウントによる登録／メール・Googleログイン／記録保存／プロフィール編集保存は未実施。外部サービスには接続・変更していない。

## 6. ローンチ判断
今回対象の表示問題はローカル描画確認では解消。新たな阻害問題は検出されていない。ただしアプリ全体のローンチ可否は未判定。公開前に実機・テストアカウントで上記操作の確認が必要。
ついでの改善は実装なし。

```diff
--- v51.4.2/app.js
+++ v51.4.3/app.js
@@ -178,6 +178,8 @@
     mdGift:'🎁 プレゼント', mdShop:'🛒 ショップ',
     minAgo:'{n}分前', hourAgo:'{n}時間前', dayAgo:'{n}日前',
     pfHeadMsg:'今日もおつかれさま！', pfHeadSub:'食べながらでもいいし、ゆるく楽しく続けよう',
+    pfNoRecord:'まだ記録はないけど、今日来てくれた。それだけで十分えらいよ🐼',
+    pfStartedToday:'{name}さん、今日、最初の記録ができたね。それだけで十分えらいよ🐼',
     pfSince:'「{days}日前に始めた{name}さん、今日も来てくれた。それだけで十分えらい。」'},
   confirm:{badge:'STEP 1 完了', title:'確認メールを送信しました',
     to:'{email} 宛に', body:'確認メールを送信しました。メール内のリンクを開いて登録を完了してください。',
@@ -269,8 +271,8 @@
     resetLead:'登録したメールアドレスを入力してね。再設定用のリンクを送るよ🐼',
     sendReset:'再設定メールを送る', backToLogin:'← ログインへ戻る',
     title:'一緒にゆるく続けよう',
-    leadGate:'メール登録すると、あとでデータ保存やログイン機能につなげられるよ。',
-    leadReg:'メール登録すると、将来データ保存や機種変更にもつなげやすくなるよ。',
+    leadGate:'メールアドレスで登録・ログインできるよ。登録せずに体験版から始めることもできるよ🐼',
+    leadReg:'メールアドレスで登録・ログインできるよ。まずは体験版から試してもOK🐼',
     tabRegister:'新規登録', tabLogin:'ログイン',
     email:'メールアドレス', password:'パスワード', passwordPh:'8文字以上', passwordPhLogin:'パスワード',
     forgot:'パスワードを忘れた方はこちら',
@@ -462,6 +464,8 @@
     mdGift:'🎁 Gifts', mdShop:'🛒 Shop',
     minAgo:'{n} min ago', hourAgo:'{n} h ago', dayAgo:'{n} d ago',
     pfHeadMsg:'Good to see you today', pfHeadSub:'Snacks are allowed. Keep it easy and enjoyable',
+    pfNoRecord:'No records yet, but you showed up today. That alone is worth celebrating. 🐼',
+    pfStartedToday:'{name}, you made your first record today. That alone is worth celebrating. 🐼',
     pfSince:'"{name} started {days} days ago, and came back again today. That alone is plenty."'},
   confirm:{badge:'Step 1 done', title:'We sent you a confirmation email.',
     to:'Sent to {email}', body:'Open the link in the email to finish signing up.',
@@ -552,8 +556,8 @@
     resetLead:"Pop in the email you signed up with and we'll send you a reset link 🐼",
     sendReset:'Send reset email', backToLogin:'← Back to log in',
     title:"Let's keep it easy together",
-    leadGate:'Adding an email lets you save your data and log in later.',
-    leadReg:'Adding an email makes it easy to keep your data if you change phones.',
+    leadGate:'Sign up or log in with your email. You can also try the demo without an account. 🐼',
+    leadReg:'Sign up or log in with your email. Trying the demo first is fine too. 🐼',
     tabRegister:'Sign up', tabLogin:'Log in',
     email:'Email', password:'Password', passwordPh:'8 characters or more', passwordPhLogin:'Password',
     forgot:'Forgot your password?',
@@ -9724,20 +9728,17 @@
       </div>
       <div style={{padding:'0 13px'}}>
         <div className="stat-row">
-          <div className="stat-box"><div className="stat-num">{since||47}</div><div className="stat-unit">{t('profile.statDays')}</div></div>
-          <div className="stat-box"><div className="stat-num">{total||38}</div><div className="stat-unit">{t('profile.statCount')}</div></div>
-          <div className="stat-box"><div className="stat-num">{Object.values(state.likes).filter(Boolean).length||12}</div><div className="stat-unit">{t('profile.statCheer')}</div></div>
+          <div className="stat-box"><div className="stat-num">{since}</div><div className="stat-unit">{t('profile.statDays')}</div></div>
+          <div className="stat-box"><div className="stat-num">{total}</div><div className="stat-unit">{t('profile.statCount')}</div></div>
+          <div className="stat-box"><div className="stat-num">{Object.values(state.likes).filter(Boolean).length}</div><div className="stat-unit">{t('profile.statCheer')}</div></div>
         </div>
         <div className="card" style={{background:'linear-gradient(135deg,#ecfaf5,#d4f0e8)'}}>
-          <div style={{fontSize:13,color:'#1a3030',lineHeight:1.8,fontStyle:'italic',textAlign:'center'}}>{t('ui.pfSince',{days:(since||47),name:state.user.name})}</div>
+          <div style={{fontSize:13,color:'#1a3030',lineHeight:1.8,fontStyle:'italic',textAlign:'center'}}>{total===0?t('ui.pfNoRecord'):since===0?t('ui.pfStartedToday',{name:state.user.name}):t('ui.pfSince',{days:since,name:state.user.name})}</div>
         </div>
         <div className="card">
           <div className="card-title">{t('home.recentTitle')}</div>
           {state.reports.length===0?(
-            <>
-              <div className="rec-row"><div><div style={{fontSize:13,fontWeight:600,color:'#1a3030'}}>🚶 {tl(ACTS[0])}</div><div style={{fontSize:11,color:'#a0b8b0',marginTop:1}}>{t('demo.today')}</div></div><span className="rec-tag">{t('misc.minutes',{n:30})}</span></div>
-              <div className="rec-row"><div><div style={{fontSize:13,fontWeight:600,color:'#1a3030'}}>🧘 {tl(ACTS[2])}</div><div style={{fontSize:11,color:'#a0b8b0',marginTop:1}}>{t('demo.yest')}</div></div><span className="rec-tag">{t('misc.minutes',{n:15})}</span></div>
-            </>
+            <div style={{fontSize:13,color:'#a0b8b0',padding:'12px 0'}}>{t('home.noRecord')}</div>
           ):(
             state.reports.slice(-4).reverse().map(r=>{const a=ACTS.find(x=>x.id===r.aid);return(
               <div key={r.id} className="rec-row">
--- v51.4.2/index.html
+++ v51.4.3/index.html
@@ -2126,6 +2126,8 @@
     mdGift:'🎁 プレゼント', mdShop:'🛒 ショップ',
     minAgo:'{n}分前', hourAgo:'{n}時間前', dayAgo:'{n}日前',
     pfHeadMsg:'今日もおつかれさま！', pfHeadSub:'食べながらでもいいし、ゆるく楽しく続けよう',
+    pfNoRecord:'まだ記録はないけど、今日来てくれた。それだけで十分えらいよ🐼',
+    pfStartedToday:'{name}さん、今日、最初の記録ができたね。それだけで十分えらいよ🐼',
     pfSince:'「{days}日前に始めた{name}さん、今日も来てくれた。それだけで十分えらい。」'},
   confirm:{badge:'STEP 1 完了', title:'確認メールを送信しました',
     to:'{email} 宛に', body:'確認メールを送信しました。メール内のリンクを開いて登録を完了してください。',
@@ -2217,8 +2219,8 @@
     resetLead:'登録したメールアドレスを入力してね。再設定用のリンクを送るよ🐼',
     sendReset:'再設定メールを送る', backToLogin:'← ログインへ戻る',
     title:'一緒にゆるく続けよう',
-    leadGate:'メール登録すると、あとでデータ保存やログイン機能につなげられるよ。',
-    leadReg:'メール登録すると、将来データ保存や機種変更にもつなげやすくなるよ。',
+    leadGate:'メールアドレスで登録・ログインできるよ。登録せずに体験版から始めることもできるよ🐼',
+    leadReg:'メールアドレスで登録・ログインできるよ。まずは体験版から試してもOK🐼',
     tabRegister:'新規登録', tabLogin:'ログイン',
     email:'メールアドレス', password:'パスワード', passwordPh:'8文字以上', passwordPhLogin:'パスワード',
     forgot:'パスワードを忘れた方はこちら',
@@ -2410,6 +2412,8 @@
     mdGift:'🎁 Gifts', mdShop:'🛒 Shop',
     minAgo:'{n} min ago', hourAgo:'{n} h ago', dayAgo:'{n} d ago',
     pfHeadMsg:'Good to see you today', pfHeadSub:'Snacks are allowed. Keep it easy and enjoyable',
+    pfNoRecord:'No records yet, but you showed up today. That alone is worth celebrating. 🐼',
+    pfStartedToday:'{name}, you made your first record today. That alone is worth celebrating. 🐼',
     pfSince:'"{name} started {days} days ago, and came back again today. That alone is plenty."'},
   confirm:{badge:'Step 1 done', title:'We sent you a confirmation email.',
     to:'Sent to {email}', body:'Open the link in the email to finish signing up.',
@@ -2500,8 +2504,8 @@
     resetLead:"Pop in the email you signed up with and we'll send you a reset link 🐼",
     sendReset:'Send reset email', backToLogin:'← Back to log in',
     title:"Let's keep it easy together",
-    leadGate:'Adding an email lets you save your data and log in later.',
-    leadReg:'Adding an email makes it easy to keep your data if you change phones.',
+    leadGate:'Sign up or log in with your email. You can also try the demo without an account. 🐼',
+    leadReg:'Sign up or log in with your email. Trying the demo first is fine too. 🐼',
     tabRegister:'Sign up', tabLogin:'Log in',
     email:'Email', password:'Password', passwordPh:'8 characters or more', passwordPhLogin:'Password',
     forgot:'Forgot your password?',
@@ -11672,20 +11676,17 @@
       </div>
       <div style={{padding:'0 13px'}}>
         <div className="stat-row">
-          <div className="stat-box"><div className="stat-num">{since||47}</div><div className="stat-unit">{t('profile.statDays')}</div></div>
-          <div className="stat-box"><div className="stat-num">{total||38}</div><div className="stat-unit">{t('profile.statCount')}</div></div>
-          <div className="stat-box"><div className="stat-num">{Object.values(state.likes).filter(Boolean).length||12}</div><div className="stat-unit">{t('profile.statCheer')}</div></div>
+          <div className="stat-box"><div className="stat-num">{since}</div><div className="stat-unit">{t('profile.statDays')}</div></div>
+          <div className="stat-box"><div className="stat-num">{total}</div><div className="stat-unit">{t('profile.statCount')}</div></div>
+          <div className="stat-box"><div className="stat-num">{Object.values(state.likes).filter(Boolean).length}</div><div className="stat-unit">{t('profile.statCheer')}</div></div>
         </div>
         <div className="card" style={{background:'linear-gradient(135deg,#ecfaf5,#d4f0e8)'}}>
-          <div style={{fontSize:13,color:'#1a3030',lineHeight:1.8,fontStyle:'italic',textAlign:'center'}}>{t('ui.pfSince',{days:(since||47),name:state.user.name})}</div>
+          <div style={{fontSize:13,color:'#1a3030',lineHeight:1.8,fontStyle:'italic',textAlign:'center'}}>{total===0?t('ui.pfNoRecord'):since===0?t('ui.pfStartedToday',{name:state.user.name}):t('ui.pfSince',{days:since,name:state.user.name})}</div>
         </div>
         <div className="card">
           <div className="card-title">{t('home.recentTitle')}</div>
           {state.reports.length===0?(
-            <>
-              <div className="rec-row"><div><div style={{fontSize:13,fontWeight:600,color:'#1a3030'}}>🚶 {tl(ACTS[0])}</div><div style={{fontSize:11,color:'#a0b8b0',marginTop:1}}>{t('demo.today')}</div></div><span className="rec-tag">{t('misc.minutes',{n:30})}</span></div>
-              <div className="rec-row"><div><div style={{fontSize:13,fontWeight:600,color:'#1a3030'}}>🧘 {tl(ACTS[2])}</div><div style={{fontSize:11,color:'#a0b8b0',marginTop:1}}>{t('demo.yest')}</div></div><span className="rec-tag">{t('misc.minutes',{n:15})}</span></div>
-            </>
+            <div style={{fontSize:13,color:'#a0b8b0',padding:'12px 0'}}>{t('home.noRecord')}</div>
           ):(
             state.reports.slice(-4).reverse().map(r=>{const a=ACTS.find(x=>x.id===r.aid);return(
               <div key={r.id} className="rec-row">
```
