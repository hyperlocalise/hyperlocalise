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
- **Sync now** starts a run with the saved settings. It is disabled while the form has unsaved edits, the saved repository is no longer enabled, or a run is going.
- Recent runs show status, when and how they started, files imported, translated files sent, the error, and a link to the pull request.
- Remove sync deletes the settings and the run history; files already imported stay. It is refused while a run is going, because that run still writes to the repository.
- Saving is refused while an active content-sync automation moves the same repository folder into the project (same fingerprint as the automation's own duplicate check). The automation side does not check the panel, so resuming a paused automation afterwards can still run both.
- Saving and removing log `project_settings_changed` with `changedFields: ["sync"]`.
- Admins, localization managers and developers may change the sync and start it (`projects:write`, the capability that already covers project settings). Others with access to the project see it read-only.

### Storage

- `project_content_syncs`: one row per project (unique on `project_id`). `sync_config` holds a `ContentSyncConfig`, the same shape the visual workflow step and the content-sync automation pass. `schedule` and `next_run_at` drive the timed job.
- `project_content_sync_runs`: one row per run, with trigger, status, the provider's summary (including the pull request link), error code and message, start and end.
- `workspace_automation_runs` is not reused: every row there belongs to a workspace automation.
- `ContentSyncConfig` gains optional `pathTemplate` and `localeCodeMap` for providers that map file paths and language codes. When settings are saved, a path template must be a safe relative path containing `{{locale}}` and code map entries may use letters, digits, `-` and `_`; stored settings are read leniently, so a saved sync is never dropped by a stricter check. The panel keeps them when it saves; GitHub ignores them.

### Runs

- Sync now and the timed job both call `startProjectContentSyncRun`, which claims a run and queues the `projectContentSyncWorkflow`. The workflow has one step that calls `executeContentSyncConfig` and records the outcome. The step is not retried, because a retry would repeat the pull and the pull request. If the step itself dies (for example it runs out of time), a second step marks the run failed.
- **One run per sync at a time.** Claiming takes `pg_advisory_xact_lock` keyed by the sync id for the length of a short transaction: inside it, a `running` run whose work started more than 15 minutes ago (above the longest a step may run; the start time is reset when the step begins, so time in the queue does not count) is marked failed, any other `running` run refuses the claim, and otherwise a new `running` run is inserted. The lock is released at commit; the `running` row holds the sync until the run finishes or goes stale. Removing a sync takes the same lock. Listing runs also marks stale ones, so the panel never waits for the cron to free Sync now. A run is only finished while still `running`: once failed as stale, a late result is logged, not recorded, because another run may already hold the sync.
- **One pull request per sync.** The panel passes `pullRequestBranchKey: sync-<syncId>`, and the shared pull request helper's opt-in `reuseBranch` path rebuilds that branch from the base commit each run (`checkout -B`, since the sandbox is a shallow clone), leaves an open pull request alone when the synced files on it are already the same (it fetches the branch and compares only those paths, since the rebuilt base moves on its own), and otherwise force-pushes with a lease on the branch's current head, also when the branch outlived its pull request. Commits a reviewer pushes to that branch are replaced on the next run that changes a synced file. A run that pushes nothing records no translated files sent. The visual workflow step, the content-sync automation and the GitHub repository automation do not opt in and keep their branch per run or job.
- The timed job is `/api/cron/project-content-sync`, every 15 minutes in `vercel.json`. It moves each due sync's `next_run_at` forward by whole intervals from the due time (so late ticks do not push the schedule back) with a compare-and-set on `next_run_at <= now` before starting it, so overlapping ticks start it once, and a sync whose run is still going waits for its next slot. Saving keeps the next run time when the schedule is unchanged, decided inside the upsert.
- The panel shows its own translated text for the error codes it knows and the provider's message for the rest. A thrown error is stored as "The sync stopped unexpectedly." and logged with the run id.

### Extending to another provider

A provider adds its connection check in the panel route's `resolveSyncConnection`, its connections in `GET …/content-sync/connections`, and its executor in `executeContentSyncConfig`. The panel's lock, schedule and run records need no change.

### Out of scope

- Converting existing content-sync automations into project syncs.
- More than one sync per project.
- Triggers from provider webhooks (push events).
- Changing visual-workflow plan gating or the GitHub repository automation.

## Consequences

- Two places can run the same sync code: the panel, and a visual workflow Content sync step. The lock covers the panel's runs only; a workflow step on the same repository and folder can run beside a panel run.
- The deprecated GitHub repository automation does not give way to a panel sync on the same repository the way it gives way to a content-sync automation.
- Every scheduled sync starts a sandbox clone of the repository, on every plan. A new commit re-imports every file in the folder, which re-runs source-upload automations on unchanged files (shared upload behaviour, unchanged here).
- Admins, localization managers and developers can choose any enabled repository in the workspace, which is wider than content-sync automations (admins and localization managers).
