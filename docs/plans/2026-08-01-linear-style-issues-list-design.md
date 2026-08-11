# Linear-style Issues list — Design

**Status:** Approved  
**Date:** 2026-08-01

## Summary

Replace the spreadsheet-style Issues UI on **org Issues** and **project Issue Sheet** with a shared Linear-like list: compact header, Filter popover, status-grouped dense rows. Custom fields stay in the issue detail panel. Storybook coverage is required for the shared shell and both pages.

## Problem

The current Issues screens expose too much at once: a labeled two-row filter panel, a status summary badge strip, a wide table (including custom columns on Issue Sheet), and multiple equal-weight header actions. The list does not dominate. Localization managers need to triage by status quickly; the chrome fights that goal.

## Goals

- One shared list experience for org Issues and project Issue Sheet
- Status-grouped dense rows as the primary surface
- Filters behind a single Filter control; active filters as chips
- Custom columns remain supported, but only in issue detail
- Calm, restrained light/dark UI (Vercel composure, not a dark Linear clone)
- Storybook stories with play functions for the new shell and updated pages

## Non-goals

- Per-status section fetches or independent “load more” per group
- Linear Display menu for opt-in list columns
- New board / kanban API
- Dark-theme-only redesign

## Primary user action

Scan by status → open an issue (or create one). Everything else is secondary.

## Design direction

Calm, dense, confident. Hierarchy from spacing and muted metadata, not card stacks, badge strips, or labeled filter grids. Support light and dark with controlled contrast.

## Decisions

| Topic | Decision |
|-------|----------|
| Scope | Org Issues + project Issue Sheet |
| List shape | Status-grouped dense list |
| Custom columns | Detail panel only; not in the list |
| Filters | One Filter button → popover; chips for active filters |
| View presets | Inside the Filter popover (keeps toolbar minimal) |
| Header actions | Secondary text buttons for Import CSV / + Column; primary + Issue |
| Summary badges | Remove; counts live on section headers |
| Backend | Keep flat list APIs; default sort status then updated; group in UI |
| Approach | Shared list shell composed by both pages |

## Layout

Top → bottom:

1. **Header** — title (short or no description); actions: secondary Import CSV / + Column (Issue Sheet only) + primary + Issue
2. **Toolbar** — search + Filter + Sort; dismissible chips under the toolbar when filters are active
3. **Grouped list** — full width, no card wrapper, no table chrome
   - Section header: chevron · status icon · label · count (from `summary`)
   - Row: priority icon · title · (org: project name) · locale · assignee · relative date

Status order: Open → In progress → Resolved → Won’t fix. Hide empty groups unless that status is the active filter. With a single-status filter, show one section or a flat list without headers.

### Removed from always-visible UI

- Summary badge strip (`N total`, `N open`, …)
- Labeled two-row filter grid
- Custom columns in the list
- Always-on type / link / context columns in the list

## Interaction

- Row click / Enter opens the existing issue detail panel
- Inline controls (for example assignee) stop row activation
- Filter popover: status, type, priority, locale, assignee, and project (org only), plus view presets
- Chips remove one filter; Clear all when any chip is active
- Default sort: status, then `updated_at` descending within each status
- User-selected Sort still applies within groups; grouping remains by status for multi-status results
- Load more stays global on the flat page (not per section)
- Create / Import / Column dialogs stay as they are; new columns appear in detail, not the list
- Section collapse is local UI state

## States

| State | Behavior |
|-------|----------|
| Loading | Skeleton section headers + rows |
| Empty (no issues) | Calm empty state + create CTA |
| Empty (filters) | No matching issues + clear filters |
| Error | Inline error + retry |
| Single-status filter | One section or flat list |
| Collapsed section | Header remains; rows hidden |

## Architecture

Shared components under org `_components/` (names indicative):

- `IssueListToolbar` — search, Filter popover, Sort, chips (replaces the always-visible filter grid)
- `IssueGroupedList` — status sections + dense rows
- `IssueListRow` — shared row; org adds project; Issue Sheet omits it

Page shells (`IssuesPageView`, `IssueSheetPageContent`) keep data fetching, dialogs, and page-specific actions. They compose the shared shell.

### Backend

Keep existing flat list endpoints, filters, offset/limit pagination, and summary counts.

- Default client sort becomes `status`, then `updated_at` desc within status
- UI groups consecutive statuses from the ordered page
- Section counts use existing `summary` fields
- Do not invent per-group pagination in this pass

Avoid client-only grouping of an “updated-desc” page; incomplete groups and awkward pagination follow.

## Content

- Drop long page descriptions, or keep at most one short line
- Section labels: Open / In progress / Resolved / Won’t fix
- Keep filter and chip copy; tighten empty / filtered-empty / error strings if needed

## Storybook coverage (required)

Update existing page stories and add shared-component stories with play functions.

| Story set | Coverage |
|-----------|----------|
| `IssueGroupedList` | Multi-status groups, collapsed section, single-status, empty |
| `IssueListToolbar` | Default, open Filter popover, active chips + clear |
| `App/Issues/Page` | Default grouped, loading, empty, filtered empty, error, load more |
| `App/Project/Issue Sheet/Page` | Same, plus Import / Column secondary and Issue primary |

Assertions should confirm:

- No summary badge strip
- No table header chrome
- Section headers show status counts
- Custom fields do not appear in the Issue Sheet list

Update fixtures and MSW so multi-status data exercises grouping. Rewrite play functions that currently expect badge text such as `3 total` or table structure.

## Implementation outline

1. Add shared toolbar + grouped list + row components
2. Wire default sort to status-primary ordering
3. Swap org Issues and Issue Sheet pages onto the shared shell
4. Move custom column cells out of the Issue Sheet list (detail already owns fields)
5. Update and add Storybook stories with play coverage
6. Run `vp test` and `vp check --fix` in `apps/hyperlocalise-web`

## Success criteria

- First viewport reads as a triage list, not a filter form
- Both Issues surfaces look and behave the same aside from project-only actions and the project column
- Grouping remains coherent with the flat API and default sort
- Storybook covers the shared shell and both pages, including empty / loading / error / filtered states
