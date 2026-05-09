# [MEDIUM] Remote locale names can escape the configured translation path during pull apply

**File:** [`apps/cli/cmd/sync_pull.go`](https://github.com/hyperlocalise/hyperlocalise/blob/main/apps/cli/cmd/sync_pull.go#L24-L36) (lines 24, 35, 36)
**Project:** hyperlocalise
**Severity:** MEDIUM  •  **Confidence:** medium  •  **Slug:** `path-traversal`

## Owners

**Suggested assignee:** `cungminh2710@gmail.com` _(via last-committer)_

## Finding

`sync pull` passes the remote adapter and local JSON store into `rt.svc.Pull` and allows writes when `--dry-run=false`. The service later applies remote creates/updates through `localstore.ApplyPull`, which groups entries by `entry.Locale` from the remote snapshot and resolves that locale directly into the configured target path via `ResolveTargetPath`. That resolver performs raw string substitution for `{{target}}`, `{{localeDir}}`, and `[locale]` without rejecting absolute paths, `..`, or path separators, and `writeJSONAtomic` then creates directories and renames the JSON file. A malicious or compromised TMS/custom Crowdin endpoint that can return a locale like `../../package` could make an authorized `sync pull --dry-run=false` write outside the intended locale directory, corrupting arbitrary JSON-shaped files in the workspace.

## Recommendation

Before applying a pull, only accept remote entries whose locale is in the configured or explicitly requested locale allowlist, validate locale identifiers against a strict safe pattern, and resolve/clean the final path while verifying it remains under the configured translation root. Reject or warn on remote entries with unexpected locales instead of writing them.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-04-08)
