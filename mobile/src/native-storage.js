/* Device storage for the native shell (loaded after native-bridge.js, before the app bundle).
   Records: the web app keeps its data in localStorage, which the OS may clear inside a WebView.
     Every app key ("yurutore-…" / "yurutore_…") is mirrored to a file in app-private storage that is
     excluded from backup (iOS Library/NoCloud; Android files dir, excluded by data_extraction_rules).
     Each save writes the other of two slot files and then deletes the previous one, so at most one
     committed copy exists and an interrupted write leaves the last committed copy intact.
     Removed keys are listed in a tombstone file written before the slot, so an older copy can never
     bring back data that was deleted later (for example after account deletion).
     On start the copy is restored only if localStorage was wiped; the app starts afterwards.
     Only "file does not exist" counts as missing. Any other read error, or a damaged file with no
     committed copy, stops restoring and writing so nothing is overwritten. Failures are shown and
     never reported as saved; the app's record screen waits for a committed save (whenSaved).
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
  var DIR='LIBRARY_NO_CLOUD',SLOTS=['yt-records-a.json','yt-records-b.json'],TOMB='yt-records-removed.json',MARKER='yt-install.json';
  var NOT_FOUND='OS-PLUG-FILE-0008';   // @capacitor/filesystem "file does not exist" on Android and iOS
  var GEN_KEY='yt-native-mirror-gen',SESSION_PREFIX='yt-session_';
  var AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY=3;   // KeychainAccess.afterFirstUnlockThisDeviceOnly
  // The build marks the app page with <meta name="yt-app" content="app.bundle.js"> ahead of the scripts:
  // these scripts run in <head>, before #root exists, so the page cannot be recognised by its body.
  var appMeta=document.querySelector('meta[name="yt-app"]');
  var appBundle=appMeta&&appMeta.getAttribute('content');
  var mainPage=!!appBundle;
  var store=window.localStorage;
  var proto=Object.getPrototypeOf(store);
  var rawSet=proto.setItem,rawRemove=proto.removeItem,rawClear=proto.clear;
  var state={status:'idle',gen:0,restored:false,flushing:false,dirty:false,blocked:false,changes:0,saved:0};
  var tomb={};            // key -> generation in which it was removed
  var waiters=[];
  var retryTimer=null,debounce=null;

  function mirrored(key){return typeof key==='string'&&/^yurutore[-_]/.test(key);}
  function missing(e){return !!e&&e.code===NOT_FOUND;}
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
  /* A record that is not yet committed stays in the app (it is not lost and must not be entered again);
     saving is retried automatically and the user is told once it is safe. */
  function pendingNotice(){
    clearAlert('yt-native-save-ok');
    alertBox('yt-native-save-error','記録はアプリ内に残っていますが、端末への保存がまだ完了していません。自動で保存し直しています。もう一度記録する必要はありません。空き容量も確認してください。',
      "Your record is still in the app, but it has not been saved on this device yet. We're retrying automatically, so there's no need to record it again. Please also check free space.");
  }
  function savedAfterFailure(){
    clearAlert('yt-native-save-error');
    alertBox('yt-native-save-ok','記録を端末に保存しました。','Your record has been saved on this device.');
    var el=document.getElementById('yt-native-save-ok');el.setAttribute('role','status');
    setTimeout(function(){clearAlert('yt-native-save-ok');},6000);
  }
  function restoreFailed(){
    state.blocked=true;state.status='restore-failed';
    alertBox('yt-native-restore-error','端末に保存した記録を読み込めませんでした。アプリを再起動してください。保存済みの記録は消していません。',
      "We couldn't load the records saved on this device. Please restart the app; the saved copy has not been deleted.");
    settle(false,Infinity);
  }

  function snapshot(){
    var keys={};
    for(var i=0;i<store.length;i++){var k=store.key(i);if(mirrored(k))keys[k]=store.getItem(k);}
    return keys;
  }
  /* Returns {kind:'missing'|'corrupt'|'error'|'valid', data}. */
  async function readJson(name,check){
    var r;
    try{r=await FS.readFile({path:name,directory:DIR,encoding:'utf8'});}
    catch(e){return {kind:missing(e)?'missing':'error'};}
    try{var d=JSON.parse(r.data);return check(d)?{kind:'valid',data:d}:{kind:'corrupt'};}catch(e){return {kind:'corrupt'};}
  }
  function validSlot(s){
    if(!s||s.format!==1||typeof s.gen!=='number'||!s.keys||typeof s.keys!=='object')return false;
    for(var k in s.keys)if(!mirrored(k)||typeof s.keys[k]!=='string')return false;
    return true;
  }
  function validTomb(t){
    if(!t||t.format!==1||!t.keys||typeof t.keys!=='object')return false;
    for(var k in t.keys)if(!mirrored(k)||typeof t.keys[k]!=='number')return false;
    return true;
  }

  function settle(ok,upto){
    waiters=waiters.filter(function(w){
      if(w.need===null||w.need>upto)return true;
      clearTimeout(w.timer);w.resolve(ok);return false;
    });
  }
  /* Resolves true once a change to a key starting with prefix (made after this call) is committed to the file. */
  function whenSaved(prefix,ms){
    if(!isNative||!FS||!mainPage)return Promise.resolve(true);
    if(state.blocked)return Promise.resolve(false);
    return new Promise(function(resolve){
      var w={prefix:prefix||'yurutore-v6-',need:null,resolve:resolve};
      w.timer=setTimeout(function(){
        waiters=waiters.filter(function(x){return x!==w;});
        pendingNotice();
        resolve(false);
      },ms||cfg.saveWaitMs||6000);
      waiters.push(w);
    });
  }
  /* A record whose device save failed. Submitting the same record again (same activity, note and photo
     presence) retries that record instead of adding a second one; any committed save clears it. */
  var pending=null;
  function markPending(r){pending=r?{id:r.id,aid:r.aid,note:r.note||'',photo:!!r.photo}:null;}
  function pendingRecord(a){
    if(!pending||!a)return null;
    return pending.aid===a.aid&&pending.note===String(a.note||'')&&pending.photo===!!a.photo?pending:null;
  }
  function changed(key,removed){
    state.changes++;
    // The generation that will first lack the key (one later if a save is already in flight with the old contents).
    if(removed)tomb[key]=state.gen+(state.flushing?2:1);else delete tomb[key];
    waiters.forEach(function(w){if(w.need===null&&key.indexOf(w.prefix)===0)w.need=state.changes;});
  }

  async function flush(){
    if(!state.restored||state.blocked)return;
    if(state.flushing){state.dirty=true;return;}
    state.flushing=true;state.dirty=false;
    var gen=state.gen+1,upto=state.changes,ok=false;
    try{
      if(Object.keys(tomb).length)
        await FS.writeFile({path:TOMB,directory:DIR,encoding:'utf8',recursive:true,data:JSON.stringify({format:1,keys:tomb})});
      await FS.writeFile({path:SLOTS[gen%2],directory:DIR,encoding:'utf8',recursive:true,
        data:JSON.stringify({format:1,gen:gen,savedAt:Date.now(),keys:snapshot()})});
      state.gen=gen;rawSet.call(store,GEN_KEY,String(gen));ok=true;
      var recovered=state.status==='save-failed'||!!document.getElementById('yt-native-save-error');
      state.saved=upto;state.status='saved';pending=null;
      if(recovered)savedAfterFailure();
      try{await FS.deleteFile({path:SLOTS[(gen+1)%2],directory:DIR});}
      catch(e){if(!missing(e))throw e;}
      // Only the committed copy remains: removals older than it are already reflected in it.
      for(var k in tomb)if(tomb[k]<gen)delete tomb[k];
      if(retryTimer){clearTimeout(retryTimer);retryTimer=null;}
    }catch(e){
      if(ok){   // committed, but the previous copy is still there: the tombstone keeps it from restoring removed data
        state.status='cleanup-failed';
      }else{
      state.status='save-failed';
      pendingNotice();
      }
      if(!retryTimer)retryTimer=setTimeout(function(){retryTimer=null;flush();},cfg.saveRetryMs||30000);
    }finally{
      state.flushing=false;
      settle(ok,upto);
      if(state.dirty)flush();
    }
  }
  function schedule(now){
    if(debounce)clearTimeout(debounce);
    debounce=setTimeout(function(){debounce=null;flush();},now?0:250);
  }

  async function restore(){
    var known=store.getItem(GEN_KEY);
    var t=await readJson(TOMB,validTomb);
    if(state.blocked)return;   // gave up waiting and the app is already running
    if(known!==null){
      // localStorage survived: it is the newer copy and nothing needs to be read back.
      state.gen=parseInt(known,10)||0;
      if(t.kind==='valid')for(var k0 in t.data.keys)if(!(k0 in tomb))tomb[k0]=t.data.keys[k0];
      state.restored=true;state.status='intact';
      return;
    }
    var a=await readJson(SLOTS[0],validSlot),b=await readJson(SLOTS[1],validSlot);
    if(state.blocked)return;
    var parts=[a,b,t];
    if(parts.some(function(p){return p.kind==='error';})||t.kind==='corrupt'){restoreFailed();return;}
    var valid=[a,b].filter(function(p){return p.kind==='valid';}).map(function(p){return p.data;});
    if(!valid.length){
      if(a.kind==='corrupt'||b.kind==='corrupt'){restoreFailed();return;}   // never treat a damaged copy as a new install
      state.gen=0;rawSet.call(store,GEN_KEY,'0');state.restored=true;state.status='empty';return;
    }
    var best=valid.length===2&&valid[1].gen>valid[0].gen?valid[1]:valid[0];
    var removed=t.kind==='valid'?t.data.keys:{};
    try{
      for(var k in best.keys){
        if(k in removed&&removed[k]>best.gen)continue;   // deleted after this copy was written
        rawSet.call(store,k,best.keys[k]);
      }
      for(var r in removed)tomb[r]=removed[r];
      rawSet.call(store,GEN_KEY,String(best.gen));
      state.gen=best.gen;state.restored=true;state.status='restored';
    }catch(e){
      restoreFailed();   // do not overwrite the good copy with a partial one
    }
  }

  /* ── Session ── */
  var sessionReady=null;
  async function sessionInit(){
    await SS.setKeyPrefix(SESSION_PREFIX);
    await SS.setDefaultKeychainAccess(AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY);
    await SS.setSynchronize(false);
    // iOS keeps Keychain items after the app is deleted: clear them on the first start of a fresh install.
    // Only a missing marker means a fresh install; any other error stops here instead of signing the user out.
    var fresh=false;
    try{await FS.stat({path:MARKER,directory:DIR});}
    catch(e){if(missing(e))fresh=true;else throw e;}
    if(fresh){
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
    proto.setItem=function(k,v){rawSet.call(this,k,v);if(this===store&&mirrored(k)){changed(k,false);schedule(false);}};
    proto.removeItem=function(k){var had=this===store&&mirrored(k)&&store.getItem(k)!==null;rawRemove.call(this,k);
      if(had){changed(k,true);schedule(true);}};
    // The app never clears all storage (it would remove other accounts' records); refuse quietly instead of mirroring an empty copy.
    proto.clear=function(){if(this===store){console.warn('[native] localStorage.clear() ignored');return;}return rawClear.call(this);};
    var timeout=new Promise(function(r){setTimeout(function(){r('timeout');},cfg.restoreTimeoutMs||8000);});
    ready=Promise.race([restore().then(function(){return 'done';}),timeout]).then(function(how){
      if(how==='timeout'&&!state.restored&&!state.blocked)restoreFailed();
      if(App)App.addListener('appStateChange',function(s){if(s&&!s.isActive)schedule(true);});
    });
  }else ready=Promise.resolve();

  function startApp(){var s=document.createElement('script');s.src=appBundle;document.body.appendChild(s);}
  if(mainPage)ready.then(function(){
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',startApp);else startApp();
  });

  window.YT_NATIVE_STORAGE=Object.freeze({
    ready:ready,
    status:function(){return {status:state.status,gen:state.gen,blocked:state.blocked};},
    flush:flush,
    whenSaved:whenSaved,markPending:markPending,pendingRecord:pendingRecord,
    sessionStorage:isNative&&SS&&FS?sessionStorageAdapter:null,
    clearSession:isNative&&SS&&FS?clearSession:function(){return Promise.resolve();},
    platform:platform
  });
})();
