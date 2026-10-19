const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const http=require('node:http');
const {once}=require('node:events');
const {chromium}=require('playwright');
test('Chromium blocks production API and images before network dispatch',{timeout:30000},async t=>{
  const csp=fs.readFileSync('_headers','utf8').match(/^  Content-Security-Policy: (.+)$/m)[1].trim();
  const source=fs.readFileSync('app.js','utf8');
  const transport=source.match(/function stagingFetch\(input,options\)\{[\s\S]*?\n\}/)[0];
  const target='https://knftduojdalnawvkbelt.supabase.co';
  const server=http.createServer((req,res)=>{
    res.setHeader('Content-Security-Policy',csp);res.setHeader('Content-Type','text/html');
    res.end(`<script>const SUPABASE_URL='${target}';${transport};window.violations=[];addEventListener('securitypolicyviolation',e=>violations.push(e.blockedURI));</script><h1>Staging isolation probe</h1>`);
  });
  server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>server.close());
  const browser=await chromium.launch({headless:true,chromiumSandbox:true});t.after(()=>browser.close());
  const ctx=await browser.newContext();const dispatched=[];
  await ctx.route('**/*',route=>{
    const url=route.request().url();
    if(url.startsWith('http://127.0.0.1:'))return route.continue();
    dispatched.push(url);
    // Staging responses are synthetic. No external request can leave this test.
    if(url.startsWith(target+'/'))return route.fulfill({status:200,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:'{"staging":true}'});
    return route.abort();
  });
  const page=await ctx.newPage();await page.goto('http://127.0.0.1:'+server.address().port);
  const result=await page.evaluate(async()=>{
    const prod='https://eszheiabjwehcbrteqza.supabase.co';
    let sdkBlocked=false,cspBlocked=false;
    try{await stagingFetch(prod+'/rest/v1/profiles');}catch{sdkBlocked=true;}
    try{await fetch(prod+'/auth/v1/settings');}catch{cspBlocked=true;}
    await new Promise(resolve=>{const img=new Image();img.onload=resolve;img.onerror=resolve;img.src=prod+'/storage/v1/object/public/avatars/probe.jpg';document.body.append(img);});
    const staging=await (await stagingFetch('https://knftduojdalnawvkbelt.supabase.co/auth/v1/settings')).json();
    return {sdkBlocked,cspBlocked,staging};
  });
  assert.deepEqual(result,{sdkBlocked:true,cspBlocked:true,staging:{staging:true}});
  assert.deepEqual(dispatched,[target+'/auth/v1/settings']);
  assert.ok((await page.evaluate(()=>window.violations)).some(uri=>uri.includes('eszheiabjwehcbrteqza')));
});
