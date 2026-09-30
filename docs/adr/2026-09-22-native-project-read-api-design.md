# Native project API mirror

## Context

Common native project reads currently run through the Next.js Hono service, adding a Vercel invocation to project lists, open-job counts, content-editor settings, and repository file browsing.

The Go service already owns several organization-scoped native APIs and shares the same PostgreSQL database. It does not yet expose these project contracts.

## Decision

Add native-only Go implementations of these existing routes:

- `GET /v1/orgs/{organizationSlug}/projects`
- `GET /v1/orgs/{organizationSlug}/projects/{projectId}/open-job-count`
- `GET /v1/orgs/{organizationSlug}/projects/{projectId}/content-editor-behavior`
- `GET /v1/orgs/{organizationSlug}/projects/{projectId}/files`

The routes preserve the existing resource-keyed response envelopes and team access rules. External TMS projects remain on the Hono routes.

The web app continues to call the existing Hono routes until a later change switches native overview to these Go endpoints.

## Query design

Project listing uses one query and attaches open-job counts with a correlated aggregate.

The dedicated open-job-count route counts only queued, running, and waiting-for-review jobs after applying project access checks.

Content-editor behavior reads the grouping policy and revision directly from the native project row.

The files route selects the latest repository version per source path, latest file job, and per-locale readiness in PostgreSQL. Provider-live files and provider branch handling remain on Hono.

## Shared membership cache

Wrap the WorkOS organization-membership lookup once during Go service initialization. Every organization-scoped Go API receives the cached lookup.

The cache uses Valkey when configured, a short TTL, bounded cache timeouts, and fail-open behavior for cache failures. WorkOS remains the source of truth on misses. The short TTL bounds delayed role changes and membership revocation.

## Error handling

Invalid, inaccessible, non-native, and missing projects return the existing `project_not_found` envelope so callers cannot infer inaccessible resources. Invalid files queries return a stable `invalid_project_files_query` error. Unexpected database failures return the standard internal error response and safe structured logs.

## Verification

Add Go tests for route contracts, query validation, SQL filtering, and membership-cache hit, miss, expiry, corrupt-value, and cache-failure behavior. Run repository Go formatting, lint, and tests.
