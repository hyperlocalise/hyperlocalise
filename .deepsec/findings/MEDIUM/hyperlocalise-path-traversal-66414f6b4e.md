# [MEDIUM] Glob pattern prefixes can escape the workspace

**File:** [`apps/hyperlocalise-web/src/lib/agent-runtime/tools/workspace/glob.ts`](https://github.com/hyperlocalise/hyperlocalise/blob/main/apps/hyperlocalise-web/src/lib/agent-runtime/tools/workspace/glob.ts#L20-L89) (lines 20, 30, 53, 54, 55, 56, 60, 64, 89)
**Project:** hyperlocalise
**Severity:** MEDIUM  •  **Confidence:** high  •  **Slug:** `path-traversal`

## Owners

**Suggested assignee:** `cungminh2710@gmail.com` _(via last-committer)_

## Finding

Only the optional `path` input is normalized. Directory components extracted from `pattern` are trusted and joined into `searchDir` without rejecting `..` segments, so a model-supplied pattern such as `../../etc/*` can make `find` enumerate files outside the repository sandbox root. The tool then returns those paths to the agent/user, violating the advertised repository-only boundary.

## Recommendation

Normalize and validate the complete constructed search directory, including literal directory prefixes from the glob pattern. Reject `..`, absolute paths, and paths that resolve outside the workspace. Prefer a safe glob implementation rooted to the workspace over manually translating glob input into `find` arguments.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-05-27)
