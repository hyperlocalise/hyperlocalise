# [MEDIUM] Upload source tool can read paths outside the repository workspace

**File:** [`apps/hyperlocalise-web/src/lib/agent-runtime/tools/repo-write-tools.ts`](https://github.com/hyperlocalise/hyperlocalise/blob/main/apps/hyperlocalise-web/src/lib/agent-runtime/tools/repo-write-tools.ts#L347-L411) (lines 347, 348, 349, 350, 351, 381, 382, 383, 390, 403, 411)
**Project:** hyperlocalise
**Severity:** MEDIUM  •  **Confidence:** medium  •  **Slug:** `path-traversal`

## Owners

**Suggested assignee:** `cungminh2710@gmail.com` _(via last-committer)_

## Finding

createUploadSourcesTool describes paths as repository-relative, but the schema accepts arbitrary strings and normalizeSourcePath only rewrites separators; it does not reject absolute paths or '..' segments. The tool validates the extension on normalizedPath, then runs cat on the original path and stores the returned bytes as a Hyperlocalise source file. If this exported write tool is made available in a write-enabled repository-agent surface, a prompt/tool caller could read sandbox-accessible files outside the checked-out repository, as long as the supplied path has a supported translation-file extension, and persist the contents into project storage.

## Recommendation

Reject absolute paths and any path containing '..' before executing sandbox commands. Reuse the workspace path normalizer used by read/grep tools, pass the validated normalized path to cat, and add file count/size limits for uploads.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-05-27)
