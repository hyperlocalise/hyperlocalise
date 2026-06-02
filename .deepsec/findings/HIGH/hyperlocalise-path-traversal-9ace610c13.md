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

## Revalidation

**Verdict:** true-positive

The current source still performs only lexical path validation with `normalizeWorkspacePath`; it does not resolve the real path of the requested file. Although `VercelSandboxRuntime.readFile` has a symlink guard, `createReadTool` no longer uses `ctx.bash.readFile`; it invokes `wc -c`, `wc -l`, and `sed` through `ctx.bash.exec`. Those standard tools follow a symlink operand when opening the file. A repository containing `leak.yaml -> /etc/passwd` or another readable sandbox file would pass `normalizeWorkspacePath("leak.yaml")`, then `sed -n ... leak.yaml` would return target contents. The output is redacted only after the read, so redaction is not an access-control boundary. This remains exploitable by an attacker who can influence repository contents and prompt the agent to read the symlink path.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-05-30)
