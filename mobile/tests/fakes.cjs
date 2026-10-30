// In-memory stand-ins for the native plugins (no device, no network). They mirror the plugin
// methods the shell calls; a separate test checks those methods exist in the vendored plugins.
function fakeFilesystem(files=new Map()){
  const fail={write:false,read:false,stat:false};
  const calls=[];
  const key=o=>o.directory+'/'+o.path;
  return {files,fail,calls,
    async readFile(o){calls.push(['read',o.path,o.directory]);if(fail.read||!files.has(key(o)))throw new Error('File does not exist');return {data:files.get(key(o))};},
    async writeFile(o){calls.push(['write',o.path,o.directory]);if(fail.write)throw new Error('No space left');files.set(key(o),o.data);return {uri:'file://'+key(o)};},
    async stat(o){calls.push(['stat',o.path,o.directory]);if(fail.stat||!files.has(key(o)))throw new Error('File does not exist');return {type:'file',size:files.get(key(o)).length};}
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
module.exports={fakeFilesystem,fakeSecureStorage,installNative,fire};
