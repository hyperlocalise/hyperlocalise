# CAT File view

## Problem

CAT treats every file as a segment queue. Image files already use asset
previews in Comfortable and Side by side, but that layout is still string-first.
Office formats (docx, xlsx) and other whole-file assets need the same treatment
later. We need a generic File view that compares source and translated files
side by side, with upload and preview, without baking image-only UI into the
workspace shell.

## Decision

Add a third CAT view mode, `file`, gated by a format→views capability map.
Ship a pluggable viewer registry. Image is the first adapter. Whole-file binary
replace only (Approach A).

## Architecture

### View modes

`CatWorkspaceViewMode = "comfortable" | "side-by-side" | "file"`.

### Capability map

Resolve allowed views from `sourcePath` and/or `contentKind`:

| Family | Formats (v1) | Available views | Default |
|--------|----------------|-----------------|---------|
| Image | `png`, `jpeg`/`jpg`, `webp`, or `contentKind: image_file` | `file`, `comfortable`, `side-by-side` | `file` |
| Text/string | json, xliff, … | `comfortable`, `side-by-side` | stored preference or `comfortable` |
| Office (later) | docx, xlsx, … | `file` (+ segment views only if extraction lands later) | `file` |

The view switcher lists only allowed modes. If the persisted mode is not
allowed for the open file, clamp to the family default.

### Viewer registry

Each adapter declares:

- viewer id (e.g. `image`)
- accepted upload MIME types
- preview renderer for source and target panes
- optional regenerate action

The File view shell owns layout and shared actions (approve, upload). Adapters
only render previews and declare capabilities.

## UI

File view shell:

- Header: filename, locales, status, approve
- Two panes: **translated (target) on the left**, **source on the right**
- Toolbar on the target pane: upload, regenerate when supported
- Compact layouts stack target above source

For image files, reuse `CatImagePreview` and existing upload / regenerate /
approve APIs. URL-backed `image_url` keys stay in segment views; File view is
for file-backed binaries.

## Data flow

1. Open CAT → resolve capabilities from path / `contentKind`.
2. Clamp view mode; auto-select `file` for image family.
3. File view reads source and target asset URLs from the synthetic image
   segment / variant APIs.
4. Upload → existing image upload route → refresh target preview.
5. Regenerate / Approve → existing image variant flows.

## Errors

- Unsupported upload MIME → surface error; keep prior target.
- Missing source bytes → empty source pane with a clear empty state.
- Disallowed view mode → silent clamp.

## Testing

- Capability map and default/clamp helpers
- View switcher filters modes
- File view layout (target left, source right)
- Image adapter upload preview wiring

## Out of scope

- docx / xlsx preview adapters (registry hooks only)
- Generalizing `project_image_variants` to generic file variants
- Hybrid string extraction inside File view
