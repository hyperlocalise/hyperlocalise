# [MEDIUM] Lexical workspace path check can be bypassed with repository symlinks

**File:** [`apps/hyperlocalise-web/src/lib/agent-runtime/tools/workspace/path.ts`](https://github.com/hyperlocalise/hyperlocalise/blob/main/apps/hyperlocalise-web/src/lib/agent-runtime/tools/workspace/path.ts#L5-L6) (lines 5, 6)
**Project:** hyperlocalise
**Severity:** MEDIUM  •  **Confidence:** medium  •  **Slug:** `path-traversal`

## Owners

**Suggested assignee:** `cungminh2710@gmail.com` _(via last-committer)_

## Finding

normalizeWorkspacePath only rewrites backslashes, strips one leading './', and rejects absolute paths or literal '..' segments. The read tool passes the accepted value to ctx.bash.readFile, and the Vercel sandbox implementation reads it with cat. If an attacker can influence repository contents used by the repository agent, such as via a PR branch, they can add a workspace-relative symlink pointing outside the checkout and ask the agent to read that symlink. The path itself contains no '..' or leading '/', so it passes this check while cat follows the symlink and returns data outside the intended repo root. This can disclose sandbox metadata or credentials if present, and it violates the function's stated repo-root boundary.

## Recommendation

Enforce containment in the sandbox file access layer using canonical paths: resolve the requested path relative to a known checkout root, lstat/reject symlinks or open with no-follow semantics, and compare the resolved real path against the canonical repo root before reading. Also consider rejecting .git and other repository-control metadata paths from agent-readable files.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-05-27)
