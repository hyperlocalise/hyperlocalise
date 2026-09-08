# Record File and Segment Activity Events

## Problem

Operators and editors need a record of file and string-segment changes. The workspace
activity log already stores high-signal organization events. Files and CAT segments had
no entries, and the content editor had no way to read that history.

## Design

Extend the activity-log contract with `file` and `segment` targets and ten event types:
file uploaded, imported, or exported; segment draft saved, approved, hidden, unhidden,
locked, unlocked, or commented.

Store events in `organization_activity_events`. Payloads keep project ID, source path,
safe filename or string key, locale, and opaque string IDs. They never store source text,
target text, comments, or file contents.

Instrument existing mutation boundaries after a successful write. File upload, translation
import, and CAT export emit file events. CAT save, approve, hide, lock, and comment paths
emit segment events. Bulk hide and lock enqueue one event per string.

The Settings activity page lists these events with the rest of the workspace log. The
content editor adds an icon button that opens a dialog of file and segment events for the
current file. That dialog reads a project-scoped CAT endpoint so anyone who can open the
editor can see the history. The organization Settings API stays gated by
`activity_logs:read`.

## Testing

Add contract and helper tests for target IDs and safe payloads. Cover file upload, import,
export, segment save/approve, hide, lock, and comment instrumentation. Cover the CAT list
endpoint for project isolation, source-path filtering, and permission. Exercise the editor
dialog empty, loading, and populated states.
