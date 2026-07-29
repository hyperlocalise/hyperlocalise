# Native TMS automation tools

## Problem

Source-upload automations need to work with Hyperlocalise native TMS in two
clear steps: create a job, then start agent translation. Today
`create_translation_jobs` creates and enqueues in one tool, which hides that
orchestration.

## Decision

Replace `create_translation_jobs` with two workspace orchestrator tools:

1. `create_native_tms_job` — create a native file translation job from the
   source-upload snapshot and automation translation config. Persist only.
2. `assign_translate_with_agent` — enqueue that job on the existing translation
   job queue (same path as native `run-agent`).

## Scope

- Workspace automation orchestrator only
- Reuse the native file-translation workflow queue
- Keep `toolConfig.translation` as the enablement gate

## Out of scope

- Conversational Hyperlocalise agent tools
- Provider TMS `translate_with_agent` agent-run path for native jobs
- New job status values for “created but not started”

## Data flow

```
source upload
  → workspace automation (mode: source_upload)
  → create_native_tms_job (DB job + details)
  → assign_translate_with_agent (enqueue translation job event)
  → file translation workflow
```

## Shared helpers

Split `enqueueFileTranslationJob` into create + enqueue helpers. The combined
helper remains for API and other callers.

## Idempotency

Both tools read prior step results / run `outputSummary` and return the same
payload when already completed for the run.
