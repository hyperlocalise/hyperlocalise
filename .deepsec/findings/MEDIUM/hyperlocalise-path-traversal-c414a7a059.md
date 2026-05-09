# [MEDIUM] check --fix can apply unconfined paths from project config

**File:** [`apps/cli/cmd/check.go`](https://github.com/hyperlocalise/hyperlocalise/blob/main/apps/cli/cmd/check.go#L637-L655) (lines 637, 655)
**Project:** hyperlocalise
**Severity:** MEDIUM  •  **Confidence:** medium  •  **Slug:** `path-traversal`

## Owners

**Suggested assignee:** `29139614+renovate[bot]@users.noreply.github.com` _(via last-committer)_

## Finding

The fix path builds a runsvc.Input from the selected config and invokes runCheckFixSvc. The underlying config validation only checks that bucket paths are non-empty and extension-compatible; it does not reject absolute paths, parent-directory traversal, or symlink escapes. A malicious repository config can therefore cause `hyperlocalise check --fix` to read source files outside the checkout, send their text to the configured translation provider, and write generated target files outside the project under the operator or CI user's privileges.

## Recommendation

Resolve all source and target paths against a trusted project/config root, reject absolute paths and any cleaned/evaluated path that escapes that root by default, and require an explicit opt-in for external paths.

## Recent committers (`git log`)

- renovate[bot] <29139614+renovate[bot]@users.noreply.github.com> (2026-05-08)
- Minh Cung <cungminh2710@gmail.com> (2026-04-26)
