# [HIGH] Workspace read follows symlinks outside the repository

**File:** [`apps/hyperlocalise-web/src/lib/agent-runtime/tools/workspace/read.ts`](https://github.com/hyperlocalise/hyperlocalise/blob/main/apps/hyperlocalise-web/src/lib/agent-runtime/tools/workspace/read.ts#L45-L66) (lines 45, 51, 56, 57, 66)
**Project:** hyperlocalise
**Severity:** HIGH  •  **Confidence:** high  •  **Slug:** `path-traversal`

## Owners

**Suggested assignee:** `cungminh2710@gmail.com` _(via last-committer)_

## Finding

The read tool uses `normalizeWorkspacePath` only as a lexical check and then delegates to `ctx.bash.readFile`, which ultimately reads the path like `cat`. A repository can contain a symlink such as `leak -> /proc/self/environ` or `leak -> /etc/passwd`; reading `leak` passes the workspace-relative check but follows the symlink and returns content outside the repository boundary after only best-effort redaction.

## Recommendation

Resolve real paths in the sandbox and require the resolved target to remain under the repository root. Reject symlinks for agent-readable files, or read symlink metadata as text rather than following the target. Treat redaction as defense in depth, not as the access-control boundary.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-05-27)
