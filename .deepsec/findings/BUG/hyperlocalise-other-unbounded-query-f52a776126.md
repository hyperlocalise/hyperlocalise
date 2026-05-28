# [BUG] File list limit is applied after unbounded repository file scans

**File:** [`apps/hyperlocalise-web/src/lib/projects/project-files.ts`](https://github.com/hyperlocalise/hyperlocalise/blob/main/apps/hyperlocalise-web/src/lib/projects/project-files.ts#L108-L363) (lines 108, 116, 126, 172, 330, 363)
**Project:** hyperlocalise
**Severity:** BUG  •  **Confidence:** high  •  **Slug:** `other-unbounded-query`

## Owners

**Suggested assignee:** `cungminh2710@gmail.com` _(via last-committer)_

## Finding

The project and workspace file list helpers accept a caller-controlled limit, but repository files are loaded with an unbounded window query before filtering and slicing. `listFilteredProjectFiles` calls `listProjectFilesForProject` and only applies `.slice(0, input.query.limit)` after all merged files are built. Inside `listProjectFilesForProject`, the repository versions query computes `ROW_NUMBER()` across all matching source files and has no SQL limit. `listWorkspaceFiles` repeats this per accessible project and only slices after flattening and sorting all results. An authenticated user with access to a large workspace can request a small limit, or a search that matches little, while still forcing full per-project scans, in-memory filtering, and sorting. This is a resource-exhaustion risk rather than a direct data exposure issue.

## Recommendation

Push filtering and pagination into SQL for repository files, add keyset pagination or a bounded latest-version query, and avoid scanning every accessible project before applying the requested limit. Consider separate capped queries for repository and provider-backed files.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-05-23)
