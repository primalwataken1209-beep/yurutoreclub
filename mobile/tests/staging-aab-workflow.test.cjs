const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {checkStagingKey}=require('../scripts/check-staging-key.cjs');
const mobile=path.resolve(__dirname,'..'),root=path.resolve(mobile,'..');
const raw=fs.readFileSync(path.join(root,'.github','workflows','mobile-staging-aab.yml'),'utf8').replace(/\r\n/g,'\n');
const yml=raw.replace(/^\s*#.*$/gm,'');
const inspect=fs.readFileSync(path.join(mobile,'scripts','inspect-staging-aab.sh'),'utf8').replace(/\r\n/g,'\n');

test('only a publishable key is accepted; secret, service_role and JWT keys are refused',()=>{
  assert.equal(checkStagingKey('sb_publishable_TESTONLY_not_a_real_key'),null);
  for(const [key,reason] of [[undefined,'missing'],['','missing'],['sb_publishable_abc def123456','whitespace'],
    ['sb_secret_abcdefghijklmnop','secret_key'],['sb_publishable_service_role_x1234','secret_key'],
    ['eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.x','jwt_key'],['eyJhbGciOiJIUzI1NiJ9.e30.x','jwt_key'],
    ['sb_publishable_short','not_publishable'],['pk_live_abcdefghijkl','not_publishable']])
    assert.equal(checkStagingKey(key),reason,String(key));
});
test('the key checker never prints the key',()=>{
  const src=fs.readFileSync(path.join(mobile,'scripts','check-staging-key.cjs'),'utf8');
  assert.doesNotMatch(src,/console\.(log|error)\([^)]*process\.env/);
});
test('manual dispatch only, read-only token, SHA-pinned actions, no secrets, fixed branch',()=>{
  assert.match(yml,/^on:\n  workflow_dispatch:\n/m);
  assert.doesNotMatch(yml,/^\s+(push|pull_request|pull_request_target|schedule|workflow_run|repository_dispatch):/m);
  assert.match(yml,/^permissions:\n  contents: read\n/m);
  assert.doesNotMatch(yml,/secrets\.|write-all|id-token|contents: write|packages:/);
  const uses=[...yml.matchAll(/uses: (\S+)/g)].map(m=>m[1]);
  assert.ok(uses.length>=4);for(const u of uses)assert.match(u,/@[0-9a-f]{40}$/,u);
  assert.match(yml,/if: github\.ref == 'refs\/heads\/claude\/store-release-prep'/);
  assert.match(yml,/timeout-minutes: \d+/);assert.match(yml,/runs-on: ubuntu-latest/);
});
test('the key reaches commands only through env, and is masked before checkout',()=>{
  for(const line of yml.split('\n').filter(l=>l.includes('inputs.staging_publishable_key')))
    assert.match(line,/^\s+(KEY|YT_STAGING_PUBLISHABLE_KEY): \$\{\{ inputs\.staging_publishable_key \}\}$/,line);
  const mask=yml.indexOf('::add-mask::$KEY'),checkout=yml.indexOf('actions/checkout@');
  assert.ok(mask>0&&mask<checkout,'masked before any repository code');
  assert.match(yml,/\*sb_secret_\*\|\*service_role\*\|eyJ\*\) echo 'Refused/);
  // The only echo that touches the key is the mask itself.
  assert.deepEqual(yml.split('\n').filter(l=>/echo[^\n]*\$(KEY|YT_STAGING_PUBLISHABLE_KEY)\b/.test(l)).map(l=>l.trim()),['echo "::add-mask::$KEY"']);
});
test('target and app ID are fixed; no production output, no signing, no store upload',()=>{
  assert.match(yml,/node scripts\/build-mobile\.cjs --target=staging\n/);
  assert.doesNotMatch(yml,/--target=production|YT_MOBILE_PRODUCTION_BUILD|release-approval/);
  assert.match(yml,/c\.appId!=='club\.yurutore\.app'/);
  assert.match(yml,/gradlew --no-daemon bundleRelease/);
  // The one line that mentions signingConfigs is the check that fails when one exists.
  const noCheck=yml.replace("if grep -Eq 'signingConfigs|storeFile' android/app/build.gradle; then exit 1; fi",'');
  assert.notEqual(noCheck,yml,'signing config check present');
  assert.doesNotMatch(noCheck,/assembleRelease|signingConfig|keystore|storePassword|keyAlias|apksigner|jarsigner -keystore|android\.injected\.signing/i);
  assert.doesNotMatch(yml,/fastlane|play-publisher|upload-google-play|r0adkll|altool|xcrun|supply/i);
});
test('the artifact is kept only after inspection, for at most a few days',()=>{
  const inspectAt=yml.indexOf('bash scripts/inspect-staging-aab.sh'),uploadAt=yml.indexOf('actions/upload-artifact@');
  assert.ok(inspectAt>0&&uploadAt>inspectAt,'upload comes after inspection');
  const upload=yml.slice(uploadAt);
  assert.doesNotMatch(upload,/if: always\(\)|continue-on-error/);assert.doesNotMatch(yml,/continue-on-error: true/);
  const days=Number((upload.match(/retention-days: (\d+)/)||[])[1]);assert.ok(days>=1&&days<=7,'retention '+days);
  assert.match(upload,/if-no-files-found: error/);
  assert.match(upload,/app-release\.aab\n[\s\S]*app-release\.aab\.sha256\n[\s\S]*build-info\.json/);
});
test('inspection covers signature, manifest, target, callback, key and production references',()=>{
  for(const check of [/set -euo pipefail/,/grep -q 'jar is unsigned'/,/package=\\"\$app_id\\"/,/android:debuggable="true"/,
    /android:usesCleartextTraffic="true"/,/android:allowBackup="false"/,/android\.permission\.INTERNET/,
    /info\.target==="staging"/,/club\.yurutore\.app:\/\/auth\/callback/,/grep -rq "\$production"/,/grep -qF "\$YT_STAGING_PUBLISHABLE_KEY"/,
    /sb_secret_\[A-Za-z0-9_-\]\{8,\}/,/eyJ\[A-Za-z0-9_-\]\{10,\}/,/CI_COMPILE_ONLY/,/sha256sum/])
    assert.match(inspect,check,String(check));
  assert.doesNotMatch(inspect,/echo[^\n]*YT_STAGING_PUBLISHABLE_KEY/,'never prints the key');
});
