const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {build,PRODUCTION_CONFIRM}=require('../scripts/build-mobile.cjs');
const mobile=path.resolve(__dirname,'..'),root=path.resolve(mobile,'..');
const KEY='sb_publishable_TESTONLY_not_a_real_key';
const STAGING='knftduojdalnawvkbelt',PRODUCTION='eszheiabjwehcbrteqza';
function tmp(t){const d=fs.mkdtempSync(path.join(os.tmpdir(),'yt-mobile-'));t.after(()=>fs.rmSync(d,{recursive:true,force:true}));return d;}
const run=(t,o={})=>{const out=path.join(tmp(t),'www');return {out,result:build({root,mobile,out,target:'staging',env:{YT_STAGING_PUBLISHABLE_KEY:KEY},...o})};};
function files(dir,base=dir){return fs.readdirSync(dir).flatMap(n=>{const p=path.join(dir,n);return fs.statSync(p).isDirectory()?files(p,base):[path.relative(base,p).split(path.sep).join('/')];}).sort();}

test('staging is the default target and bundles everything locally',t=>{
  const {out,result}=run(t);
  assert.equal(result.target,'staging');
  const html=fs.readFileSync(path.join(out,'index.html'),'utf8');
  assert.doesNotMatch(html,/<script[^>]*src="(https?:)?\/\//);
  assert.doesNotMatch(html,/text\/babel|babel\.min\.js|cdnjs|jsdelivr/);
  assert.match(html,/viewport-fit=cover/);
  assert.match(html,new RegExp("connect-src https://"+STAGING+"\\.supabase\\.co;"));
  assert.match(html,/script-src 'self';/);
  const bundle=fs.readFileSync(path.join(out,'app.bundle.js'),'utf8');
  assert.ok(bundle.includes("'https://"+STAGING+".supabase.co'")&&bundle.includes(KEY));
  assert.ok(bundle.includes('window.YT_NATIVE.clientOptions(SUPABASE_URL)'));
  assert.ok(bundle.includes("window.YT_NATIVE.oauthSignIn('google')"));
  for(const rel of files(out).filter(f=>/\.(html|js|css|json)$/.test(f)))
    assert.ok(!fs.readFileSync(path.join(out,rel),'utf8').includes(PRODUCTION),'production reference in '+rel);
  const cfg=fs.readFileSync(path.join(out,'native-config.js'),'utf8');
  assert.match(cfg,/"redirectUrl":"club\.yurutore\.dev\.placeholder:\/\/auth\/callback"/);
  assert.match(cfg,/"oauthProviders":\["google"\]/);assert.match(cfg,/"allowedExternalOrigins":\[\]/);
});
test('static files and vendored libraries are byte-identical to their sources',t=>{
  const {out}=run(t);
  const list=files(out);
  assert.ok(!list.includes('_headers')&&!list.includes('app.js'),'web-only files are not shipped');
  for(const rel of list.filter(f=>!/^(index\.html|app\.bundle\.js|native-.*|build-info\.json|vendor\/.*)$/.test(f)&&!/\/index\.html$/.test(f)))
    assert.deepEqual(fs.readFileSync(path.join(out,rel)),fs.readFileSync(path.join(root,rel)),rel);
  for(const [name,rel] of [['react.production.min.js','react/umd/react.production.min.js'],['supabase.js','@supabase/supabase-js/dist/umd/supabase.js'],['capacitor.js','@capacitor/core/dist/capacitor.js']])
    assert.deepEqual(fs.readFileSync(path.join(out,'vendor',name)),fs.readFileSync(path.join(mobile,'node_modules',rel)),name);
  assert.equal(fs.readFileSync(path.join(out,'native-bridge.js'),'utf8'),fs.readFileSync(path.join(mobile,'src','native-bridge.js'),'utf8'));
  const privacy=fs.readFileSync(path.join(out,'privacy','index.html'),'utf8');
  assert.match(privacy,/<script src="\.\.\/native-bridge\.js"><\/script>\n<script src="\.\.\/legal\/legal\.js"><\/script>/);
});
test('the staging key must be a publishable key and nothing is written otherwise',t=>{
  for(const key of [undefined,'','sb_secret_abcdefghijklmnop','eyJhbGciOiJIUzI1NiJ9.e30.x','sb_publishable_short']){
    const out=path.join(tmp(t),'www');
    assert.throws(()=>build({root,mobile,out,target:'staging',env:key===undefined?{}:{YT_STAGING_PUBLISHABLE_KEY:key}}),/publishable key/);
    assert.equal(fs.existsSync(out),false);
  }
});
test('production output needs approval, confirmation and real app IDs',t=>{
  const out=path.join(tmp(t),'www');
  assert.throws(()=>build({root,mobile,out,target:'production',env:{}}),/release-approval/);
  assert.throws(()=>build({root,mobile,out,target:'production',approval:'x',env:{}}),/release-approval/);
  assert.throws(()=>build({root,mobile,out,target:'production',env:{YT_MOBILE_PRODUCTION_BUILD:PRODUCTION_CONFIRM}}),/release-approval/);
  assert.throws(()=>build({root,mobile,out,target:'production',approval:'x',env:{YT_MOBILE_PRODUCTION_BUILD:PRODUCTION_CONFIRM}}),/placeholder/);
  assert.equal(fs.existsSync(out),false);
  // With a non-placeholder id (test-only object, not the repository config) the guard opens.
  const r=build({root,mobile,out,target:'production',approval:'x',env:{YT_MOBILE_PRODUCTION_BUILD:PRODUCTION_CONFIRM},
    config:{appId:'com.example.reviewonly'}});
  assert.equal(r.supabaseUrl,'https://'+PRODUCTION+'.supabase.co');
  for(const rel of files(out).filter(f=>/\.(html|js|css|json)$/.test(f)))
    assert.ok(!fs.readFileSync(path.join(out,rel),'utf8').includes(STAGING),'staging reference in '+rel);
});
test('unknown target, existing output and unsafe app ids are refused',t=>{
  const {options}=require('../scripts/build-mobile.cjs');
  assert.throws(()=>options(['--target=prod'],{}),/Unknown target/);
  assert.equal(options([],{}).target,'staging');
  const {out}=run(t);
  assert.throws(()=>build({root,mobile,out,target:'staging',env:{YT_STAGING_PUBLISHABLE_KEY:KEY}}),/already exists/);
  assert.throws(()=>run(t,{config:{appId:'Bad Id'}}),/reverse-DNS/);
});
test('native projects use the same placeholder id and callback scheme, with no signing set up',()=>{
  const id=JSON.parse(fs.readFileSync(path.join(mobile,'capacitor.config.json'),'utf8')).appId;
  const read=rel=>fs.readFileSync(path.join(mobile,rel),'utf8');
  const gradle=read('android/app/build.gradle');
  assert.match(gradle,new RegExp('applicationId "'+id.replace(/\./g,'\\.')+'"'));
  assert.doesNotMatch(gradle,/signingConfigs|storeFile|keyAlias/);
  assert.match(read('android/app/src/main/res/values/strings.xml'),new RegExp('<string name="custom_url_scheme">'+id+'</string>'));
  assert.match(read('android/app/src/main/AndroidManifest.xml'),/android:scheme="@string\/custom_url_scheme" android:host="auth" android:path="\/callback"/);
  const pbx=read('ios/App/App.xcodeproj/project.pbxproj');
  assert.ok(pbx.split('PRODUCT_BUNDLE_IDENTIFIER = '+id+';').length>1);
  assert.doesNotMatch(pbx,/DEVELOPMENT_TEAM|PROVISIONING_PROFILE_SPECIFIER = "?[A-Za-z0-9]/);
  assert.match(read('ios/App/App/Info.plist'),new RegExp('<key>CFBundleURLSchemes</key>\\s*<array>\\s*<string>'+id.replace(/\./g,'\\.')+'</string>'));
  for(const f of ['android/app/src/main/assets/public','ios/App/App/public'])
    assert.match(read(f.startsWith('android')?'android/.gitignore':'ios/.gitignore'),new RegExp('^'+f.replace(/^(android|ios)\//,'').replace(/\//g,'\\/')+'$','m'),f+' must stay untracked');
});
test('repository config has no server.url and keeps the placeholder id',()=>{
  const cfg=JSON.parse(fs.readFileSync(path.join(mobile,'capacitor.config.json'),'utf8'));
  assert.equal(cfg.server.url,undefined);assert.deepEqual(cfg.server.allowNavigation,[]);
  assert.equal(cfg.webDir,'www');assert.match(cfg.appId,/\.dev\.placeholder$/);
  assert.equal(cfg.server.cleartext,undefined);assert.equal(cfg.android.allowMixedContent,false);
});
