// Conservative subset of Netlify route patterns. Unsupported patterns fail closed.
function parseHeaders(text){
  const blocks=[];let block;
  for(const line of text.split(/\r?\n/)){
    if(!line.trim()||line.trimStart().startsWith('#'))continue;
    if(!/^\s/.test(line)){
      const route=line.trim();
      if(!/^\/[A-Za-z0-9_./*-]*$/.test(route)||route.includes('**'))throw new Error('Unsupported header route: '+route);
      block={route,policies:[]};blocks.push(block);
    }else if(/^\s+Content-Security-Policy:/i.test(line)){
      if(!block)throw new Error('CSP without route');
      block.policies.push(line.replace(/^\s+Content-Security-Policy:\s*/i,''));
    }
  }
  return blocks;
}
function policiesFor(blocks,pathname){
  return blocks.filter(({route})=>new RegExp('^'+route.split('*').map(part=>part.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('.*')+'$').test(pathname)).flatMap(b=>b.policies);
}
function selectPolicies(candidate,trusted,pathname,fallback){
  const actual=policiesFor(candidate,pathname);
  if(!actual.length&&(policiesFor(trusted,pathname).length||candidate.some(b=>b.policies.length)))throw new Error('Missing CSP for '+pathname);
  return actual.length?actual:[fallback];
}
function assertScriptsAllowed(policies,urls){
  for(const policy of policies){
    const directives=new Map();
    for(const item of policy.split(';')){const [name,...sources]=item.trim().split(/\s+/);if(name&&!directives.has(name.toLowerCase()))directives.set(name.toLowerCase(),sources);}
    const sources=directives.get('script-src-elem')||directives.get('script-src')||directives.get('default-src');
    if(!sources)continue;
    if(sources.includes("'strict-dynamic'"))throw new Error('Review strict-dynamic CSP explicitly');
    for(const address of urls){
      const url=new URL(address);
      const allowed=sources.some(source=>{
        if(source==='*'||source===url.protocol)return true;
        // Only explicit HTTPS host sources are accepted here. More complex
        // policies require extending these checks rather than silently passing.
        if(!source.startsWith('https://'))return false;
        let host;try{host=new URL(source);}catch{return false;}
        const hostname=host.hostname.startsWith('*.')?url.hostname.endsWith(host.hostname.slice(1)):url.hostname===host.hostname;
        const pathname=host.pathname==='/'|| (host.pathname.endsWith('/')?url.pathname.startsWith(host.pathname):url.pathname===host.pathname);
        return url.protocol===host.protocol&&hostname&&url.port===host.port&&pathname;
      });
      if(!allowed)throw new Error('CSP blocks original dependency: '+address);
    }
  }
}
module.exports={parseHeaders,policiesFor,selectPolicies,assertScriptsAllowed};
