# [MEDIUM] Repository symlinks can make push-source upload files outside the checkout

**File:** [`apps/hyperlocalise-web/src/lib/agents/github/github-repository-automation-push-source.ts`](https://github.com/hyperlocalise/hyperlocalise/blob/main/apps/hyperlocalise-web/src/lib/agents/github/github-repository-automation-push-source.ts#L184-L213) (lines 184, 187, 196, 213)
**Project:** hyperlocalise
**Severity:** MEDIUM  •  **Confidence:** high  •  **Slug:** `path-traversal`

## Owners

**Suggested assignee:** `cungminh2710@gmail.com` _(via last-committer)_

## Finding

The push-source workflow derives upload paths from Git diffs for repository-controlled commits, filters them only by i18n patterns and extension, and then passes them to uploadRepositorySourceFilesFromSandbox. That helper normalizes the string path but reads it with `cat` without rejecting symlinks or verifying the resolved path stays inside the repository. A repository contributor can commit a localization-looking symlink such as `locales/en.json -> /proc/self/environ`, `/etc/hosts`, or another readable sandbox path. When automation runs, lines 184-197 collect that path and line 213 uploads it as a source file for the project. This can disclose sandbox-local files into Hyperlocalise storage and can also be abused for workflow denial of service with links to blocking or very large pseudo-files.

## Recommendation

Before uploading, resolve each candidate path inside the sandbox with a no-symlink guard, reject symlinks and paths whose realpath escapes the repository root, and enforce a byte-size limit before reading. Prefer a guarded workspace read helper over raw `cat`, and add tests for symlinked localization files and absolute/parent-traversal targets.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-05-31)
