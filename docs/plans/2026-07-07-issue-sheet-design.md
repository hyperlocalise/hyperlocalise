# Issue Sheet — Design

**Status:** Approved for MVP planning  
**Date:** 2026-07-07

## Summary

Issue Sheet is a per-project team workspace for viewing, querying, and resolving localization issues inside Hyperlocalise. It unifies CAT issues, native QA findings, source string issues, agent warnings, and manual entries into one spreadsheet-like table. Teams can extend the sheet with custom columns and run AI enrichment on demand.

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
| Native QA findings | Job detail | Tied to a single job run |
| Source string issues | File and CAT surfaces | Hard to triage with translators and engineering together |
| Agent warnings | Agent run review | Not browsable across work |

Teams export to spreadsheets or external trackers and lose links to source strings, CAT state, and AI context. Issue Sheet should make Hyperlocalise the place where teams coordinate localization quality, not a mirror of another TMS.

## Vision

One row per actionable issue. System columns guarantee CAT deep links and source-string context. Custom columns carry team workflow. AI enrichment is a column type, not a separate feature. External provider data can be imported later, but MVP should promote the native Hyperlocalise workflow.

```
┌─────────────┐   ┌─────────────┐   ┌─────────────┐   ┌─────────────┐
│ CAT editor  │   │ Native QA   │   │ Agent runs  │   │ Manual add  │
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
              Open in CAT    Assign/resolve   Enrich with agent
```

## Users and preset views

Everyone uses the same page. Preset views set filters and visible columns.

| View | Default filter | Primary audience |
|------|----------------|------------------|
| **My work** | Assignee = me, status ≠ resolved | Translators |
| **QA triage** | Source = QA, severity ≥ warning, unassigned | LQA / PMs |
| **Source & context** | Type ∈ `source_mistake`, `context_request`, `general_question` | Engineering / product |
| **All open** | Status = open or in_progress | Everyone |

Users can hide or reorder columns within a view. Saved custom views are out of MVP scope.

## Column model

Columns live in a per-project registry. All columns — system, generated, custom, and enrichment — use the same schema and rendering path.

### Layers

| Layer | Defined by | Examples | Deletable |
|-------|------------|----------|-----------|
| **System** | Platform (seeded) | key, locale, source, target, type, status, severity, file, reporter, assignee | No (hide only) |
| **Generated** | Hyperlocalise QA / agents | QA rule, agent run, confidence | No (hide only) |
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
  layer: "system" | "generated" | "custom" | "enrichment"
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
  source: "cat" | "qa" | "agent" | "manual"
  externalRef?: string    // native comment ID, QA finding ID, or agent run ID

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

Use a simple issue taxonomy that works across translation, source, and context problems:

- `translation_mistake`
- `source_mistake`
- `context_request`
- `general_question`

### Deduplication

One row per underlying issue. If a segment already has an open CAT issue, "Add to Issue Sheet" shows a link instead of creating a duplicate. QA findings and agent warnings map by `externalRef`.

## Data architecture

### Approach: virtual sheet + overlay

MVP uses a query layer over existing data rather than a materialized issue index.

| Table / source | Role |
|----------------|------|
| `project_translation_comments` (type = issue) | Native CAT issues |
| Native QA findings (in job outcome) | QA rows |
| `agent_runs` warnings / findings | Agent-surfaced rows |
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
  external_ref: text nullable     // links to comment / QA finding / agent run
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

## External data stance

MVP should not depend on external providers. Issue Sheet should make Hyperlocalise feel like the system of record for localization quality.

External provider data can appear later as import-only context, behind explicit connectors. It should not drive the core product shape, default views, or first-run experience.

### Native ingest

| Source | Trigger | Row mapping |
|--------|---------|-------------|
| Native CAT issue | On create / page load | `source: cat`, `externalRef: commentId` |
| QA finding | After job QA run | `source: qa`, severity from finding |
| Agent warning / finding | After agent run | `source: agent`, link to run |
| Manual issue | User adds from sheet | `source: manual`, user-provided fields |

### Resolve behavior

Status change on sheet updates Hyperlocalise state first:

- Native comment → update comment status
- QA finding → mark resolved locally; re-QA on next run clears or reopens
- Agent warning → mark reviewed or convert to a tracked issue

No external write-back in MVP. Import/export can come later as acquisition support, not as the primary workflow.

## Product management recommendations

### Make the first-run experience opinionated

Create every project with the same starter sheet:

- Views: **My work**, **QA triage**, **Source & context**, **All open**
- Custom columns: **Priority** (`P0`, `P1`, `P2`), **Owner note**
- Enrichment column: **Context**

The product should show value before users configure anything.

### Anchor the habit in CAT

The sheet only wins if translators use it while working. Put **Add to Issue Sheet** in the segment actions, keyboard shortcut, and issue/comment composer. Make the success toast say: "Added to Issue Sheet · View row".

### Treat source issues as a wedge

Most localization tools are target-language centric. Hyperlocalise can differentiate by helping teams find and fix ambiguous source strings with engineering context. Keep **Source & context** as a first-class view, not a filter hidden under QA.

### Make AI enrichment explainable

Each enriched cell should show why it was filled:

- repo/file snippets used
- glossary/TM matches used
- agent run link
- "stale" state when source text changes

This builds trust and lets PMs route issues without reading raw logs.

### Create a weekly team ritual

Ship a lightweight **Review open issues** action later:

- summarizes new issues by type and locale
- highlights unresolved `source_mistake` and `context_request` rows
- suggests owners for unassigned rows

This makes Issue Sheet a recurring collaboration surface, not a passive table.

## Permissions

| Action | Translator | LQA / PM | Project admin |
|--------|------------|----------|---------------|
| View sheet | ✓ | ✓ | ✓ |
| Add from CAT | ✓ | ✓ | ✓ |
| Edit status / assignee | ✓ | ✓ | ✓ |
| Add custom columns | — | ✓ | ✓ |
| Run enrichment | ✓ | ✓ | ✓ |
| Delete custom columns | — | — | ✓ |

Project membership controls sheet access in MVP.

## MVP scope

### In

- Per-project Issue Sheet page
- Virtual sheet over comments, QA findings, agent warnings, and manual rows
- Overlay for manual rows and workflow overrides
- Column registry with seeded system and Context enrichment columns
- Custom columns: text, select, long_text, user
- Four preset views
- CAT "Add to Issue Sheet"
- Inline edit, filter, sort
- On-demand enrichment via Run column
- Deep link to CAT segment
- Native ingest of QA findings and agent warnings

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
- Optional external issue import / export
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
- Agent run completed
- Overlay or value changed

Keep the column registry and row values schema unchanged. Migration is additive.

## References

Existing models and surfaces to integrate:

- `project_translation_comments` — native issues (`type`, `issueType`)
- `ProviderQaFinding` / `ProviderQaReport` — reusable QA finding types
- CAT workspace — `components/cat/`, queue `has_issues` filter
- `agent_runs` — agent work and audit trail
