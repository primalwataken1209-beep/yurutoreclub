# iOS staging signing check (not activated)

This adds a manual-only signing validation job. It builds the existing staging
Capacitor app, archives and exports an App Store-format IPA, checks it, then
discards the IPA. It does not upload to TestFlight/App Store, retain an IPA artifact,
modify production, enable Apple login, or change the committed Xcode app settings.
App code, Android settings and existing workflows are unchanged.

## Required before execution

1. Review this change and merge it into the store-preparation branch only.
2. GitHub requires the workflow to exist on the default branch for manual dispatch.
   Obtain separate owner approval for the precise main change; do not merge the
   entire mobile candidate into main to activate this workflow. Main needs only
   the reviewed workflow file; the selected candidate commit supplies the code.
3. Confirm `ios-signing` has required owner review, administrator bypass disabled,
   and exactly the `claude/store-release-prep` branch allowed (no tags).
4. Environment secrets must be present: `IOS_DISTRIBUTION_P12_BASE64`,
   `IOS_DISTRIBUTION_P12_PASSWORD`, `IOS_APPSTORE_PROFILE_BASE64`.
5. Obtain approval to run this signing check on GitHub-hosted macOS. Confirm the
   complete candidate commit and real staging publishable key. Check that the
   chosen iOS build number is unused in App Store Connect. The workflow uses the
   existing marketing version; it does not increment the repository version.
6. Dispatch on `claude/store-release-prep`, enter the same full SHA as that branch's
   head, the staging key and build number; the owner reviews the environment job.
   A mismatched SHA/ref skips the job. An invalid input fails before repository code.

## Credential handling and checks

Secrets are passed only to the signing step after dependency resolution and tests.
The script removes those variables from child-process environments, uses a fresh
temporary keychain, checks a valid signing identity against the profile certificate,
checks the App Store profile metadata and exact app ID, and changes only the App
target Release settings inside the disposable checkout. Automatic provisioning is
not enabled. This follows GitHub's temporary-keychain approach:
https://docs.github.com/en/actions/how-tos/deploy/deploy-to-third-party-platforms/sign-xcode-applications

Export verification checks codesign integrity, certificate membership, embedded
profile, team/app entitlements, build number, STG name, staging assets/key and the
privacy manifest. Only a pass summary, source SHA, build number and IPA digest are
recorded. Tool output containing signing/account data is suppressed; failures report
the tool name, not its command arguments or private output. Profile CMS decoding is
not an independent revocation audit; actual signing/export checks run on macOS.

Cleanup removes the temporary keychain/profile and private output even on ordinary
failure. Hosted-runner teardown covers forced termination. Do not adapt this to a
self-hosted runner without a separate cleanup/security review. All code executed
on the signing runner must be reviewed: an environment gate does not make arbitrary
repository/dependency code safe.

## Validation and next gate

Local tests use synthetic data and never read signing secrets:
`python3 -m unittest discover -s mobile/tests -p test_ios_signing.py`

Windows validation does not establish that Xcode signing succeeds. The first real
macOS run remains required. The passing IPA is intentionally discarded because it
contains an embedded provisioning profile. A separately reviewed and approved
TestFlight upload flow will need to rebuild it; no upload credentials are required
by this change. Do not count this as physical-device testing or store readiness.
