# [MEDIUM] Repository i18n target paths are resolved without constraining them to safe relative paths

**File:** [`apps/hyperlocalise-web/src/lib/i18n/i18n-pathresolver.ts`](https://github.com/hyperlocalise/hyperlocalise/blob/main/apps/hyperlocalise-web/src/lib/i18n/i18n-pathresolver.ts#L9-L18) (lines 9, 10, 11, 12, 14, 18)
**Project:** hyperlocalise
**Severity:** MEDIUM  •  **Confidence:** medium  •  **Slug:** `path-traversal`

## Owners

**Suggested assignee:** `cungminh2710@gmail.com` _(via last-committer)_

## Finding

The resolver substitutes repository-controlled path templates and locale values, collapses repeated slashes, and returns the result without rejecting absolute paths, `..` segments, `.git` paths, or other non-localization destinations. This result is used by GitHub pull-translation export: `mapping.toPattern` from the repository i18n config becomes `targetPath`, which is later forwarded to `writeFilesToSandbox` and then used in Git commands. A repository contributor who can influence the i18n config could make automation write translated output outside the intended locale tree, including sensitive sandbox or Git-control paths, before subsequent Git operations run with the GitHub App installation context.

## Recommendation

Normalize resolved paths with a POSIX path parser and require them to be relative repository paths. Reject absolute paths, `..` traversal, empty paths, control characters, `.git` or other VCS/internal directories, and paths outside the configured localization output scope before writing to the sandbox or passing them to Git.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-05-31)
