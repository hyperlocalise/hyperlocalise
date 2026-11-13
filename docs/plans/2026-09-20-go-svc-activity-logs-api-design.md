# go-svc activity logs API

## Goal

Add a parallel org settings activity-log list API in go-svc. Keep the Hono route
and browser client on Hono until a later cutover.

## Scope

- `GET /v1/orgs/{organizationSlug}/activity-logs` only (settings list).
- Read path over `organization_activity_events` with the same query contract,
  cursor fingerprint, actor options, target hydration, and response shape as Hono.
- Out of scope: content-editor file activity route, enqueue/writer, Hono removal,
  browser client switch.

## Architecture

- Path: `/v1/orgs/{organizationSlug}/activity-logs` (also under `/api/go-svc`).
- Auth: WorkOS session cookie + live membership role (same as teams/glossaries).
- Capability: `activity_logs:read` for `admin` and `localization_manager` only.
- Schema: Drizzle remains migration owner; go-svc only reads existing tables.

## Query and response

| Query | Rules |
|-------|--------|
| `actor` | optional `system` \| `agent` \| `api_key` \| `user:<uuid>` |
| `cursor` | optional opaque string (1–2048) |
| `eventTypes` | repeated params; each an implemented event type; empty means all |
| `limit` | 1–100, default 50 |
| `range` | `24h` \| `7d` \| `30d` \| `all` (default) |

Success: `{ activityLogs, actors, nextCursor }`. Cursor is base64url JSON of
`{ createdAt, id, filterFingerprint }` with SHA-256 fingerprint matching Hono
(`actor`, sorted `eventTypes`, `projectId`, `range`, `sourcePath`).

## Errors

| Status | Code |
|--------|------|
| 401 | `unauthorized` |
| 403 | `organization_access_denied`, `activity_logs_read_forbidden` |
| 400 | `invalid_activity_log_query`, `invalid_activity_log_cursor` |
| 503 | pool/WorkOS unavailable |
| 500 | `internal_error` |

## Files

- `activity-log.go` — route, auth, query parse, list, cursor
- `activity-log-targets.go` — target hydration helpers
- `activity-log_test.go` — handler tests with stub session + fake pool
