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

## Revalidation

**Verdict:** true-positive

The routes that reach this helper are authenticated and organization/team scoped: project files uses workosAuthMiddleware plus getOwnedProject, and workspace files uses workosAuthMiddleware plus buildAccessibleProjectsWhere. The query schema caps limit at 1,000, and the provider-backed path does push provider filters plus a normalized SQL limit into listExternalTmsFilesForProject. The repository-backed path is still materially unbounded at the expensive part: versionsSubquery computes ROW_NUMBER() OVER (PARTITION BY sourcePath ORDER BY createdAt DESC) across all matching repository source file versions for the project, and the outer repositoryFetchLimit is applied only after filtering rn = 1 and ordering. Search, origin, locale, syncState, and providerKind are not pushed into that repository query; listFilteredProjectFiles fetches repository rows even for filters such as origin=provider and then filters in memory. listWorkspaceFiles also enumerates every accessible project, runs listProjectFilesForProject for each at concurrency 5, flattens and sorts all per-project results, and only then slices to the caller limit. A user with access to a large workspace or a project with many repository file versions can request a small limit or selective search and still force large database window scans and many per-project queries. This is an availability/resource-exhaustion issue rather than cross-tenant data exposure. Commit 3a00186e added outer fetch limits and reduces returned-row memory growth, but it did not remove the unbounded repository latest-version scan or implement SQL/keyset pagination for the repository side.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-05-31)
