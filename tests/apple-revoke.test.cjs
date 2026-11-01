const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { webcrypto: crypto } = require('node:crypto');
// Isolated: an in-memory stand-in for appleid.apple.com and keys generated for this run only (not Apple keys).
const mod = () => import(pathToFileURL(path.resolve('supabase/drafts/apple-revoke/apple_revoke.mjs')).href);
const enc = new TextEncoder();
const b64url = b => Buffer.from(b).toString('base64url');
const USER = '11111111-1111-1111-1111-111111111111', SUB = '000123.applesub.0001', OTHER_SUB = '000999.othersub.0002';
const CLIENT = 'club.yurutore.app', TEAM = '9S43D53PCM', KID = 'TESTKEY001';

async function setup(opts = {}) {
  const m = await mod();
  const rsa = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  const ec = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const jwk = { ...(await crypto.subtle.exportKey('jwk', rsa.publicKey)), kid: 'apple-test-kid', alg: 'RS256', use: 'sig' };
  const now = () => opts.now || 1_800_000_000_000;
  const t = () => Math.floor(now() / 1000);
  const idToken = async (claims, key = rsa.privateKey) => {
    const data = b64url(JSON.stringify({ alg: 'RS256', kid: 'apple-test-kid' })) + '.' +
      b64url(JSON.stringify({ iss: 'https://appleid.apple.com', aud: CLIENT, iat: t(), exp: t() + 600, ...claims }));
    return data + '.' + b64url(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, enc.encode(data)));
  };
  // Apple stand-in: single-use codes, refresh tokens per Apple account, revoke answers 200 even for unknown tokens.
  const apple = { calls: [], codes: new Map(), tokens: new Map(), revoked: new Set(), secretClaims: [], n: 0 };
  apple.code = sub => { const c = 'code-' + (++apple.n); apple.codes.set(c, sub); return c; };
  apple.refresh = sub => { const r = 'rt-' + (++apple.n); apple.tokens.set(r, sub); return r; };
  const fetch = async (url, init) => {
    const u = new URL(url), f = new URLSearchParams(init.body), route = u.pathname + (f.get('grant_type') ? ':' + f.get('grant_type') : '');
    apple.calls.push(route);
    if (opts.hang === route) return new Promise(() => {});
    const [h, p, s] = f.get('client_secret').split('.');
    const okSig = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, ec.publicKey, Buffer.from(s, 'base64url'), enc.encode(h + '.' + p));
    const claims = JSON.parse(Buffer.from(p, 'base64url'));apple.secretClaims.push({ header: JSON.parse(Buffer.from(h, 'base64url')), claims });
    const reply = (status, body) => ({ status, json: async () => body });
    if (!okSig || f.get('client_id') !== CLIENT) return reply(401, { error: 'invalid_client' });
    if (route === '/auth/token:authorization_code') {
      const sub = apple.codes.get(f.get('code')); apple.codes.delete(f.get('code'));
      if (!sub) return reply(400, { error: 'invalid_grant' });
      return reply(200, { access_token: 'at', token_type: 'Bearer', expires_in: 3600, refresh_token: apple.refresh(sub), id_token: await idToken({ sub }) });
    }
    if (route === '/auth/token:refresh_token') {
      const r = f.get('refresh_token'), sub = apple.tokens.get(r);
      if (!sub || apple.revoked.has(r)) return reply(400, { error: 'invalid_grant' });
      return reply(200, { access_token: 'at', token_type: 'Bearer', expires_in: 3600, id_token: await idToken({ sub }) });
    }
    if (u.pathname === '/auth/revoke') { if (!opts.revokeNoop) apple.revoked.add(f.get('token')); return reply(200, null); }
    return reply(404, {});
  };
  const user = { id: USER, identities: [{ provider: 'apple', provider_id: SUB, identity_data: { sub: SUB } }] };
  const config = { teamId: TEAM, keyId: KID, clientId: CLIENT, privateKey: ec.privateKey };
  // Server-side nonce store: issued for one user, expires, single use.
  const nonces = new Map();
  const issueNonce = (userId = USER, ttl = 300) => { const n = 'nonce-' + (++apple.n); nonces.set(n, { userId, exp: t() + ttl }); return n; };
  const consumeNonce = async ({ userId, nonce, now: at }) => { const e = nonces.get(nonce); nonces.delete(nonce);
    return !!e && e.userId === userId && Math.floor(at / 1000) <= e.exp; };
  const deps = { fetch, now, timeoutMs: 200, getAppleKeys: async () => [jwk], consumeNonce };
  const nonce = issueNonce();
  const nonceHash = Buffer.from(await crypto.subtle.digest('SHA-256', enc.encode(nonce))).toString('hex');
  const deleted = [];
  const run = (over = {}) => m.deleteAccountWithApple({ user, config, deps, revoke: m.revokeAppleAuthorization,
    deleteAll: async () => { deleted.push(apple.calls.length); }, ...over });
  // What the server builds after admin.auth.getUser(<re-authentication JWT>) succeeded: never client input.
  const evidence = (userId = USER, timestamp = t() - 30, extra = {}) =>
    m.createReauthEvidence({ verifiedUser: { id: userId }, verifiedClaims: { sub: userId, iat: t(), amr: [{ method: 'oauth', timestamp }], ...extra } });
  const hashOf = async n => Buffer.from(await crypto.subtle.digest('SHA-256', enc.encode(n))).toString('hex');
  return { m, apple, user, config, deps, idToken, nonce, nonceHash, run, deleted, t, rsa, issueNonce, evidence, hashOf };
}
// Each native proof uses a fresh server-issued nonce (single use).
const nativeProof = async (s, sub = SUB, extra = {}, nonce = s.issueNonce()) => ({ type: 'authorization_code', code: s.apple.code(sub),
  identityToken: await s.idToken({ sub, nonce: await s.hashOf(nonce), ...extra }), rawNonce: nonce });

test('client secret is a short-lived ES256 JWT for this team and client', async () => {
  const s = await setup(); const p = await nativeProof(s);
  assert.deepEqual(await s.run({ proof: p }), { ok: true, apple: 'revoked' });
  const { header, claims } = s.apple.secretClaims[0];
  assert.deepEqual(header, { alg: 'ES256', kid: KID });
  assert.equal(claims.iss, TEAM); assert.equal(claims.sub, CLIENT); assert.equal(claims.aud, 'https://appleid.apple.com');
  assert.ok(claims.exp - claims.iat <= 300);
});
test('native proof: code exchanged, revoked, refusal confirmed, then deleted (in that order)', async () => {
  const s = await setup(); const r = await s.run({ proof: await nativeProof(s) });
  assert.equal(r.ok, true);
  assert.deepEqual(s.apple.calls, ['/auth/token:authorization_code', '/auth/revoke', '/auth/token:refresh_token']);
  assert.deepEqual(s.deleted, [3], 'deleted once, after all three Apple calls');
});
test('refresh proof from a fresh Supabase re-authentication is bound through Apple\'s id_token', async () => {
  const s = await setup(); const rt = s.apple.refresh(SUB);
  const r = await s.run({ proof: { type: 'refresh_token', refreshToken: rt }, reauth: s.evidence() });
  assert.equal(r.ok, true);
  assert.deepEqual(s.apple.calls, ['/auth/token:refresh_token', '/auth/revoke', '/auth/token:refresh_token']);
  assert.equal(s.deleted.length, 1);
});
test('a user who never used Apple is deleted without any Apple call', async () => {
  const s = await setup();
  const r = await s.run({ user: { id: USER, identities: [{ provider: 'email', provider_id: USER }] }, proof: undefined });
  assert.deepEqual(r, { ok: true, apple: 'no_apple_identity' }); assert.deepEqual(s.apple.calls, []); assert.equal(s.deleted.length, 1);
});
const refused = async (s, over, code, calls) => {
  const r = await s.run(over);
  assert.deepEqual(r, { ok: false, step: 'apple_revoke', code }, JSON.stringify(r));
  assert.deepEqual(s.deleted, [], 'nothing deleted');
  if (calls) assert.deepEqual(s.apple.calls, calls);
};
test('no proof, stale re-authentication or another Supabase user: nothing is deleted', async () => {
  const s = await setup(); const rt = () => ({ type: 'refresh_token', refreshToken: s.apple.refresh(SUB) });
  await refused(s, { proof: undefined }, 'apple_reauth_required', []);
  await refused(s, { proof: rt(), reauth: s.evidence(USER, s.t() - 3600) }, 'reauth_too_old', []);
  await refused(s, { proof: rt(), reauth: s.evidence('22222222-2222-2222-2222-222222222222') }, 'reauth_user_mismatch', []);
});
test('Work 14b251b boundary: the refresh path requires server-made re-authentication evidence', async () => {
  const s = await setup(); const rt = () => ({ type: 'refresh_token', refreshToken: s.apple.refresh(SUB) });
  await refused(s, { proof: rt() }, 'reauth_untrusted', []);
  // A client-sent object with the right shape is not evidence.
  await refused(s, { proof: rt(), reauth: { userId: USER, authTime: s.t() - 10 } }, 'reauth_untrusted', []);
  await refused(s, { proof: rt(), reauth: JSON.parse(JSON.stringify(s.evidence())) }, 'reauth_untrusted', []);
});
test('Work 14b251b boundary: re-authentication times must be finite, recent and not in the future', async () => {
  const s = await setup(); const rt = () => ({ type: 'refresh_token', refreshToken: s.apple.refresh(SUB) });
  await refused(s, { proof: rt(), reauth: s.evidence(USER, s.t() + 86400) }, 'reauth_too_old', []);
  await refused(s, { proof: rt(), reauth: s.evidence(USER, s.t() + 120) }, 'reauth_too_old', []);
  for (const bad of [NaN, Infinity, -Infinity, 1.5, '1800000000', null])
    assert.throws(() => s.evidence(USER, bad), /reauth_untrusted/, String(bad));
  // Native path: a future identity token time is refused too.
  await refused(s, { proof: await nativeProof(s, SUB, { iat: s.t() + 86400, exp: s.t() + 90000 }) }, 'apple_proof_invalid');
});
test('re-authentication evidence uses the OAuth sign-in time from amr, not iat, and only verified claims', async () => {
  const s = await setup(); const rt = () => ({ type: 'refresh_token', refreshToken: s.apple.refresh(SUB) });
  // iat is fresh (token refreshed) but the OAuth sign-in was an hour ago.
  await refused(s, { proof: rt(), reauth: s.evidence(USER, s.t() - 3600, { iat: s.t() }) }, 'reauth_too_old', []);
  assert.throws(() => s.m.createReauthEvidence({ verifiedUser: { id: USER }, verifiedClaims: { sub: 'someone-else', amr: [{ method: 'oauth', timestamp: s.t() }] } }), /reauth_untrusted/);
  assert.throws(() => s.m.createReauthEvidence({ verifiedUser: { id: USER }, verifiedClaims: { sub: USER, iat: s.t(), amr: [{ method: 'password', timestamp: s.t() }] } }), /reauth_untrusted/);
  assert.throws(() => s.m.createReauthEvidence({ verifiedUser: { id: USER }, verifiedClaims: { sub: USER, iat: s.t() } }), /reauth_untrusted/);
  assert.ok(Object.isFrozen(s.evidence()));
});
test('native nonce must be issued by the server for this user, unexpired and unused', async () => {
  const s = await setup();
  await refused(s, { proof: await nativeProof(s, SUB, {}, 'client-made-nonce') }, 'apple_nonce_invalid', []);
  await refused(s, { proof: await nativeProof(s, SUB, {}, s.issueNonce('22222222-2222-2222-2222-222222222222')) }, 'apple_nonce_invalid', []);
  await refused(s, { proof: await nativeProof(s, SUB, {}, s.issueNonce(USER, -1)) }, 'apple_nonce_invalid', []);
  const used = s.issueNonce();
  await refused(s, { proof: await nativeProof(s, OTHER_SUB, {}, used) }, 'apple_identity_mismatch', []);
  await refused(s, { proof: await nativeProof(s, SUB, {}, used) }, 'apple_nonce_invalid', []);   // already consumed
  await refused(s, { proof: await nativeProof(s), deps: { ...s.deps, consumeNonce: undefined } }, 'apple_config_missing', []);
});
test('a deleting user that is not a server-verified user object is refused', async () => {
  const s = await setup();
  await refused(s, { user: undefined, proof: await nativeProof(s) }, 'reauth_untrusted', []);
  await refused(s, { user: { identities: s.user.identities }, proof: await nativeProof(s) }, 'reauth_untrusted', []);
});
test('re-authenticating with a different Apple account is refused before the code is used', async () => {
  const s = await setup();
  await refused(s, { proof: await nativeProof(s, OTHER_SUB) }, 'apple_identity_mismatch', []);
});
test('an arbitrary or someone else\'s refresh token is refused and nothing is revoked', async () => {
  const s = await setup();
  await refused(s, { proof: { type: 'refresh_token', refreshToken: 'made-up' }, reauth: s.evidence() }, 'apple_refresh_rejected', ['/auth/token:refresh_token']);
  const s2 = await setup();
  await refused(s2, { proof: { type: 'refresh_token', refreshToken: s2.apple.refresh(OTHER_SUB) }, reauth: s2.evidence() }, 'apple_identity_mismatch', ['/auth/token:refresh_token']);
  assert.equal(s2.apple.revoked.size, 0);
});
test('a reused authorization code is refused', async () => {
  const s = await setup(); const p = await nativeProof(s);
  assert.equal((await s.m.revokeAppleAuthorization({ user: s.user, config: s.config, deps: s.deps, proof: p })).ok, true);
  s.apple.calls.length = 0;
  // Same code with a new valid nonce: Apple refuses the reused code.
  const again = { ...p, rawNonce: s.issueNonce() };
  again.identityToken = await s.idToken({ sub: SUB, nonce: await s.hashOf(again.rawNonce) });
  await refused(s, { proof: again }, 'apple_code_rejected', ['/auth/token:authorization_code']);
});
test('identity tokens with a wrong nonce, audience, issuer, expiry, age or signature are refused', async () => {
  const s = await setup();
  const forged = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign']);
  for (const [label, extra, key] of [['nonce', { nonce: 'other' }], ['aud', { aud: 'com.example.other' }], ['iss', { iss: 'https://evil.example' }],
    ['exp', { exp: s.t() - 1 }], ['iat', { iat: s.t() - 3600 }], ['iat string', { iat: String(s.t()) }], ['iat fraction', { iat: s.t() + 0.5 }],
    ['iat missing', { iat: null }], ['exp string', { exp: String(s.t() + 600) }], ['signature', {}, forged.privateKey]]) {
    const n = s.issueNonce();
    const p = { type: 'authorization_code', code: s.apple.code(SUB), identityToken: await s.idToken({ sub: SUB, nonce: await s.hashOf(n), ...extra }, key), rawNonce: n };
    s.apple.calls.length = 0;
    await refused(s, { proof: p }, 'apple_proof_invalid', []);
    assert.ok(true, label);
  }
  await refused(s, { proof: { type: 'authorization_code', code: 'x', identityToken: 'not-a-jwt', rawNonce: s.issueNonce() } }, 'apple_proof_invalid');
});
test('revoke answering 200 without effect is not accepted as proof', async () => {
  const s = await setup({ revokeNoop: true });
  await refused(s, { proof: await nativeProof(s) }, 'apple_revoke_unconfirmed',
    ['/auth/token:authorization_code', '/auth/revoke', '/auth/token:refresh_token']);
});
test('timeouts at any Apple step delete nothing', async () => {
  for (const hang of ['/auth/token:authorization_code', '/auth/revoke']) {
    const s = await setup({ hang });
    await refused(s, { proof: await nativeProof(s) }, 'apple_timeout');
  }
  const s = await setup({ hang: '/auth/token:refresh_token' });
  await refused(s, { proof: await nativeProof(s) }, 'apple_timeout');
});
test('missing server configuration deletes nothing', async () => {
  const s = await setup();
  await refused(s, { proof: await nativeProof(s), config: { ...s.config, privateKey: undefined } }, 'apple_config_missing', []);
});
test('conflicting Apple identity records are refused', async () => {
  const s = await setup();
  await refused(s, { proof: await nativeProof(s), user: { id: USER, identities: [{ provider: 'apple', provider_id: SUB, identity_data: { sub: OTHER_SUB } }] } }, 'apple_identity_mismatch', []);
});
test('results and module never expose tokens or secrets', async () => {
  const s = await setup(); const p = await nativeProof(s);
  const logs = []; const orig = { ...console };
  for (const k of ['log', 'warn', 'error', 'info', 'debug']) console[k] = (...a) => logs.push(a.join(' '));
  try { const r = await s.run({ proof: p }); const text = JSON.stringify(r);
    for (const secret of [p.code, p.identityToken, p.rawNonce, 'rt-']) assert.ok(!text.includes(secret)); }
  finally { Object.assign(console, orig); }
  assert.deepEqual(logs, []);
  const src = require('node:fs').readFileSync('supabase/drafts/apple-revoke/apple_revoke.mjs', 'utf8');
  assert.doesNotMatch(src, /console\./); assert.doesNotMatch(src, /localStorage|Deno\.env/);
});
