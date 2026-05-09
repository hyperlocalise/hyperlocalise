# [HIGH] Release workflow executes mutable action refs with a write token

**File:** [`.github/workflows/release.yml`](https://github.com/hyperlocalise/hyperlocalise/blob/main/.github/workflows/release.yml#L10-L39) (lines 10, 23, 28, 33, 39)
**Project:** hyperlocalise
**Severity:** HIGH  •  **Confidence:** high  •  **Slug:** `other-github-actions-supply-chain`

## Owners

**Suggested assignee:** `cungminh2710@gmail.com` _(via last-committer)_

## Finding

The release workflow grants contents: write and runs actions/checkout@v6, actions/setup-go@v6, and goreleaser/goreleaser-action@v7 as mutable tags. GoReleaser also receives GITHUB_TOKEN. If any referenced action tag is compromised or moved, attacker-controlled code can run in the release job with repository write capability, allowing release artifact tampering, malicious release publication, or tag manipulation.

## Recommendation

Pin all actions in the release workflow to full commit SHAs, pin the GoReleaser tool version exactly, and update those pins through reviewed dependency updates. Keep contents: write scoped only to the release job that needs it.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-04-08)
- blacksmith-sh[bot] <157653362+blacksmith-sh[bot]@users.noreply.github.com> (2026-04-05)
- Muen Yu <22992947+MuenYu@users.noreply.github.com> (2026-03-01)
