const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const {once}=require('node:events');
const repo=process.cwd();
// PR #2 snapshot is used only until a CSP exists in the repository headers.
const pr2Csp="default-src 'self'; base-uri 'self'; object-src 'none'; frame-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://eszheiabjwehcbrteqza.supabase.co https://*.googleusercontent.com; font-src 'self'; connect-src 'self' https://eszheiabjwehcbrteqza.supabase.co; upgrade-insecure-requests";
const readCsp=file=>fs.readFileSync(file,'utf8').match(/^\s+Content-Security-Policy:\s*(.+)$/mi)?.[1];
const candidateCsp=readCsp(path.join(repo,'_headers'));
const trustedCsp=readCsp(path.resolve(__dirname,'../_headers'));
if(trustedCsp&&!candidateCsp)throw new Error('PR removed the required CSP header');
const csp=candidateCsp||pr2Csp;
const isolation="default-src 'none'; base-uri 'self'; object-src 'none'; frame-src 'none'; frame-ancestors 'none'; form-action 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'none'; worker-src 'none'";
const guard=`window.supabase=undefined;const diagnostics={errors:[],network:[],policy:[]};const sync=()=>document.documentElement.setAttribute('data-offline-diagnostics',JSON.stringify(diagnostics));const deny=(kind,url)=>{diagnostics.network.push(kind+':'+String(url));sync();throw new Error('Offline test blocks '+kind);};window.fetch=(url)=>{try{deny('fetch',url);}catch(e){return Promise.reject(e);}};window.XMLHttpRequest=function(){deny('XHR','');};window.WebSocket=function(url){deny('WebSocket',url);};navigator.sendBeacon=url=>{deny('beacon',url);};window.open=url=>{deny('window.open',url);};addEventListener('error',e=>{diagnostics.errors.push(e.message);sync();});addEventListener('unhandledrejection',e=>{diagnostics.errors.push(String(e.reason));sync();});addEventListener('securitypolicyviolation',e=>{diagnostics.policy.push(e.violatedDirective+':'+e.blockedURI);sync();});sync();`;
const vendor={
  '/vendor/react.js':path.join(path.dirname(require.resolve('react/package.json')),'umd/react.production.min.js'),
  '/vendor/react-dom.js':path.join(path.dirname(require.resolve('react-dom/package.json')),'umd/react-dom.production.min.js'),
  '/vendor/babel.js':require.resolve('@babel/standalone/babel.min.js'),
};
let html=fs.readFileSync(path.join(repo,'index.html'),'utf8');
for(const [remote,local] of [
  ['https://cdnjs.cloudflare.com/ajax/libs/react/18.3.1/umd/react.production.min.js','/vendor/react.js'],
  ['https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.3.1/umd/react-dom.production.min.js','/vendor/react-dom.js'],
  ['https://cdnjs.cloudflare.com/ajax/libs/babel-standalone/7.24.7/babel.min.js','/vendor/babel.js'],
  ['https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2','/offline-sdk.js']
]){if(!html.includes(remote))throw new Error('Review browser fixture library mapping: '+remote);html=html.replace(remote,local);}
html=html.replace('<head>','<head><script src="/offline-guard.js"></script>');
html=html.replace('</body>','<div style="position:fixed;top:5px;left:5px;z-index:999999;background:#fff4c8;padding:4px 8px;border-radius:5px;font:11px sans-serif">隔離ブラウザ検証 · 本番DB非接続</div></body>');
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.svg':'image/svg+xml'};
async function startFixture(){
  const missing=[];
  const server=http.createServer((request,response)=>{
    response.setHeader('Content-Security-Policy',[csp,isolation]);
    response.setHeader('X-Content-Type-Options','nosniff');response.setHeader('X-Frame-Options','DENY');response.setHeader('Cache-Control','no-store');
    if(!['GET','HEAD'].includes(request.method)){response.writeHead(405);return response.end();}
    const url=new URL(request.url,'http://127.0.0.1');let body,type='text/javascript; charset=utf-8';
    if(url.pathname==='/'||url.pathname==='/index.html'){body=html;type=mime['.html'];}
    else if(url.pathname==='/offline-guard.js'){body=guard;}
    else if(url.pathname==='/offline-sdk.js'){body='window.supabase=undefined;';}
    else if(vendor[url.pathname]){body=fs.readFileSync(vendor[url.pathname]);}
    else {
      let name;try{name=decodeURIComponent(url.pathname).replace(/^\/+/, '');}catch{response.writeHead(400);return response.end();}
      const allowed=/^(assets\/|images\/|legal\/|privacy\/|terms\/|account-deletion\/|community-guidelines\/|contact\/|style\.css$|[^/]+\.(png|jpg|webp)$)/.test(name);
      if(!allowed||name.split('/').some(n=>n==='..'||n.startsWith('.'))){response.writeHead(404);return response.end();}
      let file=path.resolve(repo,name);
      if(!file.startsWith(repo+path.sep)){response.writeHead(403);return response.end();}
      if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');
      if(!fs.existsSync(file)){missing.push(url.pathname);response.writeHead(404);return response.end();}
      body=fs.readFileSync(file);type=mime[path.extname(file)]||'application/octet-stream';
    }
    response.setHeader('Content-Type',type);response.writeHead(200);response.end(request.method==='HEAD'?undefined:body);
  });
  server.listen(0,'127.0.0.1');await once(server,'listening');
  return {server,missing,origin:'http://127.0.0.1:'+server.address().port};
}
module.exports={startFixture};
