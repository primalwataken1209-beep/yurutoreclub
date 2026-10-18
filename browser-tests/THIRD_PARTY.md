# Third-party seccomp profile

`seccomp_profile.json` derives from Microsoft Playwright v1.64.0:

https://github.com/microsoft/playwright/blob/v1.64.0/utils/docker/seccomp_profile.json

Original Git blob: `fddc05fb520affb145404e6f6f647ca96af8087d`.
The upstream Apache 2.0 license is included as `PLAYWRIGHT-LICENSE`.

Modification: allow `chroot` in addition to the upstream user-namespace calls so Chromium's namespace-local filesystem sandbox works with `cap-drop ALL`. The kernel's capability checks remain in force; no host capability is granted.
