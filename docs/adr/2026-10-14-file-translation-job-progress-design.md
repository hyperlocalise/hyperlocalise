# File translation job progress

**Status:** Accepted

## Context

File translation jobs (`jobs.kind = translation`, `translation_job_details.type = file`) run in `fileTranslationJobWorkflow`. The job row only records `queued`, `running`, `succeeded`, or `failed`. Context assembly, string extraction, translation memory reuse, paginated `hl run` passes, per-locale retries, and output storage are visible only in server logs. Users cannot tell what an agent is doing or how far it has got.

## Decision

Record an append-only progress log per job and show it on the job detail page as a Linear-style activity feed with a live run card.

### Data model

Add a `job_events` table:

| Column            | Notes                                      |
| ----------------- | ------------------------------------------ |
| `id`              | Primary key                                |
| `job_id`          | References `jobs.id`, cascades on delete   |
| `organization_id` | Owning organization                        |
| `workflow_run_id` | Nullable; groups events into run attempts  |
| `actor_user_id`   | Nullable; set for user actions             |
| `type`            | Event type                                 |
| `locale`          | Nullable target locale                     |
| `payload`         | jsonb; counts, codes, and IDs only         |
| `created_at`      | Event time                                 |

Index `(job_id, created_at)`.

Event types, modeled as a TypeScript discriminated union:

- Workflow: `job_started`, `context_ready`, `strings_extracted`, `tm_reused`, `locale_progress`, `locale_retrying`, `locale_completed`, `locale_failed`, `job_succeeded`, `job_failed`.
- User actions from Hono mutation routes: `job_cancelled`, `job_retried`, `job_marked_failed`.

Payloads never contain source text, translations, or filenames.

### Writes

The workflow records events through `recordJobEventStep`, so workflow replays do not duplicate them. Recording is best-effort: a failed write is logged and the job continues. `locale_progress` is emitted after each translation page only when the count changes. Image and video jobs emit start, per-locale completion, and the terminal event.

### Reads

go-svc serves `GET /v1/orgs/{organizationSlug}/jobs/{jobId}/events`, with the same membership check as the job read. It returns `{ events }` oldest first, capped at 500. The browser calls it through `GoSvcClient.job.listEvents`.

### UI

The native job detail page renders a `JobActivitySection` for file translation jobs:

- A "Created" row.
- One run card per `workflow_run_id`, with the current stage, a row per locale (status icon, translated/total strings, translation memory reuse), and a collapsible list of detailed steps.
- Rows for user actions such as cancel and retry.

A pure `buildJobActivity` function derives runs, locale state, and steps from events. React Query polls events and the job every 3 seconds while the job is `queued` or `running`, and stops in a terminal state. Jobs without events show only the "Created" row and current status. A failed events request shows an inline error without affecting the rest of the page.

## Alternatives considered

- **Progress snapshot column on `jobs`.** Cheapest, but keeps only current state and cannot drive a timeline.
- **Workflow step history or `organization_activity_events`.** Step names are internal and retention is outside our control. The organization activity log is an audit trail; high-frequency progress would flood it, and the SQS path adds latency.

## Out of scope

Progress on the jobs list or kanban, inbox surfaces, server-sent events, other job kinds, and the public `/v1/jobs/{jobId}/status` response.

## Validation

Unit-test `buildJobActivity` and workflow event emission, add a go-svc handler test, and add Storybook states for queued, in-progress, partial failure, and failed jobs. Run `vp test`, `vp check --fix`, `make fmt`, `make lint`, and `make test`.
