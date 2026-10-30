/* Device storage for the native shell (loaded after native-bridge.js, before the app bundle).
   Records: the web app keeps its data in localStorage, which the OS may clear inside a WebView.
     Every app key ("yurutore-…" / "yurutore_…") is mirrored to a file in app-private storage that is
     excluded from backup (iOS Library/NoCloud; Android files dir, excluded by data_extraction_rules).
     Two slot files are written alternately so an interrupted write never replaces the last good copy.
     On start the copy is restored only if localStorage was wiped, and the app starts afterwards.
     A failed write or restore is shown to the user and never reported as saved.
   Session: the Supabase session goes to the Keychain (iOS, this device only, no iCloud sync) or the
     Android Keystore, never to localStorage. It is cleared on sign-out and after a reinstall. */
(function(){
  'use strict';
  var cfg=window.YT_NATIVE_CONFIG||{};
  var cap=window.Capacitor;
  var isNative=!!(cap&&cap.isNativePlatform&&cap.isNativePlatform());
  var platform=cap&&cap.getPlatform?cap.getPlatform():'web';
  var App=window.capacitorApp&&window.capacitorApp.App;
  var SS=window.capacitorSecureStorage&&window.capacitorSecureStorage.SecureStorage;
  var FS=isNative&&cap.registerPlugin?cap.registerPlugin('Filesystem'):null;
  var DIR='LIBRARY_NO_CLOUD',SLOTS=['yt-records-a.json','yt-records-b.json'],MARKER='yt-install.json';
  var GEN_KEY='yt-native-mirror-gen',SESSION_PREFIX='yt-session_';
  var AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY=3;   // KeychainAccess.afterFirstUnlockThisDeviceOnly
  var mainPage=!!document.getElementById('root');
  var store=window.localStorage;
  var proto=Object.getPrototypeOf(store);
  var rawSet=proto.setItem,rawRemove=proto.removeItem,rawClear=proto.clear;
  var state={status:'idle',gen:0,restored:false,flushing:false,dirty:false,blocked:false};
  var retryTimer=null,debounce=null;

  function mirrored(key){return typeof key==='string'&&/^yurutore[-_]/.test(key);}
  function lang(){try{return (store.getItem('yurutore_language')||document.documentElement.lang||'ja')==='en'?'en':'ja';}catch(e){return 'ja';}}
  function alertBox(id,ja,en){
    var el=document.getElementById(id);
    if(!el){
      el=document.createElement('div');el.id=id;el.setAttribute('role','alert');
      el.style.cssText='position:fixed;left:12px;right:12px;bottom:calc(12px + env(safe-area-inset-bottom,0px));z-index:2147483647;'+
        'background:#fff5f0;color:#a4532f;border:1.5px solid #f0c9b6;border-radius:14px;padding:12px 14px;font-size:13px;font-weight:700;';
      (document.body||document.documentElement).appendChild(el);
    }
    el.textContent=lang()==='en'?en:ja;
  }
  function clearAlert(id){var el=document.getElementById(id);if(el)el.remove();}

  function snapshot(){
    var keys={};
    for(var i=0;i<store.length;i++){var k=store.key(i);if(mirrored(k))keys[k]=store.getItem(k);}
    return keys;
  }
  async function readSlot(name){
    try{
      var r=await FS.readFile({path:name,directory:DIR,encoding:'utf8'});
      var s=JSON.parse(r.data);
      if(!s||s.format!==1||typeof s.gen!=='number'||!s.keys||typeof s.keys!=='object')return null;
      for(var k in s.keys)if(!mirrored(k)||typeof s.keys[k]!=='string')return null;
      return s;
    }catch(e){return null;}
  }

  async function flush(){
    if(!state.restored||state.blocked)return;
    if(state.flushing){state.dirty=true;return;}
    state.flushing=true;state.dirty=false;
    var gen=state.gen+1;
    try{
      await FS.writeFile({path:SLOTS[gen%2],directory:DIR,encoding:'utf8',recursive:true,
        data:JSON.stringify({format:1,gen:gen,savedAt:Date.now(),keys:snapshot()})});
      state.gen=gen;rawSet.call(store,GEN_KEY,String(gen));
      state.status='saved';clearAlert('yt-native-save-error');
      if(retryTimer){clearTimeout(retryTimer);retryTimer=null;}
    }catch(e){
      state.status='save-failed';
      alertBox('yt-native-save-error','記録を端末に保存できませんでした。空き容量を確認してください。自動でもう一度試します。',
        "Couldn't save your records on this device. Please check free space; we'll try again automatically.");
      if(!retryTimer)retryTimer=setTimeout(function(){retryTimer=null;flush();},30000);
    }finally{
      state.flushing=false;
      if(state.dirty)flush();
    }
  }
  function schedule(now){
    if(debounce)clearTimeout(debounce);
    debounce=setTimeout(function(){debounce=null;flush();},now?0:250);
  }

  async function restore(){
    var a=await readSlot(SLOTS[0]),b=await readSlot(SLOTS[1]);
    var best=a&&b?(a.gen>=b.gen?a:b):(a||b);
    // Gave up waiting and the app is already running: do not change its data underneath it.
    if(state.blocked)return;
    var known=store.getItem(GEN_KEY);
    if(known!==null){
      // localStorage survived: it is the newer copy. Never bring back keys it no longer has (e.g. after account deletion).
      state.gen=Math.max(parseInt(known,10)||0,best?best.gen:0);
      state.restored=true;state.status='intact';
      return;
    }
    if(!best){state.gen=0;rawSet.call(store,GEN_KEY,'0');state.restored=true;state.status='empty';return;}
    try{
      for(var k in best.keys)rawSet.call(store,k,best.keys[k]);
      rawSet.call(store,GEN_KEY,String(best.gen));
      state.gen=best.gen;state.restored=true;state.status='restored';
    }catch(e){
      // Do not overwrite the good copy with a partial one.
      state.blocked=true;state.status='restore-failed';
      alertBox('yt-native-restore-error','端末に保存した記録を読み込めませんでした。アプリを再起動してください。保存済みの記録は消していません。',
        "We couldn't load the records saved on this device. Please restart the app; the saved copy has not been deleted.");
    }
  }

  /* ── Session ── */
  var sessionReady=null;
  async function sessionInit(){
    await SS.setKeyPrefix(SESSION_PREFIX);
    await SS.setDefaultKeychainAccess(AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY);
    await SS.setSynchronize(false);
    // iOS keeps Keychain items after the app is deleted: clear them on the first start of a fresh install.
    var installed=false;
    try{await FS.stat({path:MARKER,directory:DIR});installed=true;}catch(e){}
    if(!installed){
      await SS.clear();
      await FS.writeFile({path:MARKER,directory:DIR,encoding:'utf8',recursive:true,data:'{"format":1}'});
    }
    // Earlier builds kept the session in localStorage: never leave it there.
    for(var i=store.length-1;i>=0;i--){var k=store.key(i);if(k&&k.indexOf('sb-')===0)rawRemove.call(store,k);}
  }
  function session(){
    // A failed setup is retried on the next call instead of failing every later call.
    if(!sessionReady)sessionReady=sessionInit().catch(function(e){sessionReady=null;throw e;});
    return sessionReady;
  }
  var sessionStorageAdapter={
    getItem:async function(k){await session();return SS.getItem(k);},
    setItem:async function(k,v){await session();await SS.setItem(k,v);},
    removeItem:async function(k){await session();await SS.removeItem(k);}
  };
  async function clearSession(){await session();await SS.clear();}

  /* ── Start ── */
  var ready;
  if(isNative&&FS&&mainPage){
    proto.setItem=function(k,v){rawSet.call(this,k,v);if(this===store&&mirrored(k))schedule(false);};
    proto.removeItem=function(k){rawRemove.call(this,k);if(this===store&&mirrored(k))schedule(true);};
    // The app never clears all storage (it would remove other accounts' records); refuse quietly instead of mirroring an empty copy.
    proto.clear=function(){if(this===store){console.warn('[native] localStorage.clear() ignored');return;}return rawClear.call(this);};
    var timeout=new Promise(function(r){setTimeout(function(){r('timeout');},cfg.restoreTimeoutMs||8000);});
    ready=Promise.race([restore().then(function(){return 'done';}),timeout]).then(function(how){
      if(how==='timeout'&&!state.restored){
        state.blocked=true;state.status='restore-failed';
        alertBox('yt-native-restore-error','端末に保存した記録を読み込めませんでした。アプリを再起動してください。保存済みの記録は消していません。',
          "We couldn't load the records saved on this device. Please restart the app; the saved copy has not been deleted.");
      }
      if(App)App.addListener('appStateChange',function(s){if(s&&!s.isActive)schedule(true);});
    });
  }else ready=Promise.resolve();

  if(mainPage)ready.then(function(){
    var s=document.createElement('script');s.src='app.bundle.js';document.body.appendChild(s);
  });

  window.YT_NATIVE_STORAGE=Object.freeze({
    ready:ready,
    status:function(){return {status:state.status,gen:state.gen,blocked:state.blocked};},
    flush:flush,
    sessionStorage:isNative&&SS&&FS?sessionStorageAdapter:null,
    clearSession:isNative&&SS&&FS?clearSession:function(){return Promise.resolve();},
    platform:platform
  });
})();
