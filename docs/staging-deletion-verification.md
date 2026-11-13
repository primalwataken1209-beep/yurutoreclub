# Staging deletion verification

## Verified
- Project name confirmed: yurutore-club-staging. No production queries or mutations.
- Deployed delete-account is ACTIVE, version 2, verify_jwt=true.
- Retrieved deployed function source equals the candidate at 74e1bfa3b9737e80f903cdf0b530f039c66c7106 after trimming boundary whitespace.
- Read-only pg_constraint inspection confirms ON DELETE CASCADE for profiles -> auth.users; user_progress -> auth.users; app_events -> auth.users; posts/comments/reactions/follows -> profiles (and relevant post references); both block references -> profiles; reports.reporter_user_id -> auth.users.
- No target-ID foreign key appears for reports; retention caveat from profile-photo-deletion-audit.md remains applicable.

## Offline execution using deployed source
Ran the repository's tests/account-delete.test.cjs against source retrieved from staging. Only the test harness transpilation was adapted from TypeScript transpileModule to Node 24 stripTypeScriptTypes; remote import was removed and createClient was mocked as in the repository test. No network calls, live credentials, or real data deletion.

11/11 passed:
- avatars list network/permission/server errors stop DB/Auth deletion (3)
- post-images list network/permission/server errors stop DB/Auth deletion (3)
- confirmed missing avatars/post-images bucket can be skipped (2)
- image removal error stops DB/Auth deletion (1)
- multiple image batches removed before authenticated user deletion (1)
- absent/invalid authentication never deletes data (1)

## Not verified
No actual account was created or deleted; no storage object was uploaded or removed. These tests do not validate deployed credentials, live RLS execution, end-to-end Auth, token revocation, or device cleanup. DB foreign-key presence is configuration evidence, not an executed deletion result.

Current connected Supabase tools expose project/function reads and SQL, but not Auth user creation/sign-in or an authenticated Edge Function invocation. Do not manufacture an Auth session via SQL or request production service-role credentials to bypass this limitation. Next live test needs a disposable staging account through the normal authentication flow and its authenticated app session.

Use the two-account fixture procedure in profile-photo-deletion-audit.md. Keep live deletion PENDING until observed; keep iPhone testing PENDING. Production and store release remain unchanged.
