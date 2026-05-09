# [MEDIUM] Mutable CI action refs can run before secret-backed build steps

**File:** [`.github/workflows/ci.yml`](https://github.com/hyperlocalise/hyperlocalise/blob/main/.github/workflows/ci.yml#L29-L109) (lines 29, 71, 74, 80, 109)
**Project:** hyperlocalise
**Severity:** MEDIUM  •  **Confidence:** high  •  **Slug:** `other-github-actions-supply-chain`

## Owners

**Suggested assignee:** `cungminh2710@gmail.com` _(via last-committer)_

## Finding

The workflow uses moving action tags for actions/checkout@v6 and bazelbuild/setup-bazelisk@v3. In the Bazel job, those actions run before the workflow reads BUILDBUDDY_API_KEY from secrets and writes it into a Bazel rc file. If one of the referenced action tags is compromised or retagged, attacker-controlled code could persist on the runner and capture that secret during later steps, or tamper with CI results. Fork pull_request runs do not receive repository secrets, which limits exposure there, but push and same-repository runs still execute with the secret available.

## Recommendation

Pin third-party and first-party actions to full commit SHAs. Keep CI job permissions minimal, and avoid placing secrets in jobs that also execute mutable or untrusted workflow dependencies unless the dependency is pinned and reviewed.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-04-10)
- blacksmith-sh[bot] <157653362+blacksmith-sh[bot]@users.noreply.github.com> (2026-04-05)
