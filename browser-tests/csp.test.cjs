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
test('CSP selects matching route blocks, preserving overlapping restrictions',()=>{
  const blocks=parseHeaders("/*\n  Content-Security-Policy: default-src 'self'\n/privacy/*\n  Content-Security-Policy: script-src 'none'\n");
  assert.deepEqual(policiesFor(blocks,'/'),["default-src 'self'"]);
  assert.deepEqual(policiesFor(blocks,'/privacy/'),["default-src 'self'","script-src 'none'"]);
  assert.deepEqual(policiesFor(parseHeaders('/index.html\n  Content-Security-Policy: x'),' /indexXhtml'),[]);
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
