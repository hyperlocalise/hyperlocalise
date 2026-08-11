# CAT Univer office support

## Problem

CAT File view reserves an `office` family for `.docx`, `.xlsx`, `.xls`,
and `.pptx`, but no viewer is registered. Users need to open those files in
CAT, compare source and target, edit in place, and save a localized whole-file
variant—the same flow images already have.

## Decision

**Approach B — Univer File-view adapters + whole-file binary variants.**

Use open-source Univer presets (`@univerjs/presets` + docs/sheets/slides core
presets) inside the existing CAT File view shell. Persist per-locale targets
with the same binary-variant pattern as images. Prefer client-side import and
export over Univer Pro exchange servers.

Rejected alternatives:

| Approach | Why not |
|----------|---------|
| A — Univer Pro exchange + Universer server | Needs Pro license and a conversion backend; heavy ops for v1 |
| C — Segment extraction into TipTap | Loses layout; conflicts with File-view whole-file model |

## Architecture

### Formats and viewers

| Extension | Family | `viewerId` | Univer surface |
|-----------|--------|------------|----------------|
| `.docx` | office | `docx` | Docs core preset |
| `.xlsx`, `.xls` | office | `xlsx` | Sheets core preset |
| `.pptx` | office | `pptx` | Slides core preset |

Office files use File view only (no Comfortable / Side by side).

### Content kind

Add `office_file` beside `image_file` / `image_url`. Native CAT returns one
synthetic segment per office source path, with `sourceAssetUrl` /
`targetAssetUrl` from stored bytes and the locale variant row.

### Persistence

Reuse `project_image_variants` as the locale binary-variant store. The table
is already path + locale + `stored_file_id` and does not enforce image MIME.
Upload and approve routes accept office MIME when `sourcePath` is an office
format. Regenerate stays image-only.

### Upload / ingest

Add `docx`, `xlsx`, `xls`, `pptx` to supported translation source formats.
Skip string-key extraction (same as images). Ensure locale variant rows exist
on ingest.

### File view UI

- Register three pane adapters next to the image adapter.
- Target pane: editable Univer instance + upload replace + Save (export +
  upload).
- Source pane: read-only Univer instance.
- Lazy-load Univer with `next/dynamic` / client-only import (large CSS/JS).

### Import / export (client)

| Format | Import | Export / save |
|--------|--------|---------------|
| xlsx/xls | Community Excel→Univer converter | Export workbook → upload `.xlsx` |
| docx | Best-effort OOXML / text bridge into `IDocumentData` | Export document snapshot → upload `.docx` when possible; else store snapshot JSON with Office MIME metadata |
| pptx | Best-effort slide text bridge into slides data | Same save policy as docs |

Fidelity is best-effort without Univer Pro. Users can always upload a
replacement Office file.

## Data flow

1. Open CAT on an office path → capabilities → `viewerId` + File view.
2. Queue returns synthetic `office_file` segment with asset URLs.
3. Pane fetches asset bytes → converts → mounts Univer.
4. Edit target → Save exports bytes → existing upload route → refresh.
5. Approve uses existing image/file variant status patch.

## Errors

- Missing source bytes → empty source pane.
- Import failure → empty editable Univer unit + clear error; upload still works.
- Approved lock → upload/save requires force (same as images).
- Unsupported MIME on upload → validation error; keep prior target.

## Testing

- Capability map returns office viewer ids.
- Format helpers accept office extensions and skip text parse.
- Native CAT returns `office_file` synthetic segments.
- Upload route accepts office MIME for office paths.
- Viewer pane mounts with mocked Univer (unit) / smoke for convert helpers.

## Out of scope

- Univer Pro / Universer conversion service
- AI regenerate for office files
- Hybrid string extraction inside File view
- Renaming `project_image_variants` to a generic table name
