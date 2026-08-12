# Chat Dock Repository Sandbox Session Persistence

## Date

2026-08-12

## Context

The Hyperlocalise chat dock already reuses a Vercel repository sandbox per conversation when the repository context key matches and the sandbox is still available. Web storage lived in a process-local Map with a 30-minute TTL.

That Map fails across instances and cold starts: the next turn creates a new sandbox, and the previous one becomes an orphan until the three-day cleanup cron deletes it. Slack avoids this by storing the same session shape on Chat SDK thread state.

## Decision

Persist web chat repository sessions in Postgres in a dedicated `interaction_repository_sessions` table (one row per interaction).

### Storage

| Column | Purpose |
|--------|---------|
| `interaction_id` | Primary key; FK to `interactions` (cascade delete) |
| `organization_id` | Tenant scope for cleanup |
| `session` | JSONB matching `ConversationRepositorySession` (GitHub context + sandbox session) |
| `version` | Optimistic concurrency counter |
| `expires_at` | Idle TTL (30 minutes, refreshed on write) |
| `created_at`, `updated_at` | Audit timestamps |

### Read / write

- `getWebConversationRepositorySession` and `setWebConversationRepositorySession` become async and use this table.
- Writes use compare-and-swap on `version` (same retry loop as today in `channels/web.ts`).
- Expired rows are treated as missing on read: delete the row and stop the sandbox (lease-aware).
- Process-local leases remain for in-flight stream safety; they are not persisted.
- Drop the in-memory max-entry eviction; Postgres does not need it.

### Cleanup

- Lazy expiry on read handles the common path.
- Replacing a sandbox id still stops the displaced sandbox.
- Failed CAS still stops the losing turn's newly created sandbox.
- The existing sandbox cleanup cron remains the orphan safety net.

## Consequences

- Chat dock sandbox reuse survives multi-instance deploys and process restarts.
- Conversation create/reply seed paths must await the Postgres store.
- Schema migration required; Slack storage is unchanged.
