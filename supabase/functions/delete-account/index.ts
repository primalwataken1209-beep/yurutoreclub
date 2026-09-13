// ═══════════════════════════════════════════════════════════════════════════
// ゆるトレ倶楽部 v50 — アカウント削除 Edge Function
//   supabase/functions/delete-account/index.ts
//
// 【なぜ Edge Function なのか】
//   Auth ユーザーの完全削除（hard delete）には service_role key が必要です。
//   service_role key をブラウザの JavaScript に置くと、
//   誰でも全ユーザーのデータを操作できてしまいます。
//   そのため削除処理はサーバー側（この Edge Function）でのみ行い、
//   フロントには従来どおり Publishable / Anon Key しか置きません。
//
// 【deploy 手順】
//   supabase functions deploy delete-account
//   supabase secrets set SERVICE_ROLE_KEY=xxxxxxxx   ← Dashboard から取得
//   （SUPABASE_URL は Supabase が自動で渡します）
//
// 【呼び出し方（アプリ側）】
//   supabaseClient.functions.invoke('delete-account')
//   → Authorization ヘッダの JWT から「本人」を特定します。
//     クライアントから user_id を受け取ることは絶対にしません。
//
// 【安全設計】
//   ・認証済みユーザーのみ実行可能
//   ・削除対象は必ず JWT から取り出した本人（他人は指定できない）
//   ・途中でエラーが起きたら、成功したふりをせず失敗として返す
//   ・存在しないテーブル（user_progress など）は「無い」として安全にスキップする
//     が、本当に削除に失敗した場合は成功にしない
// ═══════════════════════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

/** テーブルが存在しない／権限が無い等の「無いから消せない」系エラーかを判定する。
 *  これらは削除失敗ではなく「消すものが無い」として扱ってよい。 */
function isMissingRelation(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  const code = String(error.code || '');
  const msg = String(error.message || '');
  return (
    code === '42P01' ||                                  // undefined_table
    code === 'PGRST205' ||                               // PostgREST: table not found
    /relation .* does not exist/i.test(msg) ||
    /Could not find the table/i.test(msg) ||
    /schema cache/i.test(msg)
  );
}

Deno.serve(async (req: Request): Promise<Response> => {
  // ── CORS プリフライト ──
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }
  if (req.method !== 'POST') {
    return json({ ok: false, step: 'method', error: 'Method not allowed' }, 405);
  }

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
  // SERVICE_ROLE_KEY はサーバー側の secret としてのみ扱う。フロントには絶対に出さない。
  const SERVICE_ROLE_KEY =
    Deno.env.get('SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.error('[delete-account] 環境変数が設定されていません');
    return json({ ok: false, step: 'config', error: 'Server is not configured' }, 500);
  }

  // ── STEP 1: JWT から本人の user ID を取得する ───────────────────────────
  // クライアントが渡した user_id は一切信用しない（他人を削除させないため）。
  const authHeader = req.headers.get('Authorization') ?? '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) {
    return json({ ok: false, step: 'auth', error: 'Missing Authorization header' }, 401);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: userData, error: userErr } = await admin.auth.getUser(token);
  const user = userData?.user ?? null;
  if (userErr || !user) {
    console.error('[delete-account] JWTからユーザーを特定できませんでした', userErr);
    return json({ ok: false, step: 'auth', error: 'Not authenticated' }, 401);
  }

  const userId = user.id;                 // ← 削除対象は必ずこの人だけ
  const done: string[] = [];              // 実行できた手順
  const skipped: string[] = [];           // 対象テーブルが無くスキップした手順

  try {
    // ── STEP 2: Storage の avatars/{userId}/ 配下を削除 ────────────────────
    // 現在は {userId}/avatar.jpg のみだが、将来ファイルが増えても消せるよう
    // フォルダを list してから、見つかったファイルをまとめて削除する。
    try {
      const { data: files, error: listErr } = await admin.storage
        .from('avatars')
        .list(userId, { limit: 100 });

      if (listErr) {
        // バケット未作成などはスキップ扱い（削除全体は止めない）
        console.warn('[delete-account] avatars list をスキップ', listErr);
        skipped.push('storage:avatars');
      } else if (files && files.length > 0) {
        const paths = files.map((f: { name: string }) => `${userId}/${f.name}`);
        const { error: rmErr } = await admin.storage.from('avatars').remove(paths);
        if (rmErr) throw rmErr;
        done.push(`storage:avatars(${paths.length})`);
      } else {
        done.push('storage:avatars(0)');
      }
    } catch (e) {
      console.error('[delete-account] STEP2 storage 失敗', e);
      return json({ ok: false, step: 'storage', error: String(e) }, 500);
    }

    // ── STEP 3: user_progress を削除（存在する環境のみ） ───────────────────
    {
      const { error } = await admin.from('user_progress').delete().eq('user_id', userId);
      if (error) {
        if (isMissingRelation(error)) {
          skipped.push('user_progress');
        } else {
          console.error('[delete-account] STEP3 user_progress 失敗', error);
          return json({ ok: false, step: 'user_progress', error: error.message }, 500);
        }
      } else {
        done.push('user_progress');
      }
    }

    // ── STEP 4: app_events を削除 ─────────────────────────────────────────
    // v28 の app_events には auth.users への ON DELETE CASCADE が
    // 明示されていない環境があるため、Auth 削除より先に本人分を必ず消す。
    {
      const { error } = await admin.from('app_events').delete().eq('user_id', userId);
      if (error) {
        if (isMissingRelation(error)) {
          skipped.push('app_events');
        } else {
          console.error('[delete-account] STEP4 app_events 失敗', error);
          return json({ ok: false, step: 'app_events', error: error.message }, 500);
        }
      } else {
        done.push('app_events');
      }
    }

    // ── STEP 6（先に実行）: v50 で追加したデータ ───────────────────────────
    // blocks は profiles を参照しているので profiles 削除で連鎖するが、
    // 「自分が誰かをブロックした行」と「誰かが自分をブロックした行」の
    // 両方を確実に消すため、ここで明示的に削除する。
    {
      const { error } = await admin.from('blocks').delete().eq('blocker_id', userId);
      if (error && !isMissingRelation(error)) {
        console.error('[delete-account] blocks(blocker) 失敗', error);
        return json({ ok: false, step: 'blocks', error: error.message }, 500);
      }
      if (error && isMissingRelation(error)) skipped.push('blocks');
      else done.push('blocks:blocker');
    }
    {
      const { error } = await admin.from('blocks').delete().eq('blocked_id', userId);
      if (error && !isMissingRelation(error)) {
        console.error('[delete-account] blocks(blocked) 失敗', error);
        return json({ ok: false, step: 'blocks', error: error.message }, 500);
      }
      if (!error) done.push('blocks:blocked');
    }
    {
      // 本人が出した通報も削除する（reports は auth.users を CASCADE 参照しているが、
      // 環境差で外部キーが無い場合にも確実に消えるよう明示的に削除する）
      const { error } = await admin.from('reports').delete().eq('reporter_user_id', userId);
      if (error && !isMissingRelation(error)) {
        console.error('[delete-account] reports 失敗', error);
        return json({ ok: false, step: 'reports', error: error.message }, 500);
      }
      if (error && isMissingRelation(error)) skipped.push('reports');
      else done.push('reports');
    }

    // ── STEP 5: profiles を削除 ───────────────────────────────────────────
    // profiles から posts / comments / post_reactions / follows へ
    // ON DELETE CASCADE が張られているため、この1回でSNSデータがすべて消える。
    // （v43 マイグレーションの設計をそのまま活用している）
    {
      const { error } = await admin.from('profiles').delete().eq('id', userId);
      if (error) {
        if (isMissingRelation(error)) {
          skipped.push('profiles');
        } else {
          console.error('[delete-account] STEP5 profiles 失敗', error);
          return json({ ok: false, step: 'profiles', error: error.message }, 500);
        }
      } else {
        done.push('profiles(+posts/comments/reactions/follows cascade)');
      }
    }

    // ── STEP 7: Auth ユーザーを完全削除（hard delete） ────────────────────
    // 第2引数 shouldSoftDelete を省略＝false。soft delete では終わらせない。
    {
      const { error } = await admin.auth.admin.deleteUser(userId);
      if (error) {
        console.error('[delete-account] STEP7 auth 削除失敗', error);
        return json({ ok: false, step: 'auth_delete', error: error.message }, 500);
      }
      done.push('auth.users(hard delete)');
    }

    // ── STEP 8: 成功レスポンス ────────────────────────────────────────────
    console.log('[delete-account] 完了', { userId, done, skipped });
    return json({ ok: true, deleted: done, skipped }, 200);

  } catch (e) {
    // 想定外の例外。握りつぶさず、必ず失敗として返す。
    console.error('[delete-account] 想定外のエラー', e);
    return json({ ok: false, step: 'unexpected', error: String(e) }, 500);
  }
});
