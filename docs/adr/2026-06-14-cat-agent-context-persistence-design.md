# CAT Agent Context Persistence Design

## Date

2026-06-14

## Context

The CAT workspace exposes a **Find context** action that runs the repository agent to explain where a localization string appears in the connected GitHub repository. The result is shown in the **Context found by agent** panel.

Today that lookup is expensive:

- It creates a repository sandbox.
- It invokes the repository subagent.
- It tears the sandbox down again.

The result only lives in client state (`segmentIntelligence.agentContext`). If a translator switches segments, reloads the page, or returns to the file later, Hyperlocalise reruns the full agent workflow even when the source string has not changed.

## Decision

Persist successful repository-context lookups in Postgres and hydrate them when the CAT workspace loads.

### Storage model

Add `project_file_string_repository_contexts` with one row per lookup key:

| Column | Purpose |
|--------|---------|
| `organizationId`, `projectId` | Tenant and project scope |
| `sourcePath` | TMS file path being reviewed |
| `stringKey` | Localization key |
| `repositoryFullName` | Repository used for the investigation |
| `sourceTextHash` | SHA-256 of trimmed source text for staleness checks |
| `summary` | Agent-written context shown in CAT |
| `createdByUserId` | User who triggered the lookup |
| `createdAt`, `updatedAt` | Audit timestamps |

Unique index: `(organizationId, projectId, sourcePath, stringKey, repositoryFullName)`.

### Read path

1. **CAT file load** (`GET /files/detail/cat`): batch-read cached summaries for all visible segment keys and attach them as `segment.repositoryContext`.
2. **Find context** (`POST /files/string-context`): resolve the repository, return the cached summary when the stored hash matches the current source text, otherwise run the repository agent and upsert the result.

`forceRefresh: true` on the lookup request bypasses the cache for explicit re-investigation.

### Invalidation

A cached row is ignored when `sourceTextHash` no longer matches the current segment text. No background invalidation job is required for the first version.

Repository changes are handled by including `repositoryFullName` in the cache key. When multiple repositories have cached rows for the same key, CAT hydration prefers the repository that would be auto-selected for new lookups.

### UI behavior

- `projectFileCatToWorkspaceState` maps `repositoryContext` to `segmentIntelligence.agentContext`.
- Segments with persisted context auto-reveal the **Context found by agent** section.
- Clicking **Find context** on a segment that already has context reveals the panel without calling the API again.

## Consequences

- Translators pay the agent cost once per string/repository/source-text combination.
- Reloading the CAT workspace restores previously found context.
- Source text edits automatically invalidate stale cache entries.
- Future work can add admin controls for TTL, bulk refresh, or linking cache rows to repository commit SHAs.
