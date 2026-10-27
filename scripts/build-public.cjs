// Proposal only. Reads a source checkout and exports a static allowlist to dist.
// Does not run app code, access credentials, contact services or publish anything.
const fs=require('node:fs'),path=require('node:path');
const root=process.cwd(),dest=path.join(root,'dist');
const tops=['index.html','app.js','style.css','_headers','panda_header.jpg','panda_room_v3_world.png','room_bg_v29_base.png','welcome_panda_food.png','welcome_panda_food_clean.png'];
const dirs=['assets','images','legal','privacy','terms','community-guidelines','contact','account-deletion'];
if(fs.existsSync(dest))throw Error('dist already exists; use a fresh build checkout');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
if(!html.includes('https://eszheiabjwehcbrteqza.supabase.co')||html.includes('knftduojdalnawvkbelt'))throw Error('Unexpected project configuration');
if(!html.includes('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.118.0"'))throw Error('SDK pin missing');
const files=[];
function add(relative){const absolute=path.join(root,relative),s=fs.lstatSync(absolute);if(s.isSymbolicLink())throw Error('Symlink rejected');if(s.isDirectory()){for(const n of fs.readdirSync(absolute))add(path.join(relative,n));}else if(s.isFile()&&!/\.(md|txt)$/i.test(relative)){files.push(relative);}else if(!s.isFile())throw Error('Unexpected file type');}
for(const name of [...tops,...dirs])add(name);
if(files.length!==106)throw Error('Inventory changed; review allowlist');
fs.mkdirSync(dest);
for(const relative of files){const target=path.join(dest,relative);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(root,relative),target,fs.constants.COPYFILE_EXCL);}
console.log('Prepared '+files.length+' static files in dist. No deploy performed.');
