const assert=require('node:assert/strict');
function collectConsole(message,errors,diagnostics){
  const text=message.text();
  if(text.startsWith('__OFFLINE_DIAGNOSTICS__'))diagnostics.push(JSON.parse(text.slice('__OFFLINE_DIAGNOSTICS__'.length)));
  if(message.type()==='error')errors.push(text);
}
function assertConsoleClean(errors){assert.deepEqual(errors,[],'Browser console errors');}
async function assertPrivacyVisible(page){
  const heading=page.getByRole('heading',{name:'プライバシーポリシー',exact:true});
  await heading.waitFor({state:'visible'});
  await heading.scrollIntoViewIfNeeded();
  assert.ok(await heading.evaluate(element=>{
    const box=element.getBoundingClientRect();
    const style=getComputedStyle(element);
    const hit=document.elementFromPoint(box.x+box.width/2,box.y+box.height/2);
    return element.checkVisibility({checkOpacity:true,checkVisibilityCSS:true})&&style.opacity!=='0'&&(hit===element||element.contains(hit));
  }),'Privacy heading must be visible and unobstructed');
}
module.exports={collectConsole,assertConsoleClean,assertPrivacyVisible};
