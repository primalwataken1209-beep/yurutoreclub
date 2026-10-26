# v51.4.7 preparation branch — DO NOT MERGE OR DEPLOY
Base: PR1 aaa5e94633c47241d509993386cec89e7874e276.
Only the app.js/index.html avatar changes from f1e6f36 were ported. Staging connection settings, Google disablement, redirects and CSP were excluded.
Production connection settings are inherited from PR1. This branch MUST NOT be served or opened against production.
netlify.toml intentionally stops every deploy context; removing the guard requires separate approval.

## Verified
- App avatar regression tests: 10 pass.
- Babel 7.24.7 env/react compilation: app/inline match; no notices after shortening a duplicate explanatory comment.
- Previous full GitHub checks: 36 ordinary + 14 browser checks passed on de7e476.
- Private avatar SQL + emergency access-stop SQL: 9 subtests plus parent pass in isolated PGlite PostgreSQL.
- Storage actual-file backup completed locally: 3 JPEG files / 226399 bytes. Sizes and simple ETags match, source/copy SHA-256 match. No images or private manifests are included in GitHub. OneDrive remote synchronization / off-machine recovery is not verified.
- Main was unchanged when preparation was checked. No production mutations, merges or file deletion.

## Prepared SQL (NOT APPLIED)
supabase/manual/v51_4_7_avatars_prepare.sql
  Creates a new private JPEG/3MiB bucket, exact owner-path writes, owner/public-profile reads, and restrictive guards including anonymous read denial.
  Refuses an existing avatars bucket or disabled RLS instead of overwriting it.
  Does not change post-images, profiles, existing policies or grants.
supabase/manual/v51_4_7_avatars_verify_readonly.sql
  Lists bucket settings, RLS policies, grants and object counts.
supabase/manual/v51_4_7_avatars_emergency_stop.sql
  Denies avatar operations for anon/authenticated while retaining the private bucket, files and profile references.
  Does not restore an earlier state or undo legitimate user deletions.

SQL testing covers owner upsert/delete/re-register, private/public visibility, cross-owner rename rejection, broad-policy resistance, anonymous denial, public-to-private changes, repeat-run refusal, emergency stop, and preservation of post-images.
These are database-policy tests against platform shims, not a real Supabase HTTP/JPEG-limit/Storage file-restore test.

## Remaining release gates
1. All checks must pass on the latest SHA.
2. A separate production approval must bind the final app SHA, exact SQL hashes, Edge Function source/config, deployment files and rollback identity.
3. Production CSP/build output/auth redirects/OAuth are not yet prepared and verified as a complete releasable artifact. No preview serves this preparation branch.
4. Production user_progress/app_events are absent. Either explicitly defer these optional features or prepare their independent minimum changes; never apply staging bootstrap wholesale.
5. Production delete-account v2 still skips all Storage list errors; PR1's stricter version needs separate deployment approval.
6. Capture actual live Netlify production deploy ID/files and confirm recovery procedure. Git main SHA alone does not prove the live deployment.
7. Record acceptance of external HTTPS avatar fallback and positive-cache lifetime (5 minutes)/negative cache (10 minutes).
8. Live Storage HTTP checks and restore rehearsal belong in an approved isolated environment; production writes stay prohibited.

Owner authorized this branch's preparation only. Do not merge, deploy, run SQL on hosted projects, remove the deploy blocker, alter production configuration or delete data.
