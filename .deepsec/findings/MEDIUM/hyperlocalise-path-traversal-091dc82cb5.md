# [MEDIUM] run trusts config paths outside the project root

**File:** [`apps/cli/cmd/run.go`](https://github.com/hyperlocalise/hyperlocalise/blob/main/apps/cli/cmd/run.go#L195-L218) (lines 195, 218)
**Project:** hyperlocalise
**Severity:** MEDIUM  •  **Confidence:** medium  •  **Slug:** `path-traversal`

## Owners

**Suggested assignee:** `cungminh2710@gmail.com` _(via last-committer)_

## Finding

The run command passes the selected config directly into runsvc.Run. Bucket `from` and `to` paths are later resolved and used for file reads and writes without a project-root confinement check. A malicious repo or PR can set absolute or `../` paths so `hyperlocalise run` reads local translation-shaped files outside the checkout, sends source text to the chosen provider, and writes translated output outside the project with the current user's privileges.

## Recommendation

Canonicalize source and target paths relative to a trusted project/config directory, reject absolute paths and parent/symlink escapes by default, and add an explicit allowlist or opt-in flag for intentional external paths.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-04-26)
