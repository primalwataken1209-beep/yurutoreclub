const {test}=require('node:test');
const assert=require('node:assert/strict');
const {parseHeaders,policiesFor,selectPolicies,assertScriptsAllowed}=require('./csp.cjs');
const cdn='https://cdnjs.cloudflare.com/ajax/libs/react/18.3.1/umd/react.production.min.js';
test('original CDN scripts cannot be hidden by local fixture substitutions',()=>{
  assert.throws(()=>assertScriptsAllowed(["script-src 'self'"],[cdn]),/blocks original/);
  assert.doesNotThrow(()=>assertScriptsAllowed(["script-src 'self' https://cdnjs.cloudflare.com"],[cdn]));
  assert.throws(()=>assertScriptsAllowed(["script-src https://cdnjs.cloudflare.com; script-src-elem 'self'"],[cdn]),/blocks original/);
  assert.throws(()=>assertScriptsAllowed(["default-src 'self'"],[cdn]),/blocks original/);
});
test('CSP selects the first matching route block in file order',()=>{
  const blocks=parseHeaders("/*\n  Content-Security-Policy: default-src 'self'\n/privacy/*\n  Content-Security-Policy: script-src 'none'\n");
  assert.deepEqual(policiesFor(blocks,'/'),["default-src 'self'"]);
  assert.deepEqual(policiesFor(blocks,'/privacy/'),["default-src 'self'"]);
  assert.deepEqual(policiesFor(parseHeaders('/index.html\n  Content-Security-Policy: x'),' /indexXhtml'),[]);
});

test('specific rules preceding catch-all take precedence, including rules without CSP',()=>{
  const blocks=parseHeaders("/privacy/*\n  Content-Security-Policy: script-src 'self'\n/*\n  Content-Security-Policy: script-src 'none'");
  assert.deepEqual(policiesFor(blocks,'/privacy/'),["script-src 'self'"]);
  assert.deepEqual(policiesFor(blocks,'/'),["script-src 'none'"]);
  assert.deepEqual(policiesFor(parseHeaders('/privacy/*\n  X-Frame-Options: DENY\n/*\n  Content-Security-Policy: x'),'/privacy/'),[]);
});

test('headers require exactly two spaces, rejecting spaces and tabs Netlify ignores',()=>{
  for(const prefix of [' ','\t','   ',' \t'])assert.throws(()=>parseHeaders('/*\n'+prefix+'Content-Security-Policy: x'),/Invalid header/);
  assert.deepEqual(policiesFor(parseHeaders('/*\r\n  Content-Security-Policy: x\r\n'),'/'),['x']);
});

test('document-only CSP allows unmatched scripts, styles and images',()=>{
  const blocks=parseHeaders('/\n  Content-Security-Policy: x\n/index.html\n  Content-Security-Policy: x\n/privacy/*\n  Content-Security-Policy: y');
  for(const route of ['/','/index.html','/privacy/','/privacy/index.html'])assert.notDeepEqual(selectPolicies(blocks,[],route,'fallback'),['fallback']);
  for(const route of ['/vendor/react.js','/legal/legal.js','/legal/legal.css','/assets/a.png'])assert.deepEqual(selectPolicies(blocks,blocks,route,'fallback'),['fallback']);
  assert.throws(()=>selectPolicies(parseHeaders('/\n  Content-Security-Policy: x'),[],'/privacy/','fallback'),/Missing CSP/);
});

test('ordinary console errors, including caught room rendering errors, fail the check',()=>{
  const {collectConsole,assertConsoleClean}=require('./assertions.cjs');
  const errors=[],diagnostics=[];
  collectConsole({type:()=> 'warning',text:()=> '__OFFLINE_DIAGNOSTICS__{"errors":[],"network":[],"policy":[]}'},errors,diagnostics);
  assertConsoleClean(errors);assert.equal(diagnostics.length,1);
  collectConsole({type:()=> 'error',text:()=> 'RoomErrorBoundary: rendering failed'},errors,diagnostics);
  assert.throws(()=>assertConsoleClean(errors),/Browser console errors/);
});
test('moving global CSP to privacy fails for root, even before baseline CSP is merged',()=>{
  const narrow=parseHeaders("/privacy/*\n  Content-Security-Policy: default-src 'self'");
  assert.throws(()=>selectPolicies(narrow,[],'/','snapshot'),/Missing CSP/);
  const trusted=parseHeaders("/*\n  Content-Security-Policy: default-src 'self'");
  assert.throws(()=>selectPolicies([],trusted,'/','snapshot'),/Missing CSP/);
  assert.deepEqual(selectPolicies([],[],'/','snapshot'),['snapshot']);
});
test('unsupported routes and restrictive source precedence fail closed',()=>{
  assert.throws(()=>parseHeaders('/:path\n  Content-Security-Policy: x'),/Unsupported/);
  assert.throws(()=>assertScriptsAllowed(["script-src https://cdnjs.cloudflare.com 'strict-dynamic'"],[cdn]),/explicitly/);
  assert.throws(()=>assertScriptsAllowed(['script-src https://cdnjs.cloudflare.com/other/'],[cdn]),/blocks original/);
});
