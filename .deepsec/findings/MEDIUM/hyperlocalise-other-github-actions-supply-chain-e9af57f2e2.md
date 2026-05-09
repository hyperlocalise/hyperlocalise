# [MEDIUM] Composite action depends on a mutable setup-go tag

**File:** [`.github/actions/go-bootstrap/action.yml`](https://github.com/hyperlocalise/hyperlocalise/blob/main/.github/actions/go-bootstrap/action.yml#L11) (lines 11)
**Project:** hyperlocalise
**Severity:** MEDIUM  •  **Confidence:** medium  •  **Slug:** `other-github-actions-supply-chain`

## Owners

**Suggested assignee:** `22992947+MuenYu@users.noreply.github.com` _(via last-committer)_

## Finding

The composite action invokes actions/setup-go@v6 instead of pinning the action to an immutable commit SHA. GitHub action tags are mutable, so a compromised action publisher or moved tag could execute attacker-controlled code in any workflow that uses this bootstrap action. In the current repo this is used from CI with read-only repository permissions, so the immediate impact is CI tampering or read-token/source exposure rather than direct release compromise.

## Recommendation

Pin actions/setup-go to a full commit SHA and update it through a controlled dependency update process such as Dependabot or Renovate.

## Recent committers (`git log`)

- Muen Yu <22992947+MuenYu@users.noreply.github.com> (2026-02-23)
