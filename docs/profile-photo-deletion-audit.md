# Profile, photo and account deletion audit

Source reviewed: e5194cedfaa90e509d533b5318a7e1a34a9d5bcd (PR #18).
Scope: static source review only. No production data, images or accounts accessed or deleted. No staging deletion executed.

## Verified collection paths

| Data | Exact source | Finding |
| --- | --- | --- |
| Nickname, short bio, introduction | app.js snsEnsureProfile, lines 2946–2966 | Written to profiles as nickname/hitokoto/intro. Name/user-generated-content declarations need review. |
| Region | same function, region assignment | Optional prefecture field sent to profiles. This is not evidence of GPS access; assess approximate-location declaration for user-entered location. |
| Favorite activities, pace, visibility | same function with full=true | fav_acts, pace, is_public sent with profile save. |
| Avatar | uploadAvatarToSupabase, around line 2722 | JPEG sent to avatars/{authenticated-user}/avatar.jpg. This is collected image data. |
| Community image | snsUploadPostImage, around line 2865 | JPEG sent to post-images/{user}/{random-id}.jpg. Not local-only. |
| Exercise record photos | ytStripLocalPhotos | Strips photo contents from reports/timeCapsules before state sync; does not establish a blanket “all images stay local” claim. |
| Reports | snsCreateReport, around line 3349 | reporter ID, target type/ID, reason and optional note sent to reports. Safety/fraud-prevention purpose must be considered. |

## Account deletion implementation

The Edge Function validates the bearer token with auth.getUser and derives the target user ID from that result. The client passes an empty body.
It removes avatar files, batches of post images, user_progress, app_events, both directions of blocks, and reports submitted by the deleting user. It deletes profiles, relying on database CASCADE for social rows, then hard-deletes the Auth user.
Storage list/remove errors ordinarily stop the flow; confirmed missing buckets may be skipped.
The client clears the deleting user's local keys only after the function returns ok=true, then resets the UI. Native file/secure-store cleanup still needs device verification.

## Limits that must remain explicit

1. These source files do not prove the currently deployed Edge Function or live foreign keys match the candidate.
2. Reports submitted by OTHER users about the deleting account/content are not removed by the reporter_user_id filter. The v50 migration deliberately has no target foreign key, preserving moderation history. Define retained fields, purpose and retention period before asserting complete erasure; do not silently delete moderation evidence.
3. Server console logs include the deleting user ID and completed steps. Hosting log/back-up retention is separate from app-row deletion.
4. Deletion is sequential, not atomic. A failure can leave a partly deleted account; retry and UI behavior must be verified.
5. The post-image loop has a 1000-round cap without a final empty-bucket assertion, and excludes folder rows. Current uploads are flat; large-volume/nested legacy paths require a separate fail-closed review. Avatar enumeration is limited to 100; current avatar path is a single fixed filename.
6. Missing-relation detection includes a broad schema-cache message match. Add an offline regression case distinguishing missing tables from other schema-cache failures before changing this logic.
7. Successful offline tests do not establish live RLS, cascades, auth-token invalidation or complete device cleanup.

## Next staging verification (disposable fixtures only)

Prepare disposable accounts A and B in staging. Never reuse real private images.
- Seed A with a profile, avatar, one post image, comment/reaction/follow, progress and usage events.
- Add A's report and B's report about A; record expected retention separately.
- Before deletion, record only fixture IDs and counts; do not store tokens or image bytes in the repository.
- Invoke account deletion as A. Verify A's Auth/profile/progress/events and own storage objects are absent; verify expected social cascades.
- Verify B and B's unrelated images/content remain untouched; verify B's moderation report behavior against the retention decision.
- Verify A's old session cannot continue meaningful access; test logout/reinstall behavior on Android and iPhone.
- Offline fault injection: storage list/remove failure, database deletion failure, missing relation vs unrelated schema-cache error, exhausted image loop, retry after partial success.
- Save results with candidate SHA, deployed-function version, fixture scope and actual observed counts. Until then mark live deletion verification PENDING.

## Launch actions
- Complete Google Play inventory for name/region/content/photos/safety reports, with purposes and optionality backed by actual UX.
- Review Apple Name/Coarse Location/Other User Content and purpose coverage; PR #18's event-only fix is not a complete privacy certification.
- Align public privacy/deletion policy wording with confirmed retention and deletion behavior. Production page deployment requires separate approval.
- No Claude handoff is necessary for the declaration-only patch. For a deletion-code fix, use a separate isolated PR and the fault cases above; do not modify production storage or deploy the function as part of that PR.
