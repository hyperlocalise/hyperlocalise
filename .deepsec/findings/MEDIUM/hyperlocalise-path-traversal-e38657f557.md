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

## Revalidation

**Verdict:** true-positive

The core finding is still real: normalizeWorkspacePath only performs lexical checks on the submitted path, rejecting empty paths, absolute paths, literal '..' segments, and dash-prefixed segments, but it does not canonicalize the path or account for symlinks. The exact implementation detail in the report is stale because createReadTool no longer calls ctx.bash.readFile, and VercelSandboxRuntime.readFile was hardened in commit 0ecc23df to reject direct symlink reads. However, the active read tool now calls ctx.bash.exec('wc', ['-c', shellPath]), ctx.bash.exec('wc', ['-l', shellPath]), and ctx.bash.exec('sed', ['-n', range, shellPath]); those commands are run through VercelSandboxRuntime.runCommand without a canonical workspace containment check. Standard wc and sed follow symlinks when opening a path, so a repository-relative symlink such as leak -> /etc/passwd has no '..' or leading '/' in the submitted path and will pass normalizeWorkspacePath before the command opens the resolved target. The repository sandbox is created from a GitHub repository revision using branch or commitSha, and GitHub PR context resolution uses the PR head ref/SHA, so a user who can cause the agent to inspect a same-repository branch can include a Git symlink in the checked-out workspace. The repository workflow and Slack/GitHub agent flows expose the read tool when a sandboxId is present; GitHub repository workflows are gated to write collaborators, but that still leaves an exploitable malicious/compromised collaborator or trusted Slack actor scenario. The May 30 fixes added dash-segment rejection and direct readFile symlink checks, but they did not move containment enforcement into the shared command-backed file access layer used by read.ts. Because the path helper still claims to reject paths that escape the repo root while symlink resolution can escape after validation, this is a true positive with the originally assigned medium severity.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-05-30)
