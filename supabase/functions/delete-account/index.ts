// ═══════════════════════════════════════════════════════════════════════════
// ゆるトレ倶楽部 — アカウント削除 Edge Function（U1 案・未適用・未配置）
//   supabase/functions/delete-account/index.ts
//
// 【U1 の考え方】（claude-handoff/upload-decision-u1-20261116.txt）
//   受付で本人を JWT から確かめ、非公開の削除ジョブを作る。ジョブがある間、その本人の JWT による作成・変更は
//   DB/Storage の規則で拒否される（supabase/manual/deletion_u1_prepare.sql）。そのうえで Storage → 関連の行 → Auth の順に消す。
//   許可の判定の後に完了する送信が残らないことは、公開資料では保証されない。だから最後まで終わっても「完了」とは言わず、
//   状態は AWAITING_ASSURANCE（確認待ち）にする。応答の ok は常に false（旧アプリに「削除しました」と伝えないため）。
//
// 【入口】
//   ・利用者: Authorization に本人のアクセストークン。受付と、Auth を消す前の続き。クライアントの user_id は使わない
//   ・運営の後処理: Authorization に service role key、本文 {job_id}。対象はジョブに保存された UID だけ（UID は受け取らない）
//
// 【必須の設定】 SUPABASE_URL、SERVICE_ROLE_KEY（または SUPABASE_SERVICE_ROLE_KEY）、
//   YT_ACCESS_TOKEN_TTL_SECONDS（プロジェクトのアクセストークンの有効期間。推測の既定値は持たない）、
//   YT_DELETION_LEASE_SECONDS（1つの呼び出しが同時に1つだけ進むための排他の長さ。60以上）
// ═══════════════════════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.118.0';

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
// Response contract after a request is accepted (a job exists): HTTP 200 with
//   { ok: false, accepted: true, contract: 'yt-deletion-v1', job: <uuid>, status: one of ACCEPTED_STATUSES, step? }
// The app treats a reply as "accepted" only when all of these match. Every failure after acceptance is still such a reply:
// the job keeps refusing writes and the operator entry continues it; the user does not need to sign in again.
// Failures before acceptance (config, authentication, accept) carry no `accepted` field.
const CONTRACT = 'yt-deletion-v1';
const ACCEPTED_STATUSES = ['in_progress', 'awaiting_assurance', 'needs_retry', 'needs_operator'];
const BUCKETS = ['avatars', 'post-images'];
const ALL_STATES = ['WRITES_BLOCKED', 'STORAGE_DELETING', 'STORAGE_VERIFIED', 'DB_DELETING', 'AUTH_DELETING', 'NEEDS_RETRY', 'NEEDS_OPERATOR'];
// Lease left that a step must still have before it starts an outside action (Storage removal, Auth deletion).
const MIN_LEASE_LEFT_SECONDS = 30;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
}
type Err = { message?: string; error?: string; code?: string; statusCode?: string | number } | null;
function isMissingBucket(e: Err): boolean {
  return !!e && (/bucket not found/i.test(String(e.message || '')) || /bucket not found/i.test(String(e.error || '')));
}
function isMissingRelation(e: Err): boolean {
  if (!e) return false;
  const code = String(e.code || ''), msg = String(e.message || '');
  return code === '42P01' || code === 'PGRST205' || /relation .* does not exist/i.test(msg) || /Could not find the table/i.test(msg) || /schema cache/i.test(msg);
}
function isUserNotFound(e: Err): boolean {
  return !!e && (/user not found/i.test(String(e.message || '')) || String(e.statusCode || '') === '404' || String(e.code || '') === 'user_not_found');
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST') return json({ ok: false, step: 'method', error: 'Method not allowed' }, 405);

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
  const SERVICE_ROLE_KEY = Deno.env.get('SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const TTL = Number(Deno.env.get('YT_ACCESS_TOKEN_TTL_SECONDS') ?? '');
  const LEASE = Number(Deno.env.get('YT_DELETION_LEASE_SECONDS') ?? '');
  // The Edge Function's maximum run time for this project's plan (Supabase docs, Limits: 150 s Free, 400 s paid). The lease must be
  // longer, so that when a lease expires the worker that held it has already been stopped by the platform. (Whether a request it sent
  // just before being stopped can still take effect afterwards is not documented; the steps after Auth deletion re-check for that.)
  const MAX_RUN = Number(Deno.env.get('YT_FUNCTION_MAX_SECONDS') ?? '');
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !Number.isInteger(TTL) || TTL <= 0 || !Number.isInteger(LEASE) || LEASE < 60
      || !Number.isInteger(MAX_RUN) || MAX_RUN <= 0 || LEASE <= MAX_RUN) {
    console.error('[delete-account] 設定が不足しています');
    return json({ ok: false, step: 'config', error: 'Server is not configured' }, 500);
  }
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return json({ ok: false, step: 'auth', error: 'Missing Authorization header' }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

  // ── 受付（利用者）または後処理（運営）でジョブを決める ──
  let jobId: string | null = null;
  let sessions = 'not_requested';
  if (token === SERVICE_ROLE_KEY) {
    let body: { job_id?: unknown; sweep?: unknown } = {};
    try { body = await req.json(); } catch (_) { /* empty */ }
    if (typeof body.job_id !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.job_id)) return json({ ok: false, step: 'job', error: 'job_id required' }, 400);
    jobId = body.job_id;
    if (body.sweep === true) {
      // Sweep (after the Auth deletion): remove whatever is found under the job's user prefixes and record it. Delete-only and
      // repeatable, so two sweeps at once are harmless. Never reports completion: an empty sweep is only an observation.
      const { data: target, error: targetErr } = await admin.rpc('yt_deletion_sweep_target', { p_job: jobId });
      if (targetErr || typeof target !== 'string') return json({ ok: false, step: 'sweep_target', error: 'job is not past the Auth deletion' }, 409);
      let removed = 0, remainingAfter = 0;
      // The storage outcome and the evidence write are reported apart. A failed listing/removal leaves the remaining count unknown
      // (null, never 0) and is recorded as a failed sweep; a recording that errors or returns false is itself needs_operator.
      const record = async (rem: number | null, err: string | null) => {
        const { data: ok, error: recErr } = await admin.rpc('yt_deletion_sweep_record', { p_job: jobId, p_removed: removed, p_remaining: rem, p_error: err });
        return !recErr && ok === true;
      };
      try {
        for (const b of BUCKETS) {
          for (let round = 0; round < 1000; round++) {
            const { data, error } = await admin.storage.from(b).list(target, { limit: 100, offset: 0 });
            if (error) { if (isMissingBucket(error)) break; throw error; }
            const names = (data ?? []).filter((f: { id?: string | null }) => f.id !== null).map((f: { name: string }) => `${target}/${f.name}`);
            if (names.length === 0) break;
            const { error: rmErr } = await admin.storage.from(b).remove(names);
            if (rmErr) throw rmErr;
            removed += names.length;
          }
          const { data: after, error: afterErr } = await admin.storage.from(b).list(target, { limit: 100, offset: 0 });
          if (afterErr && !isMissingBucket(afterErr)) throw afterErr;
          remainingAfter += (after ?? []).filter((f: { id?: string | null }) => f.id !== null).length;
        }
      } catch (e) {
        const msg = String((e as Err)?.message ?? e) || 'sweep failed';
        const recorded = await record(null, msg);
        return json({ ok: false, accepted: true, contract: CONTRACT, job: jobId, status: 'needs_operator', step: recorded ? 'sweep' : 'sweep_record',
          storage: 'failed', recorded, removed, remaining: null, error: msg });
      }
      const recorded = await record(remainingAfter, null);
      if (!recorded) return json({ ok: false, accepted: true, contract: CONTRACT, job: jobId, status: 'needs_operator', step: 'sweep_record',
        storage: 'ok', recorded, removed, remaining: remainingAfter, error: 'sweep result not recorded' });
      return json({ ok: false, accepted: true, contract: CONTRACT, job: jobId, status: remainingAfter > 0 ? 'needs_operator' : 'awaiting_assurance',
        step: 'sweep', storage: 'ok', recorded, removed, remaining: remainingAfter });
    }
  } else {
    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    const user = userData?.user ?? null;
    if (userErr || !user) return json({ ok: false, step: 'auth', error: 'Not authenticated' }, 401);
    const { data: accepted, error: acceptErr } = await admin.rpc('yt_deletion_accept', { p_user: user.id, p_token_ttl_seconds: TTL });
    if (acceptErr || !accepted) {
      console.error('[delete-account] 受付に失敗', acceptErr);
      return json({ ok: false, step: 'accept', error: 'Could not accept the request' }, 500);
    }
    jobId = String(accepted);
    // Sign out every session of this user: refresh tokens stop working. Access tokens already issued stay valid until they
    // expire (Supabase docs), so the job's write refusal is what stops them. A failure here is recorded, not fatal.
    try { const { error } = await admin.auth.admin.signOut(token, 'global'); sessions = error ? 'failed' : 'revoked'; }
    catch (_) { sessions = 'failed'; }
  }

  const accepted = (status: string, extra: Record<string, unknown> = {}) => {
    if (!ACCEPTED_STATUSES.includes(status)) status = 'needs_operator';
    return json({ ok: false, accepted: true, contract: CONTRACT, job: jobId, status, ...extra });
  };

  // Drain boundary: recorded once, after the refusal has committed (the accept call above is its own transaction).
  const { error: markErr } = await admin.rpc('yt_deletion_drain_mark', { p_job: jobId });
  if (markErr) return accepted('needs_retry', { step: 'drain_mark' });
  // Until every transaction that was running at that point has ended, do not start deleting: a completion that checked the
  // user's policies before the refusal may still be committing its object row. No waiting time is assumed; the call simply returns
  // "in progress" and the operator (or the user's next call) continues later.
  const { data: drained, error: drainErr } = await admin.rpc('yt_deletion_drained', { p_job: jobId });
  if (drainErr) return accepted('needs_retry', { step: 'drain_check' });
  if (drained !== true) return accepted('in_progress', { step: 'draining' });
  const evidence = async (kind: string) => { const { error } = await admin.rpc('yt_deletion_evidence', { p_job: jobId, p_kind: kind }); return !error; };
  if (!(await evidence('drained'))) return accepted('needs_retry', { step: 'evidence_drained' });

  // ── 排他を取る（取れなければ別の処理が進めている） ──
  const owner = crypto.randomUUID();
  const { data: claim, error: claimErr } = await admin.rpc('yt_deletion_claim', { p_job: jobId, p_owner: owner, p_lease_seconds: LEASE });
  if (claimErr) return accepted('needs_retry', { step: 'claim' });   // accepted: the job refuses writes; the operator continues
  if (!claim) return accepted('in_progress');
  const uid: string = claim.user_id;
  const gen: number = claim.generation;
  let state: string = claim.state;

  // Every state change is a compare-and-set on (generation, owner, from-state) with lease left; losing it stops this call.
  const advance = async (from: string[], to: string, note: Record<string, unknown>, authDeleted = false): Promise<boolean> => {
    const { data, error } = await admin.rpc('yt_deletion_advance', {
      p_job: jobId, p_generation: gen, p_owner: owner, p_from: from, p_to: to, p_note: note,
      p_min_lease_seconds: MIN_LEASE_LEFT_SECONDS, p_auth_deleted: authDeleted,
    });
    if (error || data !== true) return false;
    state = to;
    return true;
  };
  const stopped = () => accepted('in_progress');
  const failed = async (step: string, e: unknown, authDeleted = false) => {
    console.error('[delete-account] 失敗', step, e);
    const to = authDeleted ? 'NEEDS_OPERATOR' : 'NEEDS_RETRY';
    if (!(await advance([state], to, { step, error: String((e as Err)?.message ?? e) }, authDeleted))) return stopped();
    return accepted(to === 'NEEDS_OPERATOR' ? 'needs_operator' : 'needs_retry', { step });
  };
  // Lists every object under {uid}/ in a bucket, following pages to the end.
  const listAll = async (bucket: string): Promise<{ names: string[]; missing: boolean }> => {
    const names: string[] = [];
    for (let offset = 0; ; offset += 100) {
      const { data, error } = await admin.storage.from(bucket).list(uid, { limit: 100, offset });
      if (error) { if (isMissingBucket(error)) return { names, missing: true }; throw error; }
      const page = (data ?? []).filter((f: { id?: string | null }) => f.id !== null).map((f: { name: string }) => `${uid}/${f.name}`);
      names.push(...page);
      if ((data ?? []).length < 100) return { names, missing: false };
    }
  };
  const remaining = async (): Promise<number> => {
    let n = 0;
    for (const b of BUCKETS) n += (await listAll(b)).names.length;
    return n;
  };

  try {
    // ── Storage（何度実行しても同じ結果。途中で失敗したら、消した件数を記録して NEEDS_RETRY） ──
    if (!(await advance(ALL_STATES, 'STORAGE_DELETING', { sessions }))) return stopped();
    const removed: Record<string, number> = {};
    for (const b of BUCKETS) {
      removed[b] = 0;
      for (let round = 0; round < 1000; round++) {
        let found;
        try { found = await listAll(b); } catch (e) { return await failed(`storage_list:${b}`, e); }
        if (found.missing || found.names.length === 0) break;
        const batch = found.names.slice(0, 100);
        const { error } = await admin.storage.from(b).remove(batch);
        if (error) {
          await advance([state], state, { step: `storage_remove:${b}`, removed: { ...removed } });   // record the partial result
          return await failed(`storage_remove:${b}`, error);
        }
        removed[b] += batch.length;
      }
    }
    let left: number;
    try { left = await remaining(); } catch (e) { return await failed('storage_verify', e); }
    if (left !== 0) return await failed('storage_verify', `objects remain: ${left}`);
    if (!(await advance(['STORAGE_DELETING'], 'STORAGE_VERIFIED', { removed }))) return stopped();

    // ── 関連の行（profiles 以下は外部キーの連鎖） ──
    if (!(await advance(['STORAGE_VERIFIED'], 'DB_DELETING', {}))) return stopped();
    const rows: [string, string][] = [['user_progress', 'user_id'], ['app_events', 'user_id'], ['blocks', 'blocker_id'],
      ['blocks', 'blocked_id'], ['reports', 'reporter_user_id'], ['profiles', 'id']];
    for (const [table, col] of rows) {
      const { error } = await admin.from(table).delete().eq(col, uid);
      if (error && !isMissingRelation(error)) return await failed(`db:${table}`, error);
    }

    // ── Auth（直前に排他を取り直し、Storage が空のことを確かめてから） ──
    if (!(await advance(['DB_DELETING'], 'AUTH_DELETING', {}))) return stopped();
    try { left = await remaining(); } catch (e) { return await failed('storage_recheck', e); }
    if (left !== 0) return await failed('storage_recheck', `objects reappeared: ${left}`);
    if (!(await advance(['AUTH_DELETING'], 'AUTH_DELETING', { check: 'before_auth_delete' }))) return stopped();
    const { error: authErr } = await admin.auth.admin.deleteUser(uid);
    if (authErr && !isUserNotFound(authErr)) return await failed('auth_delete', authErr);   // e.g. still owns objects → retry from Storage
    if (!(await evidence('auth_deleted'))) return await failed('evidence_auth_deleted', 'could not record', true);

    // ── Auth の後の確認。0 件でも「完了」ではなく確認待ち（観測であって保証ではない） ──
    try { left = await remaining(); } catch (e) { return await failed('storage_after_auth', e, true); }
    if (left !== 0) return await failed('storage_after_auth', `objects after auth deletion: ${left}`, true);
    if (!(await evidence('final_empty'))) return await failed('evidence_final_empty', 'could not record', true);
    if (!(await advance(['AUTH_DELETING'], 'AWAITING_ASSURANCE', { remaining_after_auth: 0 }, true))) return stopped();
    return accepted('awaiting_assurance');
  } catch (e) {
    try { return await failed('unexpected', e); } catch (_) { return accepted('needs_operator', { step: 'unexpected' }); }
  }
});
