# Query activity events

## Status

Accepted

## Context

The workspace activity log already records projects, jobs, automations, and
visual workflows. Queries (issue-sheet rows) only have a per-issue feed. Operators
cannot see who created, deleted, or imported Queries from Settings → Activity
logs.

The log stays a high-signal organization audit trail. It is not a second copy of
the issue feed.

## Decision

Add a `query` target kind and three lifecycle events.

| Event | When | Target |
| --- | --- | --- |
| `query_created` | A Query row is inserted | `query` |
| `query_deleted` | DELETE removes a Query | `query` |
| `query_imported` | A committed spreadsheet import creates one or more rows | `project` |

Do not emit status, assignee, type, priority, comment, watch, relationship, or
column-config events. Those stay on the issue feed.

Import is one event per successful committed import. Dry runs do not emit. A
200-row import does not emit 200 `query_created` events.

QA promote emits `query_created` with `source: qa_promote` only when a new row
is inserted. Idempotent replays do not emit again. MCP create uses
`source: mcp`. Session and go-svc creates use `source: manual`.

Payloads stay safe metadata: Query id, identifier, project id, source, and
import `itemCount`. Never store title, description, comment bodies, or
spreadsheet contents. Display name is the identifier (`WEB-21`).

Session mutations use `actorKind: user`. go-svc create, delete, and QA promote
publish after a successful commit. Hono create, MCP create, and Hono import
enqueue after a successful mutation.

go-svc resolves `query` targets from `issue_sheet_issues` and links to
`/org/:slug/projects/:projectId/issue-sheet/:identifier`. Deleted Queries keep
the identifier from the payload.

## Consequences

Settings → Activity logs can filter Queries separately from issue-feed noise.
Soft history on the Query itself is unchanged. Hard delete still leaves a
readable activity row.
