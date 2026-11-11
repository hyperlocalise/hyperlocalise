# Automation and visual-workflow activity events

## Status

Accepted

## Context

The workspace activity log already records agent-automation enable, disable, and
run-started events. It does not record automation create or delete, and it does
not record visual workflows at all. Operators cannot see who published, paused,
or started a visual workflow from Settings → Activity logs.

The log stays a high-signal organization audit trail. It is not a second copy of
run history, graph JSON, or knowledge-file uploads.

## Decision

Add create and delete events for agent automations. Add a separate
`visual_workflow` target kind and event catalog.

| Event | When |
| --- | --- |
| `automation_created` | Agent automation POST succeeds |
| `automation_deleted` | DELETE archives an automation |
| `visual_workflow_created` | Visual workflow POST succeeds |
| `visual_workflow_deleted` | DELETE archives the workflow |
| `visual_workflow_published` | Publish succeeds |
| `visual_workflow_enabled` | PATCH status becomes `active` |
| `visual_workflow_disabled` | PATCH status becomes `paused` or `archived` |
| `visual_workflow_run_started` | A new live run row is inserted |

Keep the existing `automation_enabled`, `automation_disabled`, and
`automation_run_started` events. DELETE no longer emits `automation_disabled`.

Create does not also emit enabled. Publish does not also emit enabled, even
though publish sets status to `active`. Test and mock visual-workflow runs do
not emit. Idempotent run replays do not emit a second time.

Payloads stay safe metadata: resource id, name, status, `runId`,
`triggerSource`, and `publishedVersion` on publish. No graph JSON, secrets,
snapshots, or node history.

Lifecycle events fire from HTTP routes after a successful mutation. Visual
workflow run-started fires inside `createVisualWorkflowRun` so scheduled,
GitHub, source-upload, and manual runs share one writer. Scheduled and webhook
runs use `actorKind: system`. Session mutations use `actorKind: user`.

go-svc resolves `visual_workflow` targets from `visual_workflows` and links to
`/org/:slug/automations/visual-workflows/:id`.

## Consequences

Settings → Activity logs can filter automations and visual workflows separately.
Existing enable, disable, and automation run-started rows stay valid. Soft
archive still leaves a target row, so deleted resources keep their name and
link.
