# Activity Logs implementation

## Summary

Build a privacy-safe, organization-scoped audit trail. The existing accepted ADR at
`docs/adr/2026-09-04-workspace-activity-log-contract.md` remains the contract record; this document
describes the implementation sequence and asynchronous Workflow delivery.

The work is organized as storage and writing, permissioned API access, lifecycle instrumentation,
and the Settings viewer with server-side filters. Job and automation events are an explicit post-v1
phase.

## Contract and storage

- Keep the typed catalog in `src/lib/activity-log/activity-log-contract.ts` as the only source of
  v1 event, actor, target, and safe-payload types.
- Add append-only `organization_activity_events` storage with organization, actor, credential,
  event, target, safe JSON payload, and an occurrence timestamp column.
- Add the `(organization_id, created_at, id)` index and generate the Drizzle migration through
  `vp run db:generate`.
- Route every event through `enqueueActivityLogEvent`. Validate forbidden payload keys recursively,
  assign an event ID and occurrence timestamp, and enqueue the event with Vercel Workflow. The
  request waits only for Workflow enqueueing; it never waits for the activity-table insert.
- Persist the final row in a Workflow step with the supplied event ID and `ON CONFLICT DO NOTHING`
  so retries are idempotent. Enqueue and Workflow failures return safe diagnostics and never fail
  the owning mutation. Events can be lost if Workflow enqueueing fails because no outbox or other
  durable application-side buffer is used.

## Permissioned API

Add `activity_logs:read` for `admin` and `localization_manager` only, including policy tests,
role documentation, and WorkOS setup.

Add `GET /api/orgs/:organizationSlug/activity-logs` with Zod-validated query parameters:

- `eventTypes` repeated values from the v1 catalog
- `actor=user:<id>|system|agent|api_key`
- `range=24h|7d|30d|all`
- bounded `limit`, default 50
- opaque cursor containing `(createdAt, id)` and a normalized filter fingerprint

Return `{ activityLogs, nextCursor }`, newest-first. Each item contains the safe event payload plus
server-enriched actor and target view models. Deleted users use `Deleted user`; unavailable targets
have no link. Invalid or filter-mismatched cursors use the standard error envelope.

## Event coverage and UI

- Record membership invitations, role changes, removals, WorkOS removals, and workspace updates
  without emails or customer data.
- Record current `organization_api_keys` using PAT semantics while preserving the existing `pat.*`
  operational audit. Reserved organization-API-key event names remain unused.
- Record project, glossary, and translation-memory lifecycle and attachment events, never per-entry,
  per-term, or file-content changes.
- Add job and automation events after the initial viewer release.
- Add the capability-gated Settings navigation item and
  `/org/[organizationSlug]/settings/activity-logs` page with localized sentences, target links,
  relative timestamps, loading/error/empty states, and initial load-more behavior.
- Add keyboard-accessible event, actor, and time filters, server-side filtering, clear and no-results
  states, and cursor reset when filters change.

## Verification

- Test contract safety, Workflow payload construction, idempotent delivery, organization isolation,
  timestamp ordering, retry behavior, and non-blocking enqueue failures.
- Test role access, authentication, tenant isolation, cursor ties, invalid cursors, each filter,
  and combined filtering.
- Test every instrumented mutation for event type, actor, target, payload safety, and failure
  behavior.
- Test Settings navigation, page rendering, deleted actors, target links, loading/error/empty
  states, filters, and pagination.
- Run `vp test` and `vp check --fix` for touched web code.

## Assumptions

- No historical backfill, export, SIEM integration, or retention automation is included.
- Events are retained indefinitely in v1.
- One Workflow run is started per activity event; true database batching is intentionally excluded.
- New source files include the repository BSL header.
