# Glossary import/export history

## Summary

Add a persistent per-glossary history page for asynchronous glossary imports and
exports. The page follows the existing Translation Memory import-history
pattern and uses the GoSvc-owned `glossary_import_runs` records as its source
of truth.

## User experience

- Route: `/org/{organizationSlug}/glossaries/{glossaryId}/imports`.
- The native glossary detail page links to “Import/export history”.
- The history page lists the newest runs first with operation, format, source or
  result filename, status, counts, timestamps, and error summary.
- Active runs refresh automatically; pagination uses an opaque cursor.
- Each row links to a report detail view. Completed exports expose a download
  action; completed replace imports expose a backup download when available.
- Existing import/export dialogs continue to poll for immediate feedback and
  link users to the history page after queueing or completion.

## Backend contract

Add an authenticated GoSvc endpoint scoped to the organization and glossary:

`GET /v1/orgs/{organizationSlug}/glossaries/{glossaryId}/import-reports`

Query parameters are `limit`, `cursor`, and optional `operation`/`status`
filters. The response contains `runs` and `nextCursor`. Results are ordered by
`created_at DESC, id DESC` and only expose non-sensitive run metadata. Existing
single-report, signed-download, and backup endpoints remain unchanged.

The query must enforce the same glossary ownership and membership checks as the
existing report endpoint. It should return import and export runs, including
`upload_pending`, `queued`, `processing`, `completed`, and `failed` states.

## Frontend structure

- Add a Next.js page and client component matching the Translation Memory
  import-attempt detail layout.
- Add typed GoSvc client methods and response types for listing runs.
- Use React Query infinite pagination and a three-second refetch interval while
  any visible run is active.
- Reuse existing status badges, cards, alerts, skeletons, organization links,
  and localized message conventions.
- Keep report details on a dedicated route so long diagnostics do not make the
  history list unwieldy.

## Error handling and authorization

- Preserve 401/403/404 handling used by glossary detail pages.
- Show retry controls for transient list/report failures.
- Never expose object keys, signed URLs, source hashes, or secret metadata in
  the list response.
- Only show backup/download actions when the run state and operation support
  them; signed URLs are requested only after the user activates an action.

## Testing

- GoSvc tests for ownership, cursor ordering, operation/status filters, empty
  results, and malformed pagination input.
- GoSvc client tests for the new list path and query encoding.
- Component/page tests for loading, empty, active, completed, failed, and
  paginated states, plus download visibility.
- Run the existing glossary and Translation Memory UI test suites and the
  required web checks.
