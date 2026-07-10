# Image translation support

## Problem

Native projects, CLI sync, file translation jobs, and CAT only handle text. Image localization already exists in the CLI `run` path, Slack, and Contentful, but upload gates and CAT reject or ignore images. Users need to upload images, localize them with the agent, sync push/pull, and review or replace per-locale variants in CAT—including string keys whose value is an image URL.

## Decision

**Approach A — dual entry, one storage core.**

| Entry | Source of truth | Target value | Sync |
|-------|-----------------|--------------|------|
| File-backed | Image path in i18n buckets / TMS file | Localized image bytes | Binary push/pull |
| URL-backed | String key whose text is an image URL | Hyperlocalise-hosted asset URL | String sync (unchanged shape) |

Both paths store bytes in `stored_files` and reuse `regenerateImageFromAttachment` for AI localization.

## Data model

### File-backed

- Source path → `repository_source_files` + `stored_files` (`role: source`, image format).
- Per locale → `project_image_variants`:
  - `project_id`, `repository_source_file_id` (nullable for TMS-only), `source_path`, `target_locale`
  - `stored_file_id` (nullable until localized)
  - `status`: `draft` | `needs_review` | `approved` | `rejected`
  - `provenance`: `manual` | `translation_job` | `import` | `agent`
  - unique `(project_id, source_path, target_locale)`

Pure binary images do not create `project_translation_keys` rows.

### URL-backed

- Remain `project_translation_keys` / TMS string units.
- Mark with metadata `contentKind: "image_url"` (CAT **Treat as image**, or remembered after first use).
- Source text = original URL; after localization, target text = Hyperlocalise asset URL serving `stored_files`.
- Optionally cache fetched source bytes on `stored_files` with `metadata.imageLocalizationSource` and `sourceUrl`.

### Shared primitive

Fetch or load source bytes → AI image edit for locale → store output → attach file variant **or** set translation text to HL URL.

## CAT

### File-backed

- Queue lists image paths.
- Editor: source | target image preview (not TipTap).
- Actions: **Regenerate**, **Upload replace**, **Approve** / **Reject**.

### URL-backed

- Icon under source: **Treat as image**.
- When on: preview source/target images; regenerate writes HL URL into target; upload replace stores bytes and sets HL URL; approve/reject use translation status.
- When off: plain string editing.
- Image-looking URLs show the control; explicit toggle (or stored metadata) enables image mode.

### Asset URLs

- **URL-backed translation targets** use a public, unauthenticated path: `/api/public/media/:fileId` (no org/project/credentials). Only files marked `metadata.publicMedia: true` with an image content type are served. Responses use long-lived cache headers (`public, max-age=31536000, immutable` plus `ETag`) so CDNs and browsers absorb repeat traffic.
- **File-backed CAT previews** may still use the authenticated org/project asset route for private source bytes.

## Sync, upload, jobs

### Upload and ingest

- Accept `png` / `jpeg` / `webp` on public upload, chat attach, and CLI `sync push`.
- Skip text key extract for images; ensure locale variant rows exist (empty until localized).

### Agent translate

- File-backed: image translation job → regen → variant with `provenance: agent`, `status: needs_review`.
- URL-backed: fetch URL (SSRF-safe) → regen → HL URL in target translation.

### Native sync

- Push: image paths upload like other source files.
- Pull: write approved (or configured) locale binaries using existing locale path mapping.
- URL-backed keys: push/pull as strings containing HL URLs.

### External TMS

- Image files: `external_tms_files` + `stored_files`; push binary when the adapter supports it.
- URL fields: same treat-as-image flow; write back HL URL, or upload to the provider when it requires hosted assets.

## Errors

- Unsupported format, fetch failure, SSRF block, or missing image model → job `failed` with a stable error code; CAT keeps the prior target.
- Do not overwrite `approved` on regen without explicit re-open or force.

## Testing

- Unit: format gates, URL detect, HL URL minting, variant status transitions.
- Route: upload image, CAT regenerate/upload/status, asset GET.
- Workflow: image job happy path and fetch failure.
- CLI: sync push/pull round-trip for one PNG bucket.

## Out of scope for follow-ups

- Non-image binary formats (PDF, video).
- In-image OCR glossary enforcement beyond the existing regen prompt.
- Provider-specific asset hosting APIs beyond “upload file / write string URL” adapters.
