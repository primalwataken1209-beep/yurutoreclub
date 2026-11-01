// DRAFT, not deployed and not imported by any Edge Function.
// Revokes a deleting user's Sign in with Apple authorization and proves it before account data is deleted.
// Pure ESM using WebCrypto and an injected fetch, so it runs in Deno (Edge) and in Node tests.
//
// Why each step exists (Apple "Token revocation" / "Token validation" / "Verifying a user"; RFC 7009 §2.2):
// - /auth/revoke answers 200 even for a token that "was previously invalid", so 200 alone proves nothing.
// - The server therefore obtains an id_token from Apple itself (code or refresh grant), checks that it belongs to
//   the deleting user's Apple identity, revokes, and then confirms the refresh grant now fails.
// - A client-supplied identity token is only trusted after signature, iss, aud, exp, iat and nonce checks.
const APPLE='https://appleid.apple.com';
const enc=new TextEncoder();

const b64url=bytes=>{let s='';for(const b of new Uint8Array(bytes))s+=String.fromCharCode(b);return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');};
const fromB64url=s=>{const b=atob(s.replace(/-/g,'+').replace(/_/g,'/')+'==='.slice((s.length+3)%4));return Uint8Array.from(b,c=>c.charCodeAt(0));};
const json64=o=>b64url(enc.encode(JSON.stringify(o)));
class AppleRevokeError extends Error{constructor(code){super(code);this.code=code;}}
const fail=code=>{throw new AppleRevokeError(code);};

/* client_secret: ES256 JWT signed with the Sign in with Apple key (.p8 imported as a CryptoKey by the caller). */
export async function createClientSecret({teamId,keyId,clientId,privateKey,now,ttlSec=300}){
  const iat=Math.floor(now/1000);
  const data=json64({alg:'ES256',kid:keyId})+'.'+json64({iss:teamId,iat,exp:iat+ttlSec,aud:APPLE,sub:clientId});
  const sig=await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},privateKey,enc.encode(data));
  return data+'.'+b64url(sig);
}

async function sha256Hex(s){
  const d=new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(s)));
  return [...d].map(b=>b.toString(16).padStart(2,'0')).join('');
}

/* Verifies an Apple identity token against Apple's published keys and the expected identity. */
export async function verifyIdentityToken(token,{clientId,expectedSub,nonceHash,now,maxAgeSec=600,jwks}){
  const parts=typeof token==='string'?token.split('.'):[];
  if(parts.length!==3)fail('apple_proof_invalid');
  let header,claims;
  try{header=JSON.parse(new TextDecoder().decode(fromB64url(parts[0])));claims=JSON.parse(new TextDecoder().decode(fromB64url(parts[1])));}
  catch(e){fail('apple_proof_invalid');}
  const jwk=(jwks||[]).find(k=>k.kid===header.kid);
  if(!jwk||(header.alg!=='RS256'&&header.alg!=='ES256')||(jwk.alg&&jwk.alg!==header.alg))fail('apple_proof_invalid');
  const algo=header.alg==='RS256'?{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'}:{name:'ECDSA',namedCurve:'P-256',hash:'SHA-256'};
  let ok=false;
  try{
    const key=await crypto.subtle.importKey('jwk',jwk,algo,false,['verify']);
    ok=await crypto.subtle.verify(algo,key,fromB64url(parts[2]),enc.encode(parts[0]+'.'+parts[1]));
  }catch(e){ok=false;}
  const t=Math.floor(now/1000);
  if(!ok||claims.iss!==APPLE||claims.aud!==clientId||typeof claims.exp!=='number'||claims.exp<=t||
     typeof claims.iat!=='number'||claims.iat>t+60||t-claims.iat>maxAgeSec)fail('apple_proof_invalid');
  if(nonceHash!==undefined&&claims.nonce!==nonceHash)fail('apple_proof_invalid');
  if(claims.sub!==expectedSub)fail('apple_identity_mismatch');
  return claims;
}

/* The Apple account ID recorded by Supabase for this user, or null if the user never used Apple. */
export function appleSubOf(user){
  const ids=(user&&user.identities||[]).filter(i=>i&&i.provider==='apple');
  if(!ids.length)return null;
  const subs=new Set(ids.flatMap(i=>[i.provider_id,i.identity_data&&i.identity_data.sub].filter(Boolean)));
  if(subs.size!==1)fail('apple_identity_mismatch');
  return [...subs][0];
}

async function post(deps,path,form){
  const ctl=new AbortController();
  let timer;
  const timeout=new Promise((_,rej)=>{timer=setTimeout(()=>{ctl.abort();rej(new AppleRevokeError('apple_timeout'));},deps.timeoutMs||8000);});
  try{
    const res=await Promise.race([deps.fetch(APPLE+path,{method:'POST',signal:ctl.signal,
      headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams(form).toString()}),timeout]);
    let body=null;try{body=await Promise.race([res.json(),timeout]);}catch(e){if(e instanceof AppleRevokeError)throw e;body=null;}
    return {status:res.status,body};
  }catch(e){
    if(e instanceof AppleRevokeError)throw e;
    fail('apple_timeout');   // network failure or abort: treat like a timeout, nothing is deleted
  }finally{clearTimeout(timer);}
}

/* Revokes the user's Apple authorization and proves it. Never returns or logs tokens or secrets.
   proof: {type:'authorization_code', code, identityToken, rawNonce} (native re-authentication) or
          {type:'refresh_token', refreshToken} (provider refresh token from a fresh Supabase re-authentication). */
export async function revokeAppleAuthorization({user,authTime,reauthUserId,proof,config,deps}){
  try{
    const sub=appleSubOf(user);
    if(!sub)return {ok:true,skipped:'no_apple_identity'};
    if(!proof||!proof.type)fail('apple_reauth_required');
    if(reauthUserId!==undefined&&reauthUserId!==user.id)fail('reauth_user_mismatch');
    const now=deps.now();
    if(typeof authTime!=='number'||Math.floor(now/1000)-authTime>(config.maxReauthAgeSec||600))fail('reauth_too_old');
    if(!config||!config.teamId||!config.keyId||!config.clientId||!config.privateKey)fail('apple_config_missing');
    const jwks=await deps.getAppleKeys();
    const secret=await createClientSecret({...config,now});
    const base={client_id:config.clientId,client_secret:secret};
    let refreshToken;
    if(proof.type==='authorization_code'){
      if(!proof.code||!proof.identityToken||!proof.rawNonce)fail('apple_reauth_required');
      // The device's identity token must be this user's Apple account and carry our nonce, before the code is used.
      await verifyIdentityToken(proof.identityToken,{clientId:config.clientId,expectedSub:sub,nonceHash:await sha256Hex(proof.rawNonce),now,jwks});
      const r=await post(deps,'/auth/token',{...base,grant_type:'authorization_code',code:proof.code});
      if(r.status!==200||!r.body||!r.body.refresh_token||!r.body.id_token)fail('apple_code_rejected');
      await verifyIdentityToken(r.body.id_token,{clientId:config.clientId,expectedSub:sub,now,jwks});
      refreshToken=r.body.refresh_token;
    }else if(proof.type==='refresh_token'){
      if(!proof.refreshToken)fail('apple_reauth_required');
      // Apple returns an id_token only for a refresh token it issued to this client: that binds token and identity.
      const r=await post(deps,'/auth/token',{...base,grant_type:'refresh_token',refresh_token:proof.refreshToken});
      if(r.status!==200||!r.body||!r.body.id_token)fail('apple_refresh_rejected');
      await verifyIdentityToken(r.body.id_token,{clientId:config.clientId,expectedSub:sub,now,jwks,maxAgeSec:600});
      refreshToken=proof.refreshToken;
    }else fail('apple_reauth_required');
    const rv=await post(deps,'/auth/revoke',{...base,token:refreshToken,token_type_hint:'refresh_token'});
    if(rv.status!==200)fail('apple_revoke_failed');
    // 200 is also returned for tokens that were already invalid: confirm the refresh grant is now refused.
    const check=await post(deps,'/auth/token',{...base,grant_type:'refresh_token',refresh_token:refreshToken});
    if(check.status!==400||!check.body||check.body.error!=='invalid_grant')fail('apple_revoke_unconfirmed');
    return {ok:true,revoked:true};
  }catch(e){
    return {ok:false,code:e instanceof AppleRevokeError?e.code:'apple_unexpected'};
  }
}

/* Account deletion with Apple: delete only after a proven revocation (or when the user never used Apple). */
export async function deleteAccountWithApple({revoke,deleteAll,...args}){
  const r=await revoke(args);
  if(!r.ok)return {ok:false,step:'apple_revoke',code:r.code};
  await deleteAll();
  return {ok:true,apple:r.revoked?'revoked':r.skipped};
}
