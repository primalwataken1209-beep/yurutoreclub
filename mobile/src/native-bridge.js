/* Native shell glue for the bundled web app (loaded before app.bundle.js and on the legal pages).
   - API calls may only reach the build target's Supabase project.
   - OAuth uses PKCE in the system browser and returns only through the exact callback URL.
   - Links leaving the bundle are limited to the allowlist in native-config.js.
   - Android back closes the topmost sheet or screen before leaving the app.
   Holds no keys or tokens of its own; the SDK keeps the session as on the web. */
(function(){
  'use strict';
  var cfg=window.YT_NATIVE_CONFIG;
  if(!cfg)throw new Error('native-config.js missing');
  var cap=window.Capacitor;
  var App=window.capacitorApp&&window.capacitorApp.App;
  var Browser=window.capacitorBrowser&&window.capacitorBrowser.Browser;
  var isNative=!!(cap&&cap.isNativePlatform&&cap.isNativePlatform());
  var callback=new URL(cfg.redirectUrl);
  var client=null,launchChecked=false;

  function sameCallback(u){
    return u.protocol===callback.protocol&&u.host===callback.host&&u.pathname===callback.pathname;
  }
  function parse(raw){try{return new URL(raw);}catch(e){return null;}}

  function guardedFetch(input,init){
    var url=parse(typeof input==='string'?input:(input&&input.url));
    if(!url||url.origin!==cfg.supabaseUrl)return Promise.reject(new Error('Blocked request outside the build target'));
    return window.fetch(input,init);
  }

  function clientOptions(url){
    if(url!==cfg.supabaseUrl)throw new Error('Supabase URL does not match the build target');
    return {auth:{flowType:'pkce',detectSessionInUrl:false,persistSession:true,autoRefreshToken:true},
            global:{fetch:guardedFetch}};
  }

  /* The web app only shows errors from the call that opened the browser, so failures on return are shown here. */
  function authFailed(){
    var ja=true;
    try{ja=(localStorage.getItem('yurutore_language')||document.documentElement.lang||'ja')!=='en';}catch(e){}
    var old=document.getElementById('yt-native-auth-error');if(old)old.remove();
    var el=document.createElement('div');
    el.id='yt-native-auth-error';el.setAttribute('role','alert');
    el.textContent=ja?'ログインを完了できませんでした。もう一度お試しください。':'Sign-in did not complete. Please try again.';
    el.style.cssText='position:fixed;left:12px;right:12px;top:calc(12px + env(safe-area-inset-top,0px));z-index:2147483647;'+
      'background:#fff5f0;color:#a4532f;border:1.5px solid #f0c9b6;border-radius:14px;padding:12px 14px;font-size:13px;font-weight:700;';
    el.addEventListener('click',function(){el.remove();});
    (document.body||document.documentElement).appendChild(el);
    setTimeout(function(){el.remove();},8000);
  }

  async function handleUrl(raw){
    var u=parse(raw);
    if(!u||!sameCallback(u))return false;
    if(Browser){try{await Browser.close();}catch(e){}}
    var code=u.searchParams.get('code');
    if(u.searchParams.get('error')||!code||!client){authFailed();return true;}
    var r;
    try{r=await client.auth.exchangeCodeForSession(code);}catch(e){r={error:e};}
    if(!r||r.error)authFailed();
    return true;
  }

  async function oauthSignIn(provider){
    if(!client)return {error:new Error('client not ready')};
    if((cfg.oauthProviders||[]).indexOf(provider)<0)return {error:new Error(provider+' sign-in is not enabled in this build')};
    if(!Browser)return {error:new Error('Browser plugin unavailable')};
    var r=await client.auth.signInWithOAuth({provider:provider,options:{redirectTo:cfg.redirectUrl,skipBrowserRedirect:true}});
    if(r.error)return {error:r.error};
    var u=parse(r.data&&r.data.url);
    if(!u||u.origin!==cfg.supabaseUrl||u.pathname!=='/auth/v1/authorize'||
       u.searchParams.get('redirect_to')!==cfg.redirectUrl||!u.searchParams.get('code_challenge')||
       u.searchParams.get('code_challenge_method')!=='s256')  // the SDK falls back to "plain" without WebCrypto
      return {error:new Error('Unexpected authorize URL')};
    await Browser.open({url:u.href});
    return {error:null};
  }

  function attach(c){
    client=c;
    if(App&&isNative&&!launchChecked){
      launchChecked=true;
      App.addListener('appUrlOpen',function(e){handleUrl(e&&e.url);});
      App.getLaunchUrl().then(function(r){if(r&&r.url)handleUrl(r.url);}).catch(function(){});
      // Timers do not run while the app is in the background: refresh the session only while active.
      App.addListener('appStateChange',function(s){
        if(s&&s.isActive)c.auth.startAutoRefresh();else c.auth.stopAutoRefresh();
      });
    }
  }

  /* Returns how the link should be handled: 'inside', 'browser', 'system' or 'blocked'. */
  function classify(raw){
    var u=parse(raw);
    if(!u)return 'blocked';
    // Compare scheme and host: on iOS the bundle is served from capacitor://localhost, whose URL origin is "null".
    if(u.protocol===location.protocol&&u.host===location.host)return 'inside';
    if(u.protocol==='mailto:')return (cfg.allowedMail||[]).indexOf(decodeURIComponent(u.pathname))>=0?'system':'blocked';
    if(u.protocol==='https:'&&(cfg.allowedExternalOrigins||[]).indexOf(u.origin)>=0)return 'browser';
    return 'blocked';
  }
  function follow(raw){
    var kind=classify(raw),u=parse(raw);
    if(kind==='inside')location.assign(u.href);
    else if(kind==='system')location.href=u.href;
    else if(kind==='browser'&&Browser)Browser.open({url:u.href});
    else console.warn('[native] link blocked');
    return kind;
  }
  document.addEventListener('click',function(e){
    var a=e.target&&e.target.closest&&e.target.closest('a[href]');
    if(!a)return;
    var kind=classify(a.href);
    if(kind==='inside'&&a.target!=='_blank')return;  // ordinary in-bundle navigation
    e.preventDefault();
    follow(a.href);
  },true);
  window.open=function(url){follow(new URL(String(url),location.href).href);return null;};

  /* Android back: close what is on top, then go back a page, then leave the app in the background. */
  function back(canGoBack){
    var top=document.querySelector('.overlay, .room-modal-backdrop, .tc-modal-back');
    if(top){top.click();return 'closed';}
    var screen=document.querySelector('.room-full-back');
    if(screen){screen.click();return 'screen';}
    if(canGoBack&&location.pathname!=='/'&&location.pathname!=='/index.html'){history.back();return 'history';}
    if(App)App.minimizeApp();
    return 'minimized';
  }
  if(App&&isNative)App.addListener('backButton',function(e){back(!!(e&&e.canGoBack));});

  window.YT_NATIVE=Object.freeze({target:cfg.target,redirectUrl:cfg.redirectUrl,clientOptions:clientOptions,
    attach:attach,oauthSignIn:oauthSignIn,handleUrl:handleUrl,classify:classify,back:back});
})();
