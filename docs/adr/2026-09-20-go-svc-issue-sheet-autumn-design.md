# go-svc issue-sheet and Autumn client

## Date

2026-09-20

## Context

Issue sheet and related social APIs live under Hono at
`/api/orgs/:slug/projects/:projectId/issue-sheet`. They are Postgres CRUD gated by
Autumn feature `queries-board` and WorkOS session capabilities. go-svc already
creates issue rows when promoting QA findings, and already hosts glossary, TM,
dictionaries, teams, and QA report reads.

Glossaries and translation memories are already in go-svc. The next portable
surface is project issue-sheet (core + social), without org inbox bulk/search or
CSV import.

Hono uses `autumn-js` for boolean checks and raw HTTP for `balances.track`.
go-svc has no Autumn client today, so a Go port of issue-sheet must include a
fail-closed entitlement check.

## Decision

### Autumn client (`apps/go-svc/internal/autumn`)

Add a small HTTP client that mirrors the TS usage we need:

1. `Check` — `POST https://api.useautumn.com/v1/balances.check` with
   `x-api-version: 2.2.0`. Customer ID is the organization UUID. Fail closed when
   the API key is missing, the transport fails, or `allowed !== true`.
2. `Track` — `POST …/v1/balances.track` for metered usage (`customer_id`,
   `feature_id`, `value`, `idempotency_key`, optional properties).
3. `TrackTokens` — token burn for managed AI credit, matching the web app's
   track-tokens call shape.

Config reads `AUTUMN_API_KEY`. Tests inject a fake HTTP client or allow when the
key is unset in the same spirit as TS `NODE_ENV=test`.

### Issue-sheet API (project-scoped)

Mount under `/v1/orgs/{organizationSlug}/projects/{projectId}/issue-sheet`:

- List / get / create / update issues and cell values
- Columns CRUD, reorder, template config
- Feed, comments, relationships, subscriptions

Auth matches existing go-svc org APIs (WorkOS cookie or Bearer). Capability map
matches Hono: read via `projects:read`, issue mutations via
`write_back:translation`, column/template writes via `projects:write`. Every
handler gates on Autumn `queries-board` first.

Reuse and share QA promote helpers for starter columns, issue number allocation,
identifier `PREFIX-N`, create activity, and reporter subscription.

### Non-goals (this change)

- Org `/issues` list, bulk actions, and org issue-sheet search
- CSV import
- Notification email workflows (inbox DB rows may still be written)
- Deleting Hono issue-sheet routes (dual-run until clients cut over)
- Full autumn-js parity (customers, attach, portal, React)

## Consequences

- Issue-sheet traffic can move to go-svc without Vercel Workflow or Blob.
- Billing gates stay consistent with Hono once `AUTUMN_API_KEY` is set on go-svc.
- QA promote and issue create share one serial/column path, reducing drift.
- Follow-ups can add org inbox routes and usage tracking call sites on the new
  Autumn client.

## Testing

- Autumn client unit tests against `httptest` (allow, deny, transport error, track)
- Issue-sheet handler tests with fake DB steps and stub Autumn allow/deny
- Cover Autumn deny short-circuit, team ACL, create serial, protected columns,
  comment author rules, and relationship cycle / single `duplicate_of`
