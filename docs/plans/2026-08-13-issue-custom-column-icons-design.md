# Custom Issue Column Icons — Design

**Status:** Approved  
**Date:** 2026-08-13

## Summary

Let project members pick an icon for each custom Issue Sheet column. Store a stable registry id on `issue_sheet_columns.icon`. Show that icon on issue detail, create, and settings. A searchable grid picker offers a curated Hugeicons set.

## Decisions

| Topic | Choice |
|-------|--------|
| Storage | Nullable `icon text` on `issue_sheet_columns` |
| Catalog | Curated Hugeicons set (~50 property-style icons) |
| Stored value | Registry id (`calendar`), not a Hugeicons export name |
| Missing / unknown | Render the `tag` fallback |
| Who can set | Custom columns only |
| After create | Icon is editable, same as label |
| CSV import | Leaves `icon` null |

## Data

`null` means “use the tag fallback.” The database has no default.

A shared registry lists allowed ids. Create and update reject ids that are not in the registry (400). Rows that already hold an unknown id still render as `tag`.

## API

- `GET /columns` includes `icon: string | null`
- `POST /columns` accepts optional `icon`
- `PATCH /columns/:columnId` accepts `icon` as a registry id or `null` to clear

Protected / built-in columns reject icon writes (`issue_sheet_column_icon_not_editable`). Auth stays `projects:write`.

## UI

`IssueColumnIconPicker` is a button that shows the current icon and opens a popover with search and a compact icon grid. Clear sets `icon` back to `null`.

Set the icon in:

- Create-column dialogs (Project settings and Issue Sheet **+ Column**)
- Settings: the custom column row’s icon is a picker

Show the icon in:

- Issue detail sidebar `PropertyRow`
- Main-content custom field headings
- Settings list
- Create-issue compact custom column menu

Built-in fields keep their hardcoded icons.

## Storybook

Ship stories for the picker: closed trigger, open grid, search, select, and clear.

## Testing

- Schema: accept a registry id, reject unknown ids, allow `null`
- Route/service: persist and clear icon; reject writes on protected columns
- Registry helper: known id → icon, unknown/`null` → tag
- Stories cover picker interaction
