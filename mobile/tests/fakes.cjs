// In-memory stand-ins for the native plugins (no device, no network). They mirror the plugin
// methods the shell calls; a separate test checks those methods exist in the vendored plugins.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
// Plugin rejections are built the way Capacitor's native-bridge.js does it: the native {message, code}
// copied onto a CapacitorException from the vendored core.
const sandbox={console};sandbox.globalThis=sandbox;
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'..','node_modules','@capacitor','core','dist','capacitor.js'),'utf8'),sandbox);
const CapacitorException=sandbox.capacitorExports.CapacitorException;
function pluginError(error){return Object.keys(error).reduce((err,k)=>{err[k]=error[k];return err;},new CapacitorException(''));}
// The error @capacitor/filesystem returns for a missing file (FilesystemErrors.doesNotExist / fileNotFound).
const notFound=(method,p)=>pluginError({message:`'${method}' failed because file at '${p}' does not exist.`,code:'OS-PLUG-FILE-0008'});
const ioFailure=method=>pluginError({message:`'${method}' failed with: I/O error`,code:'OS-PLUG-FILE-0013'});
function fakeFilesystem(files=new Map()){
  // fail.<op>: true = I/O failure (OS-PLUG-FILE-0013); fail.<op>For: Set of paths that fail.
  const fail={write:false,read:false,stat:false,remove:false,readFor:new Set()};
  const calls=[];
  const key=o=>o.directory+'/'+o.path;
  return {files,fail,calls,
    async readFile(o){calls.push(['read',o.path,o.directory]);if(fail.read||fail.readFor.has(o.path))throw ioFailure('readFile');if(!files.has(key(o)))throw notFound('readFile',o.path);return {data:files.get(key(o))};},
    async writeFile(o){calls.push(['write',o.path,o.directory]);if(fail.write)throw ioFailure('writeFile');files.set(key(o),o.data);return {uri:'file://'+key(o)};},
    async deleteFile(o){calls.push(['delete',o.path,o.directory]);if(fail.remove)throw ioFailure('deleteFile');if(!files.has(key(o)))throw notFound('deleteFile',o.path);files.delete(key(o));},
    async stat(o){calls.push(['stat',o.path,o.directory]);if(fail.stat)throw ioFailure('stat');if(!files.has(key(o)))throw notFound('stat',o.path);return {type:'file',size:files.get(key(o)).length};}
  };
}
function fakeSecureStorage(items=new Map()){
  const s={items,calls:[],prefix:'capacitor-storage_',access:0,sync:null,fail:{set:false,clear:false}};
  Object.assign(s,{
    async setKeyPrefix(p){s.calls.push(['prefix',p]);s.prefix=p;},
    async setDefaultKeychainAccess(a){s.calls.push(['access',a]);s.access=a;},
    async setSynchronize(v){s.calls.push(['sync',v]);s.sync=v;},
    async getItem(k){return items.has(s.prefix+k)?items.get(s.prefix+k):null;},
    async setItem(k,v){s.calls.push(['set',k]);if(s.fail.set)throw new Error('Keychain error');items.set(s.prefix+k,v);},
    async removeItem(k){s.calls.push(['remove',k]);items.delete(s.prefix+k);},
    async clear(){s.calls.push(['clear']);if(s.fail.clear)throw new Error('Keychain error');for(const k of [...items.keys()])if(k.startsWith(s.prefix))items.delete(k);}
  });
  return s;
}
// Installs the stand-ins on a jsdom window before the shell scripts run.
function installNative(w,{native=true,platform='android',fsys=fakeFilesystem(),secure=fakeSecureStorage(),log}){
  w.Capacitor={isNativePlatform:()=>native,getPlatform:()=>native?platform:'web',registerPlugin:name=>name==='Filesystem'?fsys:undefined};
  w.capacitorApp={App:{addListener:(name,fn)=>{(log.listeners[name]=log.listeners[name]||[]).push(fn);return Promise.resolve({remove(){}});},
    getLaunchUrl:()=>Promise.resolve(null),minimizeApp:()=>{log.minimized++;}}};
  w.capacitorBrowser={Browser:{open:async o=>{log.open.push(o.url);},close:async()=>{log.close++;}}};
  w.capacitorSecureStorage={SecureStorage:secure};
  return {fsys,secure};
}
const fire=(log,name,arg)=>(log.listeners[name]||[]).forEach(fn=>fn(arg));
// For whole-app tests: served in place of vendor/capacitor.js so the real vendored plugin wrappers
// (capacitor-app.js, capacitor-browser.js, capacitor-secure-storage.js) register against the fakes.
const CORE_STUB='window.capacitorExports=window.__ytCoreStub;';
function installCoreStub(w){
  const plugins={App:w.capacitorApp.App,Browser:w.capacitorBrowser.Browser,SecureStorage:w.capacitorSecureStorage.SecureStorage};
  w.__ytCoreStub={Capacitor:w.Capacitor,CapacitorException,ExceptionCode:{},WebPlugin:class{},
    registerPlugin:name=>{if(!plugins[name])throw new Error('unexpected plugin '+name);return plugins[name];}};
}
module.exports={fakeFilesystem,fakeSecureStorage,installNative,installCoreStub,CORE_STUB,fire,pluginError,CapacitorException};
