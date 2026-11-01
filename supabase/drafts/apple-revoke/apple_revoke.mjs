// DRAFT, not deployed and not imported by any Edge Function.
// Revokes a deleting user's Sign in with Apple authorization and proves it before account data is deleted.
// Pure ESM using WebCrypto and an injected fetch, so it runs in Deno (Edge) and in Node tests.
//
// Why each step exists (Apple "Token revocation" / "Token validation" / "Verifying a user"; RFC 7009 §2.2):
// - /auth/revoke answers 200 even for a token that "was previously invalid", so 200 alone proves nothing.
// - The server therefore obtains an id_token from Apple itself (code or refresh grant), checks that it belongs to
//   the deleting user's Apple identity, revokes, and then confirms the refresh grant now fails.
// - A client-supplied identity token is only trusted after signature, iss, aud, exp, iat and nonce checks.
//
// Trust boundaries (see docs/apple-token-revocation-design.md):
// - user: the deleting user as returned by the server's own admin.auth.getUser(<request JWT>). Never client JSON.
// - reauth: evidence made only by createReauthEvidence() from a re-authentication JWT the server verified itself.
//   Plain objects (for example a client-sent {userId, authTime}) are refused. JWT iat is not a re-authentication time.
// - proof: everything the client sends (code, identity token, raw nonce, refresh token). Untrusted until checked here.
// - nonce: issued by the server, bound to the user, short-lived and single-use, checked through deps.consumeNonce.
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
  if(!Number.isFinite(now))fail('apple_config_missing');
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
  if(!ok||claims.iss!==APPLE||claims.aud!==clientId||!Number.isInteger(claims.exp)||claims.exp<=t||
     !freshTime(claims.iat,now,maxAgeSec))fail('apple_proof_invalid');
  if(nonceHash!==undefined&&claims.nonce!==nonceHash)fail('apple_proof_invalid');
  if(claims.sub!==expectedSub)fail('apple_identity_mismatch');
  return claims;
}

const evidence=new WeakSet();
/* Re-authentication evidence from a Supabase JWT the server has already verified (admin.auth.getUser succeeded for it).
   The time comes from the JWT's amr entry for the OAuth sign-in, not from iat (which changes on every token refresh). */
export function createReauthEvidence({verifiedUser,verifiedClaims}){
  if(!verifiedUser||typeof verifiedUser.id!=='string'||!verifiedClaims||verifiedClaims.sub!==verifiedUser.id)fail('reauth_untrusted');
  const amr=Array.isArray(verifiedClaims.amr)?verifiedClaims.amr.filter(a=>a&&a.method==='oauth'):[];
  if(amr.length!==1||!Number.isInteger(amr[0].timestamp))fail('reauth_untrusted');
  const e=Object.freeze({userId:verifiedUser.id,authTime:amr[0].timestamp});
  evidence.add(e);
  return e;
}
function freshTime(sec,now,maxAgeSec){
  const t=Math.floor(now/1000);
  return Number.isInteger(sec)&&sec<=t+60&&t-sec<=maxAgeSec;   // finite, not in the future (60 s clock skew), recent
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
export async function revokeAppleAuthorization({user,reauth,proof,config,deps}){
  try{
    if(!user||typeof user.id!=='string')fail('reauth_untrusted');
    const sub=appleSubOf(user);
    if(!sub)return {ok:true,skipped:'no_apple_identity'};
    if(!proof||!proof.type)fail('apple_reauth_required');
    if(!config||!config.teamId||!config.keyId||!config.clientId||!config.privateKey)fail('apple_config_missing');
    const now=deps.now();
    if(!Number.isFinite(now))fail('apple_config_missing');
    const maxAge=config.maxReauthAgeSec||600;
    if(proof.type==='refresh_token'){
      // The refresh token alone does not show who re-authenticated: require server-made evidence for this user.
      if(!reauth||!evidence.has(reauth))fail('reauth_untrusted');
      if(reauth.userId!==user.id)fail('reauth_user_mismatch');
      if(!freshTime(reauth.authTime,now,maxAge))fail('reauth_too_old');
    }else if(proof.type==='authorization_code'){
      // Native re-authentication: freshness comes from the verified identity token; the nonce must be ours and unused.
      if(typeof deps.consumeNonce!=='function')fail('apple_config_missing');
      if(!proof.rawNonce||!(await deps.consumeNonce({userId:user.id,nonce:proof.rawNonce,now})))fail('apple_nonce_invalid');
    }
    const jwks=await deps.getAppleKeys();
    const secret=await createClientSecret({...config,now});
    const base={client_id:config.clientId,client_secret:secret};
    let refreshToken;
    if(proof.type==='authorization_code'){
      if(!proof.code||!proof.identityToken||!proof.rawNonce)fail('apple_reauth_required');
      // The device's identity token must be this user's Apple account and carry our nonce, before the code is used.
      await verifyIdentityToken(proof.identityToken,{clientId:config.clientId,expectedSub:sub,nonceHash:await sha256Hex(proof.rawNonce),now,jwks,maxAgeSec:maxAge});
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
