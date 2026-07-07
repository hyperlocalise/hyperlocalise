# Issue Sheet CSV Import — Design

**Status:** Approved  
**Date:** 2026-07-07

## Summary

Project-scoped CSV import for Issue Sheet with per-column mapping, smart header defaults, dry-run preview, and skip-on-duplicate via `external_ref`.

## Decisions

| Topic | Choice |
|-------|--------|
| Source | Generic CSV (UTF-8) |
| Unmapped columns | Per-column mapping with smart defaults |
| Duplicates | Skip when `external_ref` already exists in project |
| Architecture | Client parse for mapping UI; server dry-run + execute |
| Scope | Project Issue Sheet only |

## Flow

1. Upload CSV on Issue Sheet page
2. Map columns (system field, existing custom, create new, skip)
3. Preview via `dryRun: true`
4. Import via `dryRun: false`

## API

`POST /api/orgs/:slug/projects/:projectId/issue-sheet/import`

Body: `{ content, dryRun, mapping, options? }`  
Response: `{ import: { dryRun, totalRows, created, skippedDuplicates, skippedInvalid, warnings, errors, columnsCreated? } }`

## Limits

- 2 MB file size
- 2,000 rows
- 20 new custom columns per import
- Title mapping required

## Out of scope (v1)

- Excel (`.xlsx`)
- Update existing issues on re-import
- Segment/key auto-linking
- Org-wide import
- CLI import
