# Workspace activity log contract

## Status

Accepted. This document defines the workspace activity-log contract and its asynchronous delivery
boundary.

## Context

Hyperlocalise already stores resource-scoped history in `issue_sheet_activities`,
`memory_entry_events`, and glossary history. The workspace activity log serves a different purpose:
it records high-signal organization changes so an operator can answer who changed workspace access
or configuration, when the change happened, and which resource it affected.

The log is an organization audit trail, not a second copy of issue, CAT, translation-memory-entry,
or glossary-term history.

## Decision

The shared contract lives in
`apps/hyperlocalise-web/src/lib/activity-log/activity-log-contract.ts`. It contains the v1 event
catalog, typed payload mappings, actor and target kinds, the enqueue input shape, the Workflow
event shape, the persisted record shape, and the safe-payload guard. It remains independent of
Drizzle so the storage layer can map these types to columns without creating a schema-layer
dependency on application code.

The request path validates an event, assigns its ID and occurrence timestamp, and enqueues it with
Vercel Workflow. The request never inserts into `organization_activity_events`. A Workflow step
performs the final insert asynchronously using the supplied event ID for idempotent retries.

### Event catalog

V1 includes the following event types:

| Area | Event types |
| --- | --- |
| Membership | `member_invited`, `member_invite_resent`, `member_role_changed`, `member_removed` |
| Workspace | `workspace_updated` |
| Credentials | `personal_access_token_created`, `personal_access_token_revoked` |
| Integrations | `integration_connected`, `integration_disconnected` |
| Projects | `project_created`, `project_archived`, `project_deleted`, `project_settings_changed` |
| Glossaries | `glossary_created`, `glossary_deleted`, `glossary_imported`, `glossary_exported`, `glossary_ownership_changed`, `glossary_project_attached`, `glossary_project_detached` |
| Translation memory | `translation_memory_created`, `translation_memory_deleted`, `translation_memory_imported`, `translation_memory_exported`, `translation_memory_project_attached`, `translation_memory_project_detached` |

The current `organization_api_keys` table is the implementation behind personal access tokens. The
contract reserves `organization_api_key_created` and `organization_api_key_revoked`, but current
writers emit the personal-access-token events until the data model distinguishes the two resources.

Job and automation events are later additions: `job_created`, `job_cancelled`, `job_failed`,
`automation_run_started`, `automation_enabled`, and `automation_disabled`.

The log excludes issue comments and field changes, CAT edits, TM entry text, glossary term text,
emails, file contents, prompts, agent transcripts, request bodies, raw tokens, token hashes,
authorization headers, and provider secrets. Existing resource timelines continue to own their
history.

### Actor and target

Each event has these fields:

| Field | Contract |
| --- | --- |
| `organizationId` | Internal organization ID; every event is tenant-scoped. |
| `actorKind` | `user`, `system`, `agent`, or `api_key`. |
| `actorUserId` | Nullable internal user ID. Set for a human session and when an API credential owner is known. |
| `actorCredentialId` | Nullable opaque credential ID. Set for `api_key`; never store the credential secret or hash. |
| `eventType` | Stable snake_case event name from the catalog. |
| `targetKind` | Organization, invitation, membership, credential, integration, project, glossary, or translation memory. |
| `targetId` | Opaque ID of the affected target. |
| `payload` | Event-specific safe metadata defined by the typed contract. |
| `createdAt` | Event occurrence timestamp assigned before Workflow enqueueing. |

Human session mutations use `actorKind: user`. WorkOS-driven membership removal uses
`actorKind: system`. Agent and API-key actors are reserved for paths that already identify those
actors; API-key events carry the credential ID and resolved owner ID when available.

### Payload rules

Payloads may contain opaque IDs, safe display names, provider or resource kinds, statuses, counts,
batch IDs, safe filenames, and old/new values that are not secrets or linguistic content.

Membership events use membership, invitation, and member-user IDs. Role changes carry the previous
and next role slugs. Workspace and project settings changes carry changed field names and only
approved safe old/new values. Credential events carry the token ID, existing display prefix,
permissions, and revocation reason. Import/export events carry resource ID, optional batch ID,
count, and a filename only when it is safe metadata; omit filenames that may contain customer copy.
Attachment events carry both project and resource IDs.

The shared guard rejects forbidden sensitive or content-bearing keys at any nesting depth. Typed
payloads remain the primary restriction; the guard is a defensive boundary for future writers.

### Ordering and query shape

The enqueue path supplies an ISO timestamp for every event before Workflow delivery. The Workflow
persists that occurrence timestamp, so delayed delivery does not reorder events based on worker
execution time. PostgreSQL remains authoritative for the stored timestamp value.

The future list API reads only the requested organization and orders newest first by
`created_at DESC, id DESC`. Its opaque cursor represents the `(created_at, id)` tuple, so events
with identical timestamps remain stable. Actor, event-type, and time-range filters are applied
server-side by the API follow-up.

### Permission, retention, and failure

`activity_logs:read` is granted only to `admin` and `localization_manager`. Permission enforcement
belongs in the list API and Settings page implementation; this contract does not change the role
matrix.

V1 keeps events indefinitely. Export and external retention controls are later work.

Activity delivery is best effort. A failed Workflow enqueue never fails the user mutation, but the
event may be missing because there is no durable application-side buffer. Workflow retries
transient insert failures and uses the event ID to avoid duplicates. The enqueue helper returns the
typed `activity_log_enqueue_failed` result and logs a safe correlation ID with event and target
status. It never logs the payload, request body, secret, hash, token, email, or provider content.

## Follow-up boundaries

- Map this contract to append-only storage and the Workflow enqueue/consumer pair.
- Add `activity_logs:read` and the organization-scoped list API.
- Instrument membership and workspace-admin mutations.
- Instrument credential and integration lifecycle mutations.
- Instrument project, glossary, and translation-memory lifecycle mutations.
- Define and instrument the later job and automation catalog.

## Testing

The contract module tests cover the actor and target constants, v1 versus reserved/later catalogs,
event-type recognition, and recursive rejection of forbidden payload keys. Follow-up tests must
cover Workflow payload construction, retry-safe insertion, organization isolation, enqueue failure
behavior, permission checks, and each instrumented mutation.
