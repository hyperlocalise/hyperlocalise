# Issue Sheet — Design

**Status:** Approved for MVP planning  
**Date:** 2026-07-07

## Summary

Issue Sheet is a per-project team workspace for viewing, querying, and resolving localization issues. It unifies issues from the CAT editor, provider QA, TMS review threads, and manual entry into one spreadsheet-like table. Teams can extend the sheet with custom columns and run AI enrichment on demand.

Design goals:

- **Balanced** — one sheet serves translators, LQA, and engineering via preset views
- **Simple first** — virtual read model over existing data; thin overlay for workflow fields
- **Excel-familiar** — sortable columns, filters, inline edit, bulk select
- **Extensible** — per-project custom columns without fixed-field limits

## Problem

Hyperlocalise tracks issues in several places today:

| Source | Surface | Gap |
|--------|---------|-----|
| Native CAT comments | Segment editor | No team-wide query or assignment |
| Provider QA findings | Job detail | Tied to a single job run |
| TMS review threads | Provider sync | Siloed per external job |
| Agent warnings | Agent run review | Not browsable across work |

Teams export to spreadsheets or external trackers and lose links to source strings, TMS state, and AI context.

## Vision

One row per actionable issue. System columns guarantee CAT deep links and provider write-back. Custom columns carry team workflow. AI enrichment is a column type, not a separate feature.

```
┌─────────────┐   ┌─────────────┐   ┌─────────────┐   ┌─────────────┐
│ CAT editor  │   │ Provider QA │   │ TMS threads │   │ Manual add  │
└──────┬──────┘   └──────┬──────┘   └──────┬──────┘   └──────┬──────┘
       │                 │                 │                 │
       └─────────────────┴────────┬────────┴─────────────────┘
                                  ▼
                    ┌─────────────────────────┐
                    │ Issue Sheet (per project)│
                    │  · unified rows          │
                    │  · preset views          │
                    │  · custom columns        │
                    │  · AI enrichment cols    │
                    └─────────────────────────┘
                                  │
                    ┌─────────────┼─────────────┐
                    ▼             ▼             ▼
              Open in CAT    Assign/resolve   Write-back to TMS
```

## Users and preset views

Everyone uses the same page. Preset views set filters and visible columns.

| View | Default filter | Primary audience |
|------|----------------|------------------|
| **My work** | Assignee = me, status ≠ resolved | Translators |
| **QA triage** | Source = QA or TMS, severity ≥ warning, unassigned | LQA / PMs |
| **Source & context** | Type ∈ `source_mistake`, `context_request`, `general_question` | Engineering / product |
| **All open** | Status = open or in_progress | Everyone |

Users can hide or reorder columns within a view. Saved custom views are out of MVP scope.

## Column model

Columns live in a per-project registry. All columns — system, provider, custom, and enrichment — use the same schema and rendering path.

### Layers

| Layer | Defined by | Examples | Deletable |
|-------|------------|----------|-----------|
| **System** | Platform (seeded) | key, locale, source, target, type, status, severity, file, reporter, assignee | No (hide only) |
| **Provider** | Auto on TMS/QA sync | thread ID, QA rule, TMS state | No (hide only) |
| **Custom** | Project team | Priority, Sprint, Component | Yes |
| **Enrichment** | Project team (AI type) | Context, Suggested fix | Yes |

Custom column definitions are **per project** for MVP. Org-level column templates are deferred to v1.1.

### Column definition

```typescript
IssueSheetColumn {
  id: string
  projectId: string
  key: string              // slug: "priority", "context_summary"
  label: string
  layer: "system" | "provider" | "custom" | "enrichment"
  type: ColumnType
  config?: ColumnConfig
  sortOrder: number
  createdBy?: string
  createdAt: Date
}

ColumnType =
  | "text"
  | "long_text"
  | "number"
  | "select"
  | "date"
  | "user"
  | "boolean"
  | "enrichment"

ColumnConfig {
  options?: { id: string; label: string; color?: string }[]  // select
  prompt?: string
  agentKind?: "context" | "suggest_fix" | "custom"
  autoRun?: "never" | "on_create" | "on_source_change"  // MVP: always "never"
  min?: number
  max?: number
  readonly?: boolean
}
```

### Row values

```typescript
IssueSheetRowValue {
  rowId: string
  columnId: string
  value: unknown
  computedAt?: Date       // enrichment columns
  computedByRunId?: string
}
```

System field values (key, locale, status, etc.) are read from underlying source records. The overlay stores overrides and all custom/enrichment values.

### MVP column types

Custom columns in MVP: `text`, `select`, `long_text`, `user`.

Deferred to v1.1: `number`, `date`, `boolean`, `multi_select`, `url`, custom enrichment prompts.

One seeded enrichment column ships with every project: **Context** (`agentKind: context`, `autoRun: never`).

## Row model

Each row normalizes one issue regardless of origin.

```typescript
IssueSheetRow {
  id: string
  projectId: string
  source: "cat" | "qa" | "tms" | "manual"
  externalRef?: string    // provider thread ID or native comment ID

  // Resolved from source + overlay + column values
  key: string
  locale: string
  filePath?: string
  segmentId?: string
  sourceText?: string
  targetText?: string
  issueType: IssueType
  severity?: "error" | "warning" | "info"
  status: "open" | "in_progress" | "resolved" | "wont_fix"
  reporterId?: string
  assigneeId?: string
  note?: string
  createdAt: Date
  updatedAt: Date
  resolvedAt?: Date

  values: Record<string, unknown>  // keyed by column.key
}
```

### Issue types

Reuse existing Crowdin-aligned types:

- `translation_mistake`
- `source_mistake`
- `context_request`
- `general_question`

### Deduplication

One row per underlying issue. If a segment already has an open CAT issue, "Add to Issue Sheet" shows a link instead of creating a duplicate. QA findings and TMS threads map by `externalRef`.

## Data architecture

### Approach: virtual sheet + overlay

MVP uses a query layer over existing data rather than a materialized issue index.

| Table / source | Role |
|----------------|------|
| `project_translation_comments` (type = issue) | Native CAT issues |
| `ProviderQaFinding` (in job outcome) | QA rows |
| `ProviderReviewThread` (on sync) | TMS rows |
| `issue_sheet_overlays` | Row identity, status/assignee overrides, manual rows |
| `issue_sheet_columns` | Per-project column registry |
| `issue_sheet_row_values` | Custom and enrichment cell values |

A materialized `issue_sheet_rows` index is deferred until query performance requires it (~500+ open issues per project).

### Overlay table

```typescript
issue_sheet_overlays {
  id: uuid PK
  project_id: uuid FK
  source: enum
  external_ref: text nullable     // links to comment / thread / finding
  segment_id: text nullable
  status: enum nullable           // override when source has no status
  assignee_id: uuid nullable
  note: text nullable
  created_by: uuid
  created_at, updated_at, resolved_at
}
```

## API surface (MVP)

```
GET    /projects/:id/issue-sheet
       ?view=my_work|qa_triage|source_context|all_open
       &status=&type=&locale=&assignee=
       &page=&limit=

POST   /projects/:id/issue-sheet
       { source, key, locale, issueType, note?, segmentId? }

PATCH  /projects/:id/issue-sheet/:rowId
       { status?, assigneeId?, note? }

GET    /projects/:id/issue-sheet/columns
POST   /projects/:id/issue-sheet/columns
       { key, label, type, config? }

PATCH  /projects/:id/issue-sheet/columns/:columnId
DELETE /projects/:id/issue-sheet/columns/:columnId
       // custom/enrichment only

PATCH  /projects/:id/issue-sheet/rows/:rowId/values
       { columnKey, value }

POST   /projects/:id/issue-sheet/columns/:columnId/run
       { rowIds: string[] }
       // enrichment columns only; creates agent_run per row batch
```

### Filter DSL

Filters reference any column by `key`:

```json
{ "columnKey": "priority", "op": "eq", "value": "P0" }
{ "columnKey": "context_summary", "op": "is_empty" }
{ "columnKey": "status", "op": "in", "value": ["open", "in_progress"] }
```

Supported ops in MVP: `eq`, `neq`, `in`, `is_empty`, `is_not_empty`.

## UI

### Sheet page

Route: `/projects/:projectId/issue-sheet`

```
┌─────────────────────────────────────────────────────────────────┐
│ Issue Sheet    [My work ▾]  [+ Add]  [+ Column]  [Run column]  │
├─────────────────────────────────────────────────────────────────┤
│ Filters: status=open · type=any · locale=any         [Clear]   │
├──┬────────┬────────┬──────────┬─────────┬─────────┬──────┬──────┤
│☐ │Status  │Type    │Key       │Source   │Target   │Locale│ ... │
├──┼────────┼────────┼──────────┼─────────┼─────────┼──────┼──────┤
│☐ │open    │trans.  │btn.save  │Save     │Speich.  │de    │ →  │
└──┴────────┴────────┴──────────┴─────────┴─────────┴──────┴──────┘
```

Interactions:

- Row click → side panel with full text, comment thread, assignee, "Open in CAT"
- Inline edit on editable columns (status, assignee, custom fields)
- `→` opens CAT at segment
- Checkbox + **Run column** fills enrichment cells for selected rows
- **+ Column** opens add-column dialog (name, type, options for select)

Column header menu: hide, edit (custom only), delete (custom only).

### CAT integration

In the CAT editor segment actions:

**"Add to Issue Sheet"** — keyboard shortcut `Cmd+Shift+I`

1. Pre-fills key, locale, source, target, file, segment ID
2. User picks issue type and optional note
3. Creates overlay row with `source: cat`

If an open issue already exists for the segment, show toast with link instead of duplicating.

## AI enrichment

Enrichment columns use the existing agent infrastructure (`agent_runs`).

### Context column (seeded)

On **Run column**, the agent produces a short plain-text summary:

- Where the string appears (file, key, repo snippet if GitHub connected)
- Glossary and TM hits from CAT intelligence
- Source ambiguity flags for `source_mistake` and `context_request`

Results write to `issue_sheet_row_values`. Show per-cell spinner during run. Mark stale when source text changes after `computedAt`.

`autoRun` is `never` in MVP. On-demand only.

### Agent run kind

New kind: `issue_enrichment` (or extend `comment_only` with structured output). Each run links to `computedByRunId` on the cell value.

## Provider integration

### Ingest (read-only in MVP)

| Source | Trigger | Row mapping |
|--------|---------|-------------|
| Native CAT issue | On create / page load | `source: cat`, `externalRef: commentId` |
| QA finding | After job QA run | `source: qa`, severity from finding |
| TMS review thread | On provider sync | `source: tms`, status mirrors thread |

Provider-layer columns (thread ID, QA rule) seed when a provider connects.

### Resolve / write-back

Status change on sheet queues write-back through existing provider paths:

- TMS thread → resolve via provider write-back
- Native comment → update comment status
- QA finding → mark resolved locally; re-QA on next run clears or reopens

User sees one "Resolve" action. Backend routes by `source` and `externalRef`.

## Permissions

| Action | Translator | LQA / PM | Project admin |
|--------|------------|----------|---------------|
| View sheet | ✓ | ✓ | ✓ |
| Add from CAT | ✓ | ✓ | ✓ |
| Edit status / assignee | ✓ | ✓ | ✓ |
| Add custom columns | — | ✓ | ✓ |
| Run enrichment | ✓ | ✓ | ✓ |
| Delete custom columns | — | — | ✓ |

TMS OAuth users see the sheet for projects they can access. Row scope is not restricted per user in MVP.

## MVP scope

### In

- Per-project Issue Sheet page
- Virtual sheet over comments, QA, TMS threads
- Overlay for manual rows and workflow overrides
- Column registry with seeded system and Context enrichment columns
- Custom columns: text, select, long_text, user
- Four preset views
- CAT "Add to Issue Sheet"
- Inline edit, filter, sort
- On-demand enrichment via Run column
- Deep link to CAT segment
- Read-only ingest of QA and TMS issues

### Out (v1.1+)

- Org-level column templates
- Saved custom views
- Cross-project org sheet
- Bulk resolve and bulk assign
- Custom enrichment prompts
- Additional column types (number, date, url, multi_select)
- CSV / Excel export
- Auto-enrich on create
- Desktop CAT plugins
- Materialized issue index

## Success criteria

- Translator flags an issue from CAT and finds it in **My work** within seconds
- LQA opens **QA triage**, assigns issues without opening each job
- Engineering opens **Source & context**, runs Context enrichment, and has enough information to act without leaving the sheet
- No duplicate rows for the same underlying issue
- Sheet loads in under 2 seconds for ~500 open issues
- Team adds a custom Priority column and filters by it

## Future: materialized index

When virtual queries slow down, add `issue_sheet_rows` populated by events:

- Comment created / updated
- QA run completed
- Provider sync finished
- Overlay or value changed

Keep the column registry and row values schema unchanged. Migration is additive.

## References

Existing models and surfaces to integrate:

- `project_translation_comments` — native issues (`type`, `issueType`)
- `ProviderQaFinding` / `ProviderQaReport` — automated QA
- `ProviderReviewThread` — TMS review threads
- CAT workspace — `components/cat/`, queue `has_issues` filter
- `agent_runs` — provider agent work and audit trail
