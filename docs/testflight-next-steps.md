# TestFlight upload preparation - awaiting owner approval

## Verified baseline

2026-11-13: staging archive/export/signature/profile/app identity/assets/privacy
verification passed on hosted macOS, commit
`510bef0fa5b17388c62e7b8dfbc2a37fe433eaeb`.
Evidence: https://github.com/primalwataken1209-beep/yurutoreclub/actions/runs/43432347296
The IPA was discarded. This is not an App Store Connect upload or device test.

This draft adds an explicit upload entry point and a manual-only workflow.
The workflow requires registration on main through a separate workflow-only PR;
that merge and the first Apple upload are awaiting explicit owner approval. The existing signing-only workflow still uploads
nothing. Local synthetic tests cover approval gates, digest mismatch, validation
failure, credential isolation and temporary key cleanup. Apple upload is untested.

## Credential preparation status

2026-11-13: owner-authorized Developer team key created. All three ASC secret
names were verified in the protected ios-signing environment, alongside the three
signing secrets. Key validity will be checked during Apple validation. Do not
create another key or repeat authorization. No Apple upload has occurred.

## Ordered remaining work

1. Sign in to App Store Connect. Confirm the existing record's bundle ID is
   `club.yurutore.app`, latest version/build, agreement state and TestFlight groups.
   Review all automatic distribution settings before uploading. Record observations;
   do not tick the workflow confirmation based on assumption.
2. Review API access and existing suitable credentials. Proposed team key role:
   Developer. Team keys cover ALL account apps; do not describe one as app-scoped.
   Key creation/access request/terms require owner confirmation at the actual step.
   The draft supports TEAM keys (issuer required), not individual account keys.
3. After explicit approval, save the authorized key ID, issuer and P8 as environment
   secrets ASC_KEY_ID, ASC_ISSUER_ID and ASC_PRIVATE_KEY_P8 in ios-signing.
   Keep P8 out of chat, source control, synced folders and artifacts. Do not revoke
   unrelated keys or re-create the already working distribution certificate/profile.
4. Review and activate docs/ios-testflight-upload.yml.example as a separately approved
   manual workflow on default branch AND candidate branch. Do not merge the whole
   application candidate into main. Use [skip netlify] on approved merge commits.
   Review the resulting exact candidate SHA and rerun local/CI tests.
5. Confirm an unused build number and the actual staging publishable key. Obtain
   approval specifically to send this staging build to Apple. Run with the exact
   SHA, UPLOAD_STAGING_ONLY and verified distribution setting. Owner environment
   gate remains enabled. No automatic retries: after ambiguous timeout/error check
   Apple's build list before submitting again.
6. Observe Apple processing separately. CLI exit success does not prove processing,
   export-compliance clearance, installation availability, or review approval.
   Answer encryption questions from implementation evidence, not a default guess.
7. Prepare beta description, feedback address, What to Test and review access.
   Keep reviewer credentials out of public PRs. No account creation/deletion for
   test setup until exact scope is approved.
8. Collaborator route: external TestFlight tester, no developer-account role merely
   to bypass review. Apple's current flow requires an internal group before an
   external group; first external build requires beta review. Review group setup,
   recipient and invitation text before inviting. Public links remain disabled.
9. Test the INSTALLED build on iPhone 15. Record actual iOS version, version/build,
   commit, date, tester and each result. Web testing does not replace native testing.

## iPhone acceptance checklist

Use a dedicated staging account and non-sensitive sample data.

| Test | Pass evidence |
|---|---|
| Install and cold launch | STG label; no crash/blank screen |
| Trial exercise record | Save one record, force close, reopen; state retained |
| Sign-in callback | Return from browser to app; cancellation recoverable |
| Profile | Read existing profile before editing; saved name survives restart |
| Photo permission | Deny/select/cancel/reselect a harmless image; recoverable UI |
| Links | Terms/privacy/guidelines/support open and return correctly |
| Layout | Portrait/landscape and keyboard do not hide primary controls |
| Logout | Force close/reopen remains logged out; login works again |
| English | Main flow and legal links usable after language change |
| Network loss | Recoverable message; no silent data loss or duplicate submission |

Apple login, iPad and Mac results must remain untested unless actually exercised.
Do not test destructive account/image operations as part of this checklist.
Any existing release blockers remain separate from this build/upload preparation.

## Android track

Preserve the already tested internal build while preparing the next approved
closed-test submission: confirm declarations, review access, final listing and
tester-group/track eligibility in Play Console. Internal testing alone must not
be recorded as satisfying any closed-testing production-access requirement.
Do not publish, recruit or post to social media as part of this draft.

## Official references checked 2026-11-13

- https://developer.apple.com/help/app-store-connect/manage-builds/upload-builds
- https://help.apple.com/asc/appsaltool/en.lproj/static.html
- https://developer.apple.com/help/app-store-connect/get-started/app-store-connect-api
- https://developer.apple.com/help/app-store-connect/test-a-beta-version/invite-external-testers
- https://developer.apple.com/help/app-store-connect/test-a-beta-version/add-internal-testers

