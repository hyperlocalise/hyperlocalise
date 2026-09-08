# File and string-segment activity events

## Status

Accepted

## Context

Workspace activity logging already covers members, projects, jobs, and automations.
Editors still need a file-scoped history of high-signal CAT actions without a
second event store.

The original workspace contract left CAT edits out of v1 because draft saves
would be too noisy and would risk storing linguistic content.

## Decision

Reuse `organization_activity_events` and the existing writer/reader.

New target kinds:

- `file` — identity is `${projectId}:${normalizedSourcePath}`
- `string_segment` — identity is the segment UUID

Recorded events:

- `file_uploaded`
- `file_translations_imported`
- `string_segment_approved`
- `string_segment_status_changed`
- `string_segment_hidden`
- `string_segment_unhidden`
- `string_segment_locked`
- `string_segment_unlocked`
- `string_segment_commented`

Do not emit events on every draft save.

Payloads stay privacy-safe: project id, source path, file name, optional stored
file / version ids, segment id, locale, item counts, and statuses. Never store
source text, target text, comment bodies, or file contents.

Settings → Activity logs still requires `activity_logs:read`. The file editor
dialog uses a project-scoped CAT GET that any project member can read, filtered
to these event types and the current `projectId` + `sourcePath`.

## Consequences

File and string history is queryable from both Settings and the content editor.
The existing table, cursor, and best-effort Workflow writer stay unchanged.
Draft typing remains out of the log on purpose.
