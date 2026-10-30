// Builds mobile/www: the reviewed web app with React, the Supabase SDK and the compiled JSX bundled
// locally, so the native shell never loads code from a CDN or a server URL.
// Default target is staging. A production build needs an explicit release approval label,
// a confirmation variable and non-placeholder app IDs, so it cannot be produced by accident.
// Reads the checkout and node_modules only; does not contact services, sign, sync or deploy.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const babel=require('@babel/core');

const TARGETS={
  staging:{ref:'knftduojdalnawvkbelt',keyEnv:'YT_STAGING_PUBLISHABLE_KEY'},
  production:{ref:'eszheiabjwehcbrteqza'}
};
const PLACEHOLDER_ID=/\.dev\.placeholder$/;
const PRODUCTION_CONFIRM='I_HAVE_RELEASE_APPROVAL';
const VENDOR=[
  ['react.production.min.js','react/umd/react.production.min.js'],
  ['react-dom.production.min.js','react-dom/umd/react-dom.production.min.js'],
  ['supabase.js','@supabase/supabase-js/dist/umd/supabase.js'],
  ['capacitor.js','@capacitor/core/dist/capacitor.js'],
  ['capacitor-app.js','@capacitor/app/dist/plugin.js'],
  ['capacitor-browser.js','@capacitor/browser/dist/plugin.js'],
  ['capacitor-secure-storage.js','@aparajita/capacitor-secure-storage/dist/plugin.js']
];
const CDN_TAGS=[
  '<script src="https://cdnjs.cloudflare.com/ajax/libs/react/18.3.1/umd/react.production.min.js"></script>',
  '<script src="https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.3.1/umd/react-dom.production.min.js"></script>',
  '<script src="https://cdnjs.cloudflare.com/ajax/libs/babel-standalone/7.24.7/babel.min.js"></script>',
  '<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.118.0"></script>'
];
const LEGAL_PAGES=['privacy','terms','community-guidelines','contact','account-deletion'];

const compile=code=>babel.transformSync(code,{babelrc:false,configFile:false,presets:['@babel/preset-react'],comments:false}).code;
function once(text,from,to,label,count=1){
  const n=text.split(from).length-1;
  if(n!==count)throw Error('Source anchor changed ('+label+'): found '+n);
  return text.split(from).join(to);
}
function exportLists(root){
  const src=fs.readFileSync(path.join(root,'scripts/build-public.cjs'),'utf8');
  const pick=name=>{const m=src.match(new RegExp('const '+name+'=(\\[[^\\]]*\\]);'));if(!m)throw Error('allowlist '+name+' not found');return vm.runInNewContext(m[1]);};
  return {tops:pick('tops'),dirs:pick('dirs')};
}
function walk(dir,base=dir){
  return fs.readdirSync(dir).flatMap(n=>{const p=path.join(dir,n),s=fs.lstatSync(p);
    if(s.isSymbolicLink())throw Error('Link rejected: '+path.relative(base,p));
    return s.isDirectory()?walk(p,base):[path.relative(base,p)];});
}

function options(argv,env){
  const arg=k=>{const a=argv.find(x=>x.startsWith('--'+k+'='));return a?a.slice(k.length+3):undefined;};
  const target=arg('target')||'staging';
  if(!TARGETS[target])throw Error('Unknown target: '+target);
  return {target,approval:arg('release-approval'),apple:argv.includes('--enable-apple-signin'),env};
}

function build({root,mobile,out,target,approval,apple=false,env,config}){
  const t=TARGETS[target],other=Object.values(TARGETS).find(x=>x!==t);
  config=config||JSON.parse(fs.readFileSync(path.join(mobile,'capacitor.config.json'),'utf8'));
  const scheme=String(config.appId||'');
  if(!/^[a-z][a-z0-9]*(\.[a-z0-9]+)+$/.test(scheme))throw Error('appId must be a lowercase reverse-DNS id');
  if(target==='production'){
    if(env.YT_MOBILE_PRODUCTION_BUILD!==PRODUCTION_CONFIRM||!approval)
      throw Error('Production mobile builds need --release-approval=<label> and YT_MOBILE_PRODUCTION_BUILD='+PRODUCTION_CONFIRM);
    if(PLACEHOLDER_ID.test(scheme))throw Error('Production build refused: appId is still the development placeholder');
  }
  const supabaseUrl='https://'+t.ref+'.supabase.co';
  let key=null;
  if(t.keyEnv){
    key=String(env[t.keyEnv]||'');
    if(!/^sb_publishable_[A-Za-z0-9_-]{10,}$/.test(key))throw Error(t.keyEnv+' must be the staging publishable key (sb_publishable_...)');
  }
  if(fs.existsSync(out))throw Error(path.basename(out)+' already exists; remove it before building');

  const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
  const blocks=[...html.matchAll(/<script\b[^>]*type="text\/babel"[^>]*>([\s\S]*?)<\/script>/g)];
  if(blocks.length!==1)throw Error('Expected one inline JSX block');
  let source=blocks[0][1];
  if(compile(source)!==compile(fs.readFileSync(path.join(root,'app.js'),'utf8')))throw Error('index.html JSX and app.js differ');
  if(!source.includes("const SUPABASE_URL='https://eszheiabjwehcbrteqza.supabase.co';"))throw Error('Production reference missing from source');
  if(source.includes(TARGETS.staging.ref))throw Error('Staging reference found in the web source');

  if(key){
    source=once(source,"const SUPABASE_URL='https://eszheiabjwehcbrteqza.supabase.co';","const SUPABASE_URL='"+supabaseUrl+"';",'url');
    const k=source.match(/const SUPABASE_ANON_KEY='sb_publishable_[A-Za-z0-9_-]+';/g);
    if(!k||k.length!==1)throw Error('Source anchor changed (key)');
    source=source.replace(k[0],()=>"const SUPABASE_ANON_KEY='"+key+"';");
  }
  source=once(source,'window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;',
    'window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, window.YT_NATIVE.clientOptions(SUPABASE_URL)) : null;\nif(supabaseClient)window.YT_NATIVE.attach(supabaseClient);','client');
  source=once(source,'function authRedirectTo(){\n','function authRedirectTo(){\n  return window.YT_NATIVE.redirectUrl;\n','redirect');
  source=once(source,"const {error}=await supabaseClient.auth.signInWithOAuth({\n        provider:'google',\n        options:{redirectTo:authRedirectTo()}\n      });",
    "const {error}=await window.YT_NATIVE.oauthSignIn(provider==='apple'?'apple':'google');",'google');
  // One handler for both providers; Apple stays hidden unless the build enables it (see docs/mobile-ids-and-auth.md).
  source=once(source,'const handleGoogleLogin=async()=>{','const handleGoogleLogin=async(provider)=>{','provider');
  source=once(source,"      setAuthError(t('msg.googleConfig'));",
    "      setAuthError(provider==='apple'?window.YT_NATIVE.text('appleFailed'):t('msg.googleConfig'));",'provider error');
  source=once(source,"            onGoogleLogin();\n          }}>{t('auth.google')}</button>",
    "            onGoogleLogin();\n          }}>{t('auth.google')}</button>\n"+
    "          {window.YT_NATIVE.appleEnabled&&<button type=\"button\" className=\"yt-apple-signin\" disabled={authLoading} onClick={()=>{\n"+
    "            if(mode==='register'&&!age13){setLocalError(t('legal.age13Need'));return;}\n"+
    "            onGoogleLogin('apple');\n"+
    "          }}>{window.YT_NATIVE.text('apple')}</button>}",'apple button',2);
  // The record screen waits until the new record is committed to the device file; a failure is not praised.
  source=once(source,"    setSt(s=>({...s,reports:nrs,...(willPost?{posted:[...(s.posted||[]),nr.id]}:{})}));\n",
    "    setSt(s=>({...s,reports:nrs,...(willPost?{posted:[...(s.posted||[]),nr.id]}:{})}));\n"+
    "    if(!(await window.YT_NATIVE_STORAGE.whenSaved('yurutore-v6-'))){setShowRep(false);setPostAfter(false);return;}\n",'record save');
  const bundle=compile(source);

  const csp=["default-src 'self'","script-src 'self'","style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: "+supabaseUrl+' https://*.googleusercontent.com',"connect-src "+supabaseUrl,
    "font-src 'self'","object-src 'none'","base-uri 'self'","frame-src 'none'","form-action 'none'"].join('; ');
  const native=['vendor/capacitor.js','vendor/capacitor-app.js','vendor/capacitor-browser.js','vendor/capacitor-secure-storage.js',
    'native-config.js','native-bridge.js','native-storage.js'];
  // native-storage.js starts app.bundle.js once stored records are restored.
  let page=html.replace(blocks[0][0],()=>'');
  page=once(page,CDN_TAGS.join('\n'),[...native,'vendor/react.production.min.js','vendor/react-dom.production.min.js','vendor/supabase.js']
    .map(s=>'<script src="'+s+'"></script>').join('\n'),'cdn');
  page=once(page,'<meta name="viewport" content="width=device-width,initial-scale=1.0"/>',
    '<meta name="viewport" content="width=device-width,initial-scale=1.0,viewport-fit=cover"/>\n<meta http-equiv="Content-Security-Policy" content="'+csp+'"/>\n<meta name="yt-app" content="app.bundle.js"/>','viewport');
  // Sign in with Apple button (shown only when the build enables Apple and runs on iOS): black, full width, system font.
  page=once(page,'</head>','<style>.yt-apple-signin{display:block;width:100%;margin:8px 0;padding:12px;border:none;border-radius:14px;background:#000;color:#fff;font:600 15px -apple-system,BlinkMacSystemFont,sans-serif;cursor:pointer}.yt-apple-signin:disabled{opacity:.5}</style>\n</head>','apple style');

  const {tops,dirs}=exportLists(root);
  fs.mkdirSync(out);
  const copy=rel=>{const s=path.join(root,rel),d=path.join(out,rel);const st=fs.lstatSync(s);
    if(st.isSymbolicLink())throw Error('Link rejected: '+rel);
    if(st.isDirectory()){for(const n of fs.readdirSync(s))copy(path.join(rel,n));return;}
    if(/\.(md|txt)$/i.test(rel))return;
    fs.mkdirSync(path.dirname(d),{recursive:true});fs.copyFileSync(s,d,fs.constants.COPYFILE_EXCL);};
  for(const rel of [...tops.filter(n=>!['index.html','app.js','_headers'].includes(n)),...dirs])copy(rel);
  for(const name of LEGAL_PAGES){
    const p=path.join(out,name,'index.html');
    fs.writeFileSync(p,once(fs.readFileSync(p,'utf8'),'<script src="../legal/legal.js"></script>',
      [...native.map(s=>'../'+s),'../legal/legal.js'].map(s=>'<script src="'+s+'"></script>').join('\n'),'legal '+name));
  }
  fs.mkdirSync(path.join(out,'vendor'));
  for(const [name,rel] of VENDOR)fs.copyFileSync(path.join(mobile,'node_modules',rel),path.join(out,'vendor',name));
  for(const name of ['native-bridge.js','native-storage.js'])fs.copyFileSync(path.join(mobile,'src',name),path.join(out,name));
  const legal=fs.readFileSync(path.join(root,'legal','legal.js'),'utf8').match(/SUPPORT_EMAIL:\s*'([^']+)'/);
  const nativeConfig={target,supabaseUrl,redirectUrl:scheme+'://auth/callback',
    oauthProviders:apple?['google','apple']:['google'],allowedMail:legal?[legal[1]]:[],allowedExternalOrigins:[]};
  fs.writeFileSync(path.join(out,'native-config.js'),'window.YT_NATIVE_CONFIG=Object.freeze('+JSON.stringify(nativeConfig)+');\n');
  fs.writeFileSync(path.join(out,'app.bundle.js'),bundle);
  fs.writeFileSync(path.join(out,'index.html'),page);

  const files=walk(out);
  for(const rel of files){
    if(!/\.(html|js|css|json)$/i.test(rel))continue;
    const text=fs.readFileSync(path.join(out,rel),'utf8');
    if(text.includes(other.ref))throw Error('Other project reference in '+rel);
    if(/\.html$/i.test(rel)&&/<script\b[^>]*\bsrc="(https?:)?\/\//i.test(text))throw Error('Remote script in '+rel);
    if(/\.html$/i.test(rel)&&/type="text\/babel"/.test(text))throw Error('Runtime JSX left in '+rel);
  }
  fs.writeFileSync(path.join(out,'build-info.json'),JSON.stringify({target,supabaseUrl,appId:scheme,files:files.length+1},null,2)+'\n');
  return {target,supabaseUrl,appId:scheme,files:files.length+1};
}

module.exports={build,options,TARGETS,PRODUCTION_CONFIRM};
if(require.main===module){
  const mobile=path.resolve(__dirname,'..');
  const o=options(process.argv.slice(2),process.env);
  const r=build({root:path.resolve(mobile,'..'),mobile,out:path.join(mobile,'www'),...o});
  console.log('Built mobile/www for '+r.target+' ('+r.files+' files, '+r.appId+'). Not synced, signed or deployed.');
}
