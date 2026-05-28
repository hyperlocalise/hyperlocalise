# [MEDIUM] Repository config detection accepts traversal paths

**File:** [`apps/hyperlocalise-web/src/lib/agent-runtime/tools/repo-read-tools.ts`](https://github.com/hyperlocalise/hyperlocalise/blob/main/apps/hyperlocalise-web/src/lib/agent-runtime/tools/repo-read-tools.ts#L35-L77) (lines 35, 38, 42, 43, 45, 73, 77)
**Project:** hyperlocalise
**Severity:** MEDIUM  •  **Confidence:** high  •  **Slug:** `path-traversal`

## Owners

**Suggested assignee:** `cungminh2710@gmail.com` _(via last-committer)_

## Finding

createDetectRepoConfigTool accepts an optional directory path, concatenates it with i18n.yml or i18n.jsonc, then passes the result to test, cat, and yq without workspace-relative validation. A repository agent can therefore probe absolute or parent-directory locations outside the checked-out repository and parse matching config files. The returned summary is limited, but this still crosses the intended repository sandbox boundary and can disclose configuration metadata from unrelated sandbox files.

## Recommendation

Normalize the supplied directory with the same workspace path helper used by the read tool, reject invalid paths instead of falling back, and only run test/cat/yq on the validated workspace-relative path.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-05-27)
