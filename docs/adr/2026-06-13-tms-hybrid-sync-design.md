# ADR: TMS Hybrid Sync — Live Reads with Durable Background Reconciliation

## Status

Proposed

## Date

2026-06-13

## Context

Hyperlocalise currently operates TMS data across three partially connected modes:

1. **Native projects** (`source: native`) — Postgres-backed projects, jobs, and files owned by Hyperlocalise.
2. **Live external reads** (`tms-provider-live`) — On-demand provider API calls for detail views and CAT editing where synced data is not enough (for example segment writeback).
3. **Durable sync schema** (`provider_sync_intents`, `provider_sync_runs`, `external_tms_files`) — Designed for webhook-driven and scheduled reconciliation, but **not wired** after TMS provider webhooks were deprecated.

Recent Contentful work improved the middle ground: `ensureOrganizationProjectRecord` materializes external TMS projects into `projects` when a connection needs a real FK (for example `contentful_connections.project_id`). That path calls the live API once and upserts project metadata with `lastSyncedAt`, but it does not sync files, jobs, glossaries, or memories.

### Why webhooks alone are insufficient

Provider TMS webhooks are unreliable as the primary sync mechanism:

| Problem | Impact |
| --- | --- |
| Setup friction | OAuth providers, manual fallback URLs, per-project registration |
| Delivery gaps | Retries, ordering, missed events during downtime |
| Verification variance | Provider-specific signature schemes and secret rotation |
| No guarantee of completeness | A webhook tells you *something* changed, not *what* the full state is |
| Hyperlocalise removed TMS webhook routes | `provider_webhook_*` tables are deprecated; no inbound handler exists |

Contentful webhooks are a separate, working pipeline (CMS publish → translation → writeback). They should not be conflated with TMS provider sync.

### What we need

- **Fast UX**: Users see current TMS state immediately (live API).
- **Durable state**: Postgres holds enough mirrored data for FKs, automations, TM/glossary matching, agent runs, and offline resilience.
- **Native + external coexistence**: Orgs can run Hyperlocalise-native projects alongside connected Crowdin/Phrase/Lokalise/Smartling projects in one workspace.
- **Stability**: Background sync must converge without depending on webhook delivery.

The reconciliation env vars (`TMS_SCHEDULED_RECONCILIATION_*`) and sync telemetry (`provider-tms-sync-telemetry.ts`) already anticipate this design but have no consumer.

## Decision

Adopt a **read-through cache with durable background reconciliation** model. Live API calls serve user-facing reads; background workers persist data into existing sync tables. Webhooks become optional **acceleration hints**, not the source of truth.

### Core principle

> **Live answers the question now. Reconciliation makes the answer durable.**

## Architecture

### Data planes

```text
┌─────────────────────────────────────────────────────────────────────────┐
│                         Unified read resolver                           │
│  resolveTmsResource(scope, freshnessPolicy)                             │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │
          ┌─────────────────────┼─────────────────────┐
          ▼                     ▼                     ▼
   ┌──────────────┐    ┌──────────────┐    ┌──────────────────┐
   │ Native DB    │    │ Synced mirror│    │ Live provider API│
   │ projects     │    │ external_tms │    │ tms-provider-live│
   │ jobs         │    │ _files       │    │                  │
   │ repo files   │    │ glossaries   │    │                  │
   │ memories     │    │ memories     │    │                  │
   └──────────────┘    └──────────────┘    └──────────────────┘
          │                     ▲                     │
          │                     │                     │
          │            ┌────────┴────────┐            │
          │            │ Background sync │◄───────────┘
          │            │ (intents → runs)│  (compare + pull)
          └────────────┴─────────────────┘
```

### Project routing (unchanged concept, extended behavior)

`resolveProjectResourceTarget` already distinguishes:

| `projectId` shape | Route |
| --- | --- |
| `project_{uuid}` | Native — DB tables |
| `ext:{provider}:{externalId}` | External — live API today; hybrid after this ADR |

After hybrid sync, external projects gain a **materialized** `projects` row (via `ensureOrganizationProjectRecord`) and **mirrored resources** in `external_tms_files`, `glossaries`, `memories`, etc.

### Read-through cache policy

List endpoints (`GET /projects`, `GET /jobs`, project-scoped job lists) return **local database rows only** so pagination, sorting, and counts stay consistent. Live API data is never merged into list responses.

Background sync keeps the local copy fresh:

1. `GET /projects` enqueues an org-level catalog `project_scan` when TMS is connected.
2. The reconciliation worker materializes provider projects into `projects`.
3. Native (`source: native`) and external (`source: external_tms`) rows coexist in the same table.

Detail views and CAT editing still use live provider APIs where needed.

### Background sync pipeline

Reuse existing tables without schema changes for phase 1:

```text
Trigger (see below)
  → enqueueProviderSyncIntent()     # coalesced by lease_key
  → cron: processProviderSyncIntents()
  → providerTmsSyncWorkflow()       # Vercel Workflow, durable steps
  → provider_sync_runs (audit)
  → upsert external_tms_files / glossaries / memories / projects.lastSyncedAt
```

#### Intent coalescing

`provider_sync_intents.lease_key` unique index (active statuses) already supports deduplication:

```text
lease_key = "{orgId}:{providerKind}:{syncKind}:{projectId}:{resourceId?}"
```

Multiple triggers for the same project scan within a window collapse to one intent.

#### Sync kinds (from `provider_sync_run_kind` enum)

| Kind | Scope | Schedule |
| --- | --- | --- |
| `project_scan` | Project metadata, locale list | On materialize, daily full |
| `file_key_scan` | Discover file keys in project | Incremental cron, on project view |
| `job_task_scan` | Job/task inventory | Incremental cron |
| `pull_content` | Download source + target content for a file key | On demand, post write-back |
| `tm_scan` / `glossary_scan` | Import searchable segments/terms | Hourly cron |
| `health_check` | Credential validation | Daily audit cron |
| `push_translations` | Confirm remote after approved write-back | Post agent write-back only |

#### Triggers (priority order)

| Trigger | Cause enum | When |
| --- | --- | --- |
| Contentful connection | `manual` | `ensureOrganizationProjectRecord` succeeds → `project_scan` + `file_key_scan` |
| User opens project | `manual` | First view in session → incremental scans |
| Cron incremental | `schedule` | Every `TMS_SCHEDULED_RECONCILIATION_INCREMENTAL_INTERVAL_MINUTES` (default 15) |
| Cron TM/glossary | `schedule` | Every `TMS_SCHEDULED_RECONCILIATION_TM_GLOSSARY_INTERVAL_MINUTES` (default 60) |
| Cron full | `schedule` | Nightly at `TMS_SCHEDULED_RECONCILIATION_FULL_HOUR_UTC` |
| Manual "Sync now" | `manual` | Integrations UI button |
| Post write-back | `manual` | Agent write-back workflow completes → `pull_content` for affected keys |
| Provider webhook (optional) | `webhook` | Best-effort hint only; same intent enqueue path |

**Webhooks do not get special treatment.** A webhook delivery enqueues the same intent as a cron tick or a page view. If webhooks fail entirely, scheduled reconciliation still converges.

#### Cron worker

Add `POST /api/cron/tms-scheduled-reconciliation` (same auth pattern as `github-repository-automation-dispatch`):

1. Select pending/retryable intents where `next_attempt_at <= now()`, up to `TMS_SCHEDULED_RECONCILIATION_MAX_INTENTS_PER_TICK`.
2. Lease intents with `lease_token` + `leased_until`.
3. Start `providerTmsSyncWorkflow` per intent (or batch by project).
4. On completion, update intent status, link `provider_sync_run_id`, emit telemetry.

Also enqueue scheduled intents for orgs with active TMS credentials that have materialized `external_tms` projects (proactive reconciliation even without user traffic).

#### Durable execution

Follow the Contentful pattern (`contentfulAutomationExecutionWorkflow`):

```typescript
// workflows/provider-tms-sync.ts
export async function providerTmsSyncWorkflow(intentId: string) {
  "use workflow";
  const result = await executeProviderSyncStep(intentId);
  // retries, partial progress, run linkage
}
```

Steps call existing `tms-provider-fetcher-registry` adapters — the same code paths as live reads, but writing to `external_tms_files` and related tables instead of returning to HTTP.

### Native + live coexistence

#### Project listing

`GET /projects` returns **database rows only** (native + materialized external). When TMS is connected, the handler enqueues an org-level catalog `project_scan` so external projects appear locally after background sync — live rows are not merged into the response.

#### Jobs and files

| Context | Native | External (hybrid) |
| --- | --- | --- |
| List jobs | `jobs` table | Live API + optional DB cache from `job_task_scan` |
| Job detail / CAT | Native CAT tables | Live CAT API (always) |
| File list | `repository_source_files` | Live file keys + `external_tms_files` mirror |
| TM/glossary match | `memory_entries`, `glossary_terms` | Merged: `synced_database` preferred over `live_provider` (existing merge logic) |

#### Contentful integration

Contentful connections require a materialized `projects` row. The flow becomes:

```text
User selects ext:crowdin:902807
  → ensureOrganizationProjectRecord (live fetch + upsert projects)
  → enqueue project_scan + file_key_scan intents
  → createContentfulConnection(projectId = canonical ext:... id)
  → Contentful webhook → translation run uses hybrid TM/glossary (synced preferred, live fallback)
```

This is the bridge between "live browsing" and "durable automation."

### Sync state machine

`external_tms_files.sync_state`:

| State | Meaning |
| --- | --- |
| `pending` | Discovered, content not yet pulled |
| `syncing` | Pull in progress |
| `synced` | Content matches provider revision |
| `stale` | DB copy exists but TTL exceeded or reconciliation detected drift |
| `error` | Last pull failed; retryable via intent |

`projects.last_synced_at` / `last_sync_error_*` track project-level health (already on schema).

### Rollout

Background TMS reconciliation is always on when a TMS credential is connected. List endpoints read from the local database; the Vercel cron at `/api/cron/tms-scheduled-reconciliation` runs every 15 minutes to enqueue catalog scans and process sync intents.

### Observability

Wire existing `provider-tms-sync-telemetry.ts` at intent enqueue, run completion, and reconciliation boundaries. Surface in Integrations UI (schemas already exist: `providerSyncObservabilityQuerySchema`):

- Latest sync run per project
- Intent queue depth and failures
- Stale file count (dashboard summary already queries `external_tms_files.sync_state = 'stale'`)

Update `docs/storage/tms-webhook-sync.mdx` to describe hybrid reconciliation as primary and webhooks as optional hints.

## Implementation phases

### Phase 1 — Foundation (MVP)

- `enqueueProviderSyncIntent()` with lease_key coalescing
- `executeProviderSyncStep` for `project_scan` and `file_key_scan`
- Cron route `tms-scheduled-reconciliation` (wired in `vercel.json`, every 15 minutes)
- Hook `ensureOrganizationProjectRecord` to enqueue scans on materialize
- Read-through enqueue on project view (API middleware or route handler)
- Wire telemetry

**Exit criteria:** Contentful-connected external project has `external_tms_files` rows within one cron cycle; project metadata refreshes on schedule.

### Phase 2 — Content and matching

- `pull_content` for file keys (store in `stored_files` + link `external_tms_files.stored_file_id`)
- `tm_scan` / `glossary_scan` importing into `memories` / `glossaries` with `capability_mode: synced_import`
- Post write-back reconciliation in agent workflows
- Manual "Sync now" on integrations page

**Exit criteria:** TM/glossary agent runs prefer `synced_database` matches; dashboard stale counts are meaningful.

### Phase 3 — Optional webhook hints

- Re-enable inbound route `POST /api/webhooks/tms/{provider}` as thin adapter
- Verify signature → record event → enqueue intent (no direct DB writes in handler)
- Do **not** re-add automatic webhook registration as a requirement

**Exit criteria:** Webhook delivery reduces time-to-sync but system works identically with webhooks disabled.

### Phase 4 — Native TMS product

- "Hyperlocalise Native" TMS (currently `comingSoon` in integrations UI) uses the same native path
- No provider sync needed; native projects are always `source: native`
- Unified project list already merges both sources

## Consequences

### Positive

- Stable convergence without webhook dependency
- Contentful and other automations get durable FKs and mirrored file metadata
- Live UX preserved — users never wait for background sync to complete a read
- Reuses existing schema, env vars, telemetry, and fetcher registry
- Native and external projects coexist in one workspace with clear routing

### Negative / tradeoffs

- Storage growth from mirrored file content (`stored_files` + `external_tms_files`)
- Eventual consistency: DB may lag live API by one cron interval
- OAuth user connections still required for user-attributed live reads on Crowdin/Phrase/Lokalise
- Cron + workflow execution adds operational surface (monitoring intent backlog)

### Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Provider rate limits during full scan | Bounded concurrency (`mapWithConcurrency`), intent batching, per-org backoff |
| Duplicate work across cron and page-view triggers | `lease_key` coalescing on active intents |
| Stale data shown after live API failure | Explicit `stale` metadata in API response; UI freshness indicator |
| Large TM/glossary imports | Separate schedule tier; incremental cursor in `provider_metadata` |

## Alternatives considered

### Webhook-only sync (rejected)

Previously attempted; deprecated due to setup friction and delivery unreliability. Would not meet stability requirement.

### Full sync before any read (rejected)

Users would wait for initial project scan before seeing data. Conflicts with shell mode UX and Contentful connection flow that already uses live API.

### Live-only forever (rejected)

Insufficient for FK requirements, offline TM/glossary matching at scale, agent automation audit trails, and dashboard observability. Contentful materialization proves we already need durable project rows.

## References

- `apps/hyperlocalise-web/src/lib/projects/ensure-organization-project.ts` — project materialization
- `apps/hyperlocalise-web/src/lib/providers/tms-provider-live.ts` — live read layer
- `apps/hyperlocalise-web/src/lib/database/schema/providers.ts` — `provider_sync_intents`, `provider_sync_runs`
- `apps/hyperlocalise-web/src/lib/database/schema/files.ts` — `external_tms_files`
- `apps/hyperlocalise-web/src/workflows/contentful-automation-execution.ts` — durable workflow pattern
- `apps/hyperlocalise-web/src/lib/env.ts` — `TMS_SCHEDULED_RECONCILIATION_*`
- `docs/storage/tms-webhook-sync.mdx` — prior webhook-centric docs (to update)
