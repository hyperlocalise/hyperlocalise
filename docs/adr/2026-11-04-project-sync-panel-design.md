# Project Sync panel

## Date

2026-11-04

## Status

Accepted

## Context

[Project content sync](./2026-09-11-project-content-sync-design.md) shipped as a workspace automation (`kind: "content_sync"`). Automations are now built only as AI automations or visual workflows, and the GitHub repository automation is deprecated. Visual workflows are gated by plan (`automation_workflow`, checked when a run is dispatched). Syncing a project with its repository should not depend on either: it is part of the project, on every plan.

The visual workflow Content sync step and the content-sync automation already share one executor, `executeContentSyncConfig`, which takes a settings object (`ContentSyncConfig`) and returns a summary with the pull request link.

## Decision

Add a **Sync** panel to project settings. It stores one sync per project in its own table and runs `executeContentSyncConfig` directly. It is not an automation and is not plan-gated.

### Product

- Settings → Sync on every native project. External TMS projects sync through their TMS and do not show it.
- Fields: repository (a GitHub repository enabled in Integrations), repository folder, project folder, schedule (only Sync now, every hour, every day).
- **Sync now** starts a run with the saved settings. It is disabled while the form has unsaved edits or a run is going.
- Recent runs show status, when and how they started, files imported, translated files sent, the error, and a link to the pull request.
- Remove sync deletes the settings and the run history; files already imported stay.
- Admins, localization managers and developers may change the sync and start it (`projects:write`, the capability that already covers project settings). Others with access to the project see it read-only.

### Storage

- `project_content_syncs`: one row per project (unique on `project_id`). `sync_config` holds a `ContentSyncConfig`, the same shape the visual workflow step and the content-sync automation pass. `schedule` and `next_run_at` drive the timed job.
- `project_content_sync_runs`: one row per run, with trigger, status, the provider's summary (including the pull request link), error code and message, start and end.
- `workspace_automation_runs` is not reused: every row there belongs to a workspace automation.
- `ContentSyncConfig` gains optional `pathTemplate` and `localeCodeMap` for providers that map file paths and language codes. The panel keeps them when it saves; GitHub ignores them.

### Runs

- Sync now and the timed job both call `startProjectContentSyncRun`, which claims a run and queues the `projectContentSyncWorkflow`. The workflow has one step that calls `executeContentSyncConfig` and records the outcome. The step is not retried, because a retry would repeat the pull and the pull request.
- **One run per sync at a time.** Claiming takes `pg_advisory_xact_lock` keyed by the sync id for the length of a short transaction: inside it, a `running` run older than 30 minutes is marked failed, any other `running` run refuses the claim, and otherwise a new `running` run is inserted. The lock is released at commit; the `running` row holds the sync until the run finishes or goes stale. A stale run that later finishes still records its real outcome.
- The timed job is `/api/cron/project-content-sync`, every 15 minutes in `vercel.json`. It moves each due sync's `next_run_at` forward with a compare-and-set before starting it, so overlapping ticks start it once, and a sync whose run is still going waits for its next slot.
- Errors returned by the provider are shown as written. A thrown error is stored as "The sync stopped unexpectedly." and logged with the run id.

### Extending to another provider

A provider adds its connection check in the panel route's `resolveSyncConnection`, its connections in `GET …/content-sync/connections`, and its executor in `executeContentSyncConfig`. The panel's lock, schedule and run records need no change.

### Out of scope

- Converting existing content-sync automations into project syncs.
- More than one sync per project.
- Triggers from provider webhooks (push events).
- Changing visual-workflow plan gating or the GitHub repository automation.

## Consequences

- Two places can run the same sync code: the panel, and a visual workflow Content sync step. The lock covers the panel's runs only; a workflow step on the same repository and folder can run beside a panel run.
- Every scheduled sync starts a sandbox clone of the repository, on every plan.
- Pull requests opened by the panel use the same branch naming and body as the content-sync automation, keyed by the run id.
