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

## Revalidation

**Verdict:** true-positive

createDetectRepoConfigTool accepts path as an unconstrained optional string and uses it directly as checkPath. It then builds filePath as either i18n.yml/i18n.jsonc or `${checkPath}/${name}` and passes that value to test, cat, and yq. The workspace path normalizer in workspace/path.ts rejects absolute paths and '..' segments, and the read/grep/glob tools use it, but detectRepoConfig does not. The bash allowlist also rejects absolute paths and traversal, but this tool bypasses createBashTool and invokes ctx.bash.exec directly. createSandboxRepoBash forwards exec calls to VercelSandboxRuntime.runCommand, which does not perform workspace-relative validation; the guarded readFile path is not used here. detectRepoConfig is registered in the normal repository tool registry and included in repositoryWorkspaceToolNames, so it is an exposed repository-agent tool. A tool caller can supply a directory such as ../other or an absolute sandbox directory, causing the tool to test and parse i18n.yml or i18n.jsonc outside the checked-out repository. The returned data is a limited config summary rather than raw contents, but it still crosses the intended repository boundary and can disclose file presence and selected configuration metadata.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-05-31)
