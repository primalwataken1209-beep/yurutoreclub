const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process');
const tops=['index.html','app.js','style.css','_headers','panda_header.jpg','panda_room_v3_world.png','room_bg_v29_base.png','welcome_panda_food.png','welcome_panda_food_clean.png'];
const dirs=['assets','images','legal','privacy','terms','community-guidelines','contact','account-deletion'];
function tmp(t,prefix){const dir=fs.mkdtempSync(path.join(os.tmpdir(),prefix));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return dir;}
function fixture(t){const root=tmp(t,'yurutore-netlify-');for(const p of [...tops,...dirs,'scripts/build-public.cjs','scripts/netlify-build.cjs'])fs.cpSync(path.resolve(p),path.join(root,p),{recursive:true});return root;}
function run(root,env={NETLIFY:'true'}){const clean={...process.env};delete clean.NETLIFY;return spawnSync(process.execPath,['scripts/netlify-build.cjs'],{cwd:root,encoding:'utf8',env:{...clean,...env}});}
function list(root,rel=''){return fs.readdirSync(path.join(root,rel)).flatMap(n=>{const p=path.join(rel,n);return fs.lstatSync(path.join(root,p)).isDirectory()?list(root,p):[p];}).sort();}
function assertExport(root){const out=path.join(root,'dist'),files=list(out);assert.equal(files.length,106);for(const f of files)assert.deepEqual(fs.readFileSync(path.join(out,f)),fs.readFileSync(path.join(root,f)),f);return files;}
function stale(root){const d=path.join(root,'dist');fs.mkdirSync(path.join(d,'assets','old'),{recursive:true});fs.writeFileSync(path.join(d,'index.html'),'stale build');fs.writeFileSync(path.join(d,'stale.html'),'stale');fs.writeFileSync(path.join(d,'assets','old','app.js'),'stale');}
function outside(t){const dir=tmp(t,'yurutore-outside-');fs.writeFileSync(path.join(dir,'keep.txt'),'keep');return dir;}
// Directory links: 'junction' works without privileges on Windows and is ignored elsewhere.
const link=(target,at)=>fs.symlinkSync(target,at,'junction');

test('fresh checkout exports the same 106 files as build-public',t=>{const root=fixture(t);const r=run(root);assert.equal(r.status,0,r.stderr);assert.match(r.stdout,/Verified 106 exported files/);assertExport(root);});
test('previous dist in a reused build directory is replaced without stale files',t=>{
  const root=fixture(t);stale(root);const r=run(root);assert.equal(r.status,0,r.stderr);assert.match(r.stdout,/Removed previous dist \(3 files\)/);
  const files=assertExport(root);assert.ok(!files.includes('stale.html'));assert.equal(fs.existsSync(path.join(root,'dist','assets','old')),false);
  const again=run(root);assert.equal(again.status,0,again.stderr);assert.deepEqual(assertExport(root),files);
});
test('dist that is a link or junction is rejected and its target is untouched',t=>{
  const root=fixture(t),target=outside(t);link(target,path.join(root,'dist'));
  const r=run(root);assert.notEqual(r.status,0);assert.match(r.stderr,/not a plain directory/);
  assert.equal(fs.readFileSync(path.join(target,'keep.txt'),'utf8'),'keep');assert.ok(fs.lstatSync(path.join(root,'dist')).isSymbolicLink());
});
test('link inside previous dist stops the build before anything is deleted',t=>{
  const root=fixture(t),target=outside(t);stale(root);link(target,path.join(root,'dist','assets','escape'));
  const r=run(root);assert.notEqual(r.status,0);assert.match(r.stderr,/Link rejected: dist[\\/]assets[\\/]escape/);
  assert.equal(fs.readFileSync(path.join(target,'keep.txt'),'utf8'),'keep');assert.equal(fs.readFileSync(path.join(root,'dist','stale.html'),'utf8'),'stale');
});
test('dist that is a regular file is rejected',t=>{const root=fixture(t);fs.writeFileSync(path.join(root,'dist'),'x');const r=run(root);assert.notEqual(r.status,0);assert.equal(fs.readFileSync(path.join(root,'dist'),'utf8'),'x');});
test('outside Netlify the wrapper refuses and leaves an existing dist alone',t=>{const root=fixture(t);stale(root);const r=run(root,{});assert.notEqual(r.status,0);assert.match(r.stderr,/Netlify builds only/);assert.equal(fs.readFileSync(path.join(root,'dist','stale.html'),'utf8'),'stale');});
test('wrapper keeps build-public safety checks: staging reference and unreviewed files fail with no dist',t=>{
  const a=fixture(t);stale(a);fs.appendFileSync(path.join(a,'index.html'),'knftduojdalnawvkbelt');assert.notEqual(run(a).status,0);assert.equal(fs.existsSync(path.join(a,'dist')),false);
  const b=fixture(t);fs.writeFileSync(path.join(b,'assets','unexpected.json'),'{}');assert.notEqual(run(b).status,0);assert.equal(fs.existsSync(path.join(b,'dist')),false);
});
test('build-public itself stays strict about an existing dist',t=>{const root=fixture(t);stale(root);const r=spawnSync(process.execPath,['scripts/build-public.cjs'],{cwd:root,encoding:'utf8'});assert.notEqual(r.status,0);assert.match(r.stderr,/dist already exists/);});
test('only production uses the wrapper; previews and branch deploys stay blocked',()=>{
  const toml=fs.readFileSync('netlify.toml','utf8');const section=name=>(toml.split('[context.'+name+']')[1]||'').split('\n[')[0];
  assert.match(section('production'),/command = "node scripts\/netlify-build\.cjs"/);
  for(const name of ['deploy-preview','branch-deploy'])assert.match(section(name),/block-preflight-deploy\.cjs/);
  assert.match(toml.split('[context.')[0],/command = "node scripts\/block-preflight-deploy\.cjs"/);assert.match(toml,/publish = "dist"/);
});
