# v51.4.7 preparation branch — DO NOT MERGE OR DEPLOY
Based on PR1 aaa5e94633c47241d509993386cec89e7874e276. Only the app.js/index.html changes from f1e6f36 were ported.
Staging URL/key, Google disablement, redirect restrictions and staging CSP were not imported.
This branch contains production connection settings inherited from PR1 but MUST NEVER be served or opened against production.
netlify.toml deliberately runs a failing build guard for all deploy contexts. This is a preparation artifact, not a release-ready branch.

## Validated locally
- 10 new offline avatar regression tests pass (reference parsing, anonymous refusal, cache reuse/reset, in-flight viewer switch, failed download caching, upload reference, removal failure/cache clearing, configuration isolation, Babel size threshold).
- Babel standalone 7.24.7 env/react compilation passes for app and inline code; compiled results are identical; no compiler notices.
- A duplicate explanatory comment was shortened, without changing executable behavior, to keep Babel input below its 500000-character automatic-compaction threshold.
- Existing offline workflow gains only this branch's push trigger; container isolation, trusted harness and lack of production secrets are preserved.
- Full GitHub offline/browser checks still must pass on the final branch SHA.

## Not completed
- Storage actual file backup: metadata lists 3 files / 226399 bytes; no actual files have been downloaded or hashed.
- Final private avatars database SQL is not in PR5. Staging restrictive policies must be captured in reviewed migration sources and reproduced in an isolated database.
- Production user_progress/app_events are absent. Decide whether they belong in this release; do not apply staging bootstrap wholesale.
- Production delete-account v2 skips all Storage list errors; PR1 contains a stricter version. Deployment is a separate approval.
- Production CSP, authentication redirect/OAuth verification, deployment identity capture and rollback rehearsal remain pending.
- External HTTPS avatar compatibility and 5-minute positive/10-minute negative cache behavior must be included in release acceptance.

## Authorization boundary
Owner approved creating this isolated branch and preparing changes/tests/plans. No main/PR1/PR5 changes, no merge, no production SQL/Storage/Edge Function/Netlify changes, no file deletion.
Do not remove the deploy blocker or publish this branch under this authorization.
