const {test}=require('node:test');
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {startFixture}=require('./fixture.cjs');
test('real Chromium: offline guest flow, languages, room, mobile and privacy',{timeout:120000},async t=>{
  const fixture=await startFixture();t.after(()=>fixture.server.close());
  const browser=await chromium.launch({headless:true});
  const outside=[];const pageErrors=[];const policyErrors=[];const diagnosticHistory=[];
  async function context(options={}){
    const ctx=await browser.newContext({locale:'ja-JP',viewport:{width:1000,height:1000},serviceWorkers:'block',...options});
    await ctx.route('**/*',route=>{const url=route.request().url();if(url.startsWith(fixture.origin+'/'))return route.continue();outside.push(url);return route.abort();});
    ctx.on('page',page=>{
      page.on('pageerror',error=>pageErrors.push(error.message));
      page.on('console',message=>{
        const text=message.text();
        if(text.startsWith('__OFFLINE_DIAGNOSTICS__'))diagnosticHistory.push(JSON.parse(text.slice('__OFFLINE_DIAGNOSTICS__'.length)));
        if(message.type()==='error'&&/Content Security Policy/i.test(text))policyErrors.push(text);
      });
    });
    return ctx;
  }
  const ctx=await context();const page=await ctx.newPage();page.setDefaultTimeout(15000);
  const picture=async(name,p=page)=>{const bytes=await p.screenshot({type:'jpeg',quality:65,fullPage:false});t.diagnostic('BROWSER_IMAGE '+name+' '+bytes.toString('base64'));};
  t.after(async()=>{if(!page.isClosed())await picture('final-state.jpg').catch(()=>{});t.diagnostic('BROWSER_MISSING '+JSON.stringify([...new Set(fixture.missing)]));await browser.close();});
  await page.goto(fixture.origin+'/',{waitUntil:'networkidle'});
  await t.test('desktop renders once and Japanese/English switching works',async()=>{
    await page.getByRole('button',{name:'まずは体験してみる',exact:true}).waitFor();
    assert.equal(await page.locator('.frame-ios,.frame-android').count(),1);
    await page.getByRole('button',{name:'English',exact:true}).click();
    await page.getByRole('button',{name:'Just look around first',exact:true}).waitFor();
    await page.getByRole('button',{name:'日本語',exact:true}).click();
    await page.getByRole('button',{name:'まずは体験してみる',exact:true}).waitFor();
    await picture('welcome-ja.jpg');
  });
  await t.test('fresh trial reaches home and starts at room Lv.1 with 3/35',async()=>{
    await page.getByRole('button',{name:'まずは体験してみる',exact:true}).click();
    await page.getByRole('button',{name:'まずは体験してみる',exact:true}).click();
    await page.getByRole('button',{name:'🚶 ウォーキング',exact:true}).click();
    await page.getByRole('button',{name:'週1〜2回',exact:true}).click();
    await page.getByRole('button',{name:'次へ進む',exact:true}).click();
    await page.getByPlaceholder('例：ゆるパンダ',{exact:true}).fill('検証パンダ');
    await page.getByRole('button',{name:'はじめる',exact:true}).click();
    await page.getByRole('button',{name:'🐼 お部屋に遊びに行く',exact:true}).waitFor();
    const level=await page.locator('.room-v3-level').first().innerText();
    assert.match(level,/Lv\.1/);assert.match(level,/3\/35/);
    await picture('guest-home.jpg');
    await page.getByRole('button',{name:'🐼 お部屋に遊びに行く',exact:true}).click();
    await page.locator('.room-full-view').waitFor();await picture('guest-room.jpg');
    await page.locator('.room-full-back').click();
    await page.reload({waitUntil:'networkidle'});
    await page.getByRole('button',{name:'🐼 お部屋に遊びに行く',exact:true}).waitFor();
  });
  await t.test('mobile Android has one frame without horizontal overflow',async()=>{
    const mobile=await context({viewport:{width:390,height:844},isMobile:true,hasTouch:true,userAgent:'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130.0.0.0 Mobile Safari/537.36'});
    const p=await mobile.newPage();await p.goto(fixture.origin+'/',{waitUntil:'networkidle'});
    await p.getByRole('button',{name:'まずは体験してみる',exact:true}).waitFor();
    assert.equal(await p.locator('.frame-android').count(),1);assert.equal(await p.locator('.frame-ios').count(),0);
    assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1));
    await picture('mobile-welcome.jpg',p);await mobile.close();
  });
  await t.test('privacy renders; no JS failures, CSP violations or external requests',async()=>{
    const legal=await ctx.newPage();await legal.goto(fixture.origin+'/privacy/',{waitUntil:'networkidle'});
    assert.match(await legal.locator('body').innerText(),/プライバシー/);
    const diagnostics=JSON.parse(await page.locator('html').getAttribute('data-offline-diagnostics'));
    assert.deepEqual(diagnostics,{errors:[],network:[],policy:[]});
    for(const entry of diagnosticHistory)assert.deepEqual(entry,{errors:[],network:[],policy:[]});
    assert.deepEqual(pageErrors,[]);assert.deepEqual(policyErrors,[]);assert.deepEqual(outside,[]);
    await legal.close();
  });
});
