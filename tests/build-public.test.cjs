const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process');
const script=fs.readFileSync('scripts/build-public.cjs','utf8');
const tops=['index.html','app.js','style.css','_headers','panda_header.jpg','panda_room_v3_world.png','room_bg_v29_base.png','welcome_panda_food.png','welcome_panda_food_clean.png'];
const dirs=['assets','images','legal','privacy','terms','community-guidelines','contact','account-deletion'];
function fixture(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'yurutore-export-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));for(const p of [...tops,...dirs])fs.cpSync(path.resolve(p),path.join(root,p),{recursive:true});fs.writeFileSync(path.join(root,'build.cjs'),script);return root;}
function run(root){return spawnSync(process.execPath,['build.cjs'],{cwd:root,encoding:'utf8'});}
function list(root,rel=''){return fs.readdirSync(path.join(root,rel)).flatMap(n=>{const p=path.join(rel,n);return fs.statSync(path.join(root,p)).isDirectory()?list(root,p):[p];});}
test('static export preserves 106 files and excludes private source',t=>{const root=fixture(t);fs.writeFileSync(path.join(root,'.env'),'private');fs.writeFileSync(path.join(root,'assets','internal.md'),'private');assert.equal(run(root).status,0);const out=path.join(root,'dist'),files=list(out);assert.equal(files.length,106);assert.equal(fs.existsSync(path.join(out,'.env')),false);assert.equal(fs.existsSync(path.join(out,'assets','internal.md')),false);for(const f of files)assert.deepEqual(fs.readFileSync(path.join(out,f)),fs.readFileSync(path.join(root,f)));const again=run(root);assert.notEqual(again.status,0);assert.match(again.stderr,/dist already exists/);});
test('export rejects staging project before writing output',t=>{const root=fixture(t);fs.appendFileSync(path.join(root,'index.html'),'knftduojdalnawvkbelt');assert.notEqual(run(root).status,0);assert.equal(fs.existsSync(path.join(root,'dist')),false);});
test('export rejects unreviewed public inventory',t=>{const root=fixture(t);fs.writeFileSync(path.join(root,'assets','unexpected.json'),'{}');assert.notEqual(run(root).status,0);assert.equal(fs.existsSync(path.join(root,'dist')),false);});
