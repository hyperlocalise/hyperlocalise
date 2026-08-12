# Manage Custom Issue Columns — Design

**Status:** Approved  
**Date:** 2026-08-12

## Summary

Let project members manage Issue Sheet custom columns from Project settings: add, rename, reorder, hide/show, and delete. Persist configuration per project. Protect core issue fields and seeded columns (`priority`, `owner_note`, `context`) from deletion. Keep Issue Sheet **+ Column** as a quick-create shortcut. Custom fields stay on issue detail (Linear-style list unchanged).

## Decisions

| Topic | Choice |
|-------|--------|
| Surface | Field registry for detail/create forms (not list columns) |
| Manage UI | Project settings → Issue columns section |
| Quick create | Keep Issue Sheet **+ Column** |
| Hide | Project-wide; values retained; hidden fields omitted from detail/create |
| Edit after create | Label, select options, order, visibility — not key or type |
| Protected | Core fields + seeded `priority`, `owner_note`, `context` |

## Architecture

Extend `issue_sheet_columns` with `hidden boolean not null default false`. Reuse `sortOrder`. Values remain in `issue_sheet_row_values` (cascade on delete).

### Categories

| Category | Source | Hide | Delete | Edit |
|----------|--------|------|--------|------|
| System (core) | Issue row fields — synthetic list in settings | No (MVP) | No | No |
| Built-in seeded | `priority`, `owner_note`, `context` | Yes | No | Label (where allowed), options locked for priority, reorder |
| Custom | User-created `layer: custom` | Yes | Yes (confirm) | Label, select options, reorder, hide |

### API

- `GET /columns` — include `hidden`
- `POST /columns` — unchanged
- `PATCH /columns/:columnId` — `label?`, `config?`, `sortOrder?`, `hidden?`
- `PUT /columns/order` — `{ columnIds: string[] }` atomic reorder
- `DELETE /columns/:columnId` — custom only; reject protected keys

Consumers of detail/create filter `hidden === false`. Settings lists all columns.

### Auth

Same as create column: `isProjectMutationAllowed` / `projects:write`.

## UI

Settings section with System (read-only), Built-in, and Custom groups. Badges distinguish Built-in vs Custom. Reorder via up/down. Delete uses `AlertDialog`. Hidden columns stay in settings but leave issue detail and create forms.

## Out of scope

List-view custom columns, per-user visibility, type/key changes, org templates, new column types, enrichment run UI, hiding core system fields.

## Testing

Service and route tests for update/hide/reorder/delete and protected deletes. Column utils filter hidden. Settings UI covered via existing test patterns where practical.
