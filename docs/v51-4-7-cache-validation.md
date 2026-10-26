# Avatar HTTP cache correction — preflight only

The staging Storage HTTP test reproduced stale downloads after changing a profile from public to private and after replacing an avatar. A unique query bypassed those stale responses. Application blob-cache expiry alone did not ensure a fresh Storage authorization check.

This preparation change pins supabase-js to 2.118.0, which supports download cacheNonce, supplies a fresh nonce for each network download, uses fetch cache:no-store, and requests upload cacheControl:0. Existing viewer-scoped blob-cache behavior is retained: successful entries may remain for five minutes, negative entries for ten minutes. Already downloaded images cannot be recalled. This is not immediate revocation of every previously served URL.

The offline browser fixture maps the exact pinned CDN URL to its offline SDK stub. Existing cache headers are retained while adding the reviewed compatible CSP, nosniff, referrer policy and frame protection. CSP still allows inline scripts for the existing Babel architecture. External non-Google HTTPS avatars may be blocked and require fallback acceptance.

Validation before commit: 12 avatar tests pass; 6 local headless Edge browser tests pass. Staging SDK/API checks with the exact download options pass for sign-in, owner access, public/private visibility, anonymous/public URL denial, cross-owner writes, MIME/size rejection, replacement and byte-identical restore. The API test deliberately uploaded with the old default cache lifetime to exercise the read fix against cached data. Two synthetic users and their objects were removed afterward; original user/object counts and object metadata digest match. No production data was used.

The browser tests use an offline SDK stub; API tests do not replace full application UI/OAuth/email acceptance tests. GitHub CI for the new commit is a separate gate. No SQL, policy, production function, production deployment or main change is authorized by these results. Keep the deployment blocker enabled.

Remaining release items: full candidate UI with staging authentication/Storage, Google/email flow verification as applicable, review of delete-account deployment source/config, optional-table scope, final artifact inventory and explicit production approval. Production rollback deploy is recorded privately in the local release evidence. Do not merge the staging branch wholesale.
