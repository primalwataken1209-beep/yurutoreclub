const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
function build(output,env=process.env){
  assert.ok(['deploy-preview','branch-deploy','offline-test'].includes(env.CONTEXT),'Only staging preview builds are permitted');
  assert.equal(env.BRANCH,'staging/isolated-test-app','Unexpected source branch');
  const root=path.resolve(__dirname,'..');
  const out=path.resolve(output||path.join(root,'staging-dist'));
  assert.notEqual(out,root);
  fs.mkdirSync(out,{recursive:true});
  // Explicit allowlist: SQL, workflows, historical exports and docs are never published.
  const files=['index.html','app.js','style.css','_headers','assets','images','legal','privacy','terms','account-deletion','community-guidelines','contact'];
  for(const name of fs.readdirSync(root))if(/^[^/]+\.(png|jpg|webp|ico)$/.test(name))files.push(name);
  for(const name of files){
    const from=path.join(root,name);if(!fs.existsSync(from))continue;
    assert.ok(!fs.lstatSync(from).isSymbolicLink());
    fs.cpSync(from,path.join(out,name),{recursive:true,dereference:false});
  }
  for(const name of ['index.html','app.js','_headers']){
    const text=fs.readFileSync(path.join(out,name),'utf8');
    assert.ok(!text.includes('eszheiabjwehcbrteqza'),'Production project reference in output');
    assert.ok(!text.includes('sb_secret_')&&!text.includes('sb_publishable_XINCd'),'Unexpected credential in output');
    assert.ok(text.includes('knftduojdalnawvkbelt'),'Missing staging project reference');
  }
  console.log('Staging-only build ready: '+out);
  return out;
}
module.exports={build};
if(require.main===module)build();
