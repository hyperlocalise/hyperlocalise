# External Project String Context Cache Design

## Date

2026-07-06

## Context

The repository-context cache keys entries by organization, project resource ID, file path, string key, and repository. Project resource IDs can identify either stored native projects or live external TMS projects such as `ext:crowdin:9`.

The cache currently requires `project_id` to reference `projects.id`. Saving context for a live external project therefore fails unless Hyperlocalise first materializes that project in the local `projects` table. Repository-context caching should not change project storage.

## Decision

Remove the foreign key from `project_file_string_repository_contexts.project_id` to `projects.id`.

Keep `project_id` non-null and retain the existing organization-scoped unique and lookup indexes. The column stores the canonical project resource ID for both native and external projects.

Cached context survives project deletion and external provider disconnection for now. Deleting the organization still removes its cache rows through the `organization_id` foreign key.

## Verification

Add a regression test that saves and reloads repository context for an encoded external project ID without creating a local `projects` row.

## Consequences

- Repository-context lookup supports live external TMS projects without materializing them.
- The organization boundary continues to isolate cache entries.
- Project deletion no longer removes cache rows automatically.
- A later retention policy can remove stale project cache entries explicitly.
