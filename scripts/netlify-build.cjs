// Netlify production entry point. A reused build directory can still hold the
// previous dist, which build-public.cjs (intentionally) refuses to overwrite.
// Removes only <checkout>/dist after checking it is a plain directory tree inside
// the checkout, then runs the unchanged strict export and verifies its output.
// Does not deploy, contact services or read credentials.
const fs=require('node:fs'),path=require('node:path');
const {spawnSync}=require('node:child_process');
const EXPECTED=106;
if(process.env.NETLIFY!=='true')throw Error('Netlify builds only; locally run scripts/build-public.cjs in a fresh checkout');
const root=fs.realpathSync(process.cwd());
if(fs.realpathSync(path.resolve(__dirname,'..'))!==root)throw Error('Run from the checkout root');
const dest=path.join(root,'dist');
if(path.dirname(dest)!==root||path.basename(dest)!=='dist')throw Error('Unexpected output path');
const rel=p=>path.relative(root,p)||'.';
function walk(p,files){const s=fs.lstatSync(p);if(s.isSymbolicLink())throw Error('Link rejected: '+rel(p));if(s.isDirectory()){for(const n of fs.readdirSync(p))walk(path.join(p,n),files);}else if(s.isFile())files.push(p);else throw Error('Unexpected file type: '+rel(p));return files;}
let previous;try{previous=fs.lstatSync(dest);}catch(e){if(e.code!=='ENOENT')throw e;}
if(previous){
  // Symlinks and Windows junctions report isSymbolicLink() through lstat.
  if(previous.isSymbolicLink()||!previous.isDirectory())throw Error('Previous dist is not a plain directory');
  if(fs.realpathSync(dest)!==dest)throw Error('Previous dist resolves outside the checkout');
  const stale=walk(dest,[]);
  fs.rmSync(dest,{recursive:true});
  if(fs.existsSync(dest))throw Error('Previous dist could not be removed');
  console.log('Removed previous dist ('+stale.length+' files) from the reused build directory.');
}
const result=spawnSync(process.execPath,[path.join(__dirname,'build-public.cjs')],{cwd:root,stdio:'inherit'});
if(result.error)throw result.error;
if(result.status!==0)process.exit(result.status===null?1:result.status);
const out=walk(dest,[]);
if(out.length!==EXPECTED)throw Error('Unexpected dist inventory: '+out.length);
for(const file of out){const source=path.join(root,path.relative(dest,file));if(!fs.readFileSync(file).equals(fs.readFileSync(source)))throw Error('Exported bytes differ: '+rel(file));}
console.log('Verified '+out.length+' exported files byte-for-byte against the checkout. No deploy performed.');
