# Manual source-upload automation runs

## Context

Source-upload automations run after a project file finishes ingestion. Their detail pages did not
offer a manual run because a valid run needs source-file context. Operators need a way to select
one or more existing project files and run that automation without uploading again or triggering
every other source-upload automation on the project.

Real ingest still deduplicates matching path and content hashes. That optimization must not block
an operator from starting a new run for a file they explicitly select, even if the last matching
run succeeded.

## Decision

**Run now** on a `source_upload` automation opens a searchable checkbox dialog of existing project
source files. The client posts `{ sourcePaths }` to
`POST /api/orgs/:organizationSlug/automations/:automationId/source-files`.

The route validates that the automation is active, uses the `source_upload` trigger, belongs to a
native Hyperlocalise project, and that every selected path still has a stored source-file version.
It then dispatches **only that automation**. Dispatch uses `forceNewRun: true`, which builds a
unique idempotency key so each selection always starts a new run.

Ordinary ingest and project uploads stay content-based. Same path and hash reuse a succeeded run.
Failed or cancelled runs get `:retry:N`. They do not pass `forceNewRun`.

When the automation enables **Translate with agent**, the created job records Agent as its
assignee before translation is enqueued. Assignee is one logical value: Agent, a workspace member,
or unassigned. Assigning a member replaces Agent, and clearing the member leaves the job
unassigned. Native job details also read target locales from the job's native input payload.

## User experience

The automation detail page shows **Run now** for source-upload triggers. Selecting it opens a
dialog of existing files, not a native file picker. Operators can search, check multiple files, and
confirm. The toast reports how many files were selected and how many runs were queued. If none
queued, the copy is **No automation runs queued**. The action stays disabled while a run is in
flight or the automation is inactive.

## Error handling

The API rejects empty selections, duplicate paths, missing files, inactive or mismatched
automations, missing projects, external TMS projects, and insufficient permissions with the
standard JSON error envelope.

## Testing

Tests cover:

- automation-scoped source-file selection and dispatch;
- always-new manual runs after a succeeded matching run;
- unchanged content-based idempotency for ordinary ingest;
- Agent assignment, replacement by a member, and native target-locale display;
- searchable multi-file selection and queued-run feedback.
