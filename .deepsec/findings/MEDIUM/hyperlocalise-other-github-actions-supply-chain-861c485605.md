# [MEDIUM] Web CI uses mutable action refs

**File:** [`.github/workflows/web.yml`](https://github.com/hyperlocalise/hyperlocalise/blob/main/.github/workflows/web.yml#L49-L52) (lines 49, 52)
**Project:** hyperlocalise
**Severity:** MEDIUM  •  **Confidence:** medium  •  **Slug:** `other-github-actions-supply-chain`

## Owners

**Suggested assignee:** `cungminh2710@gmail.com` _(via last-committer)_

## Finding

The workflow uses actions/checkout@v6 and voidzero-dev/setup-vp@v1 rather than immutable commit SHAs. A compromised or retagged action could execute arbitrary code in Web CI, tamper with build/test results, or exfiltrate the read-only repository token and checked-out source. No repository secrets are exposed in this workflow, so the impact is lower than the release workflow.

## Recommendation

Pin both actions to full commit SHAs and manage updates through reviewed dependency automation.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-04-18)
