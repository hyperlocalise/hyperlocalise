# ADR: Edit and delete TM segments from the content editor

## Status

Accepted

## Date

2026-10-21

## Context

Crowdin lets a linguist edit or delete a translation-memory unit from the CAT suggestion list. The dialog shows every locale of that unit. Each locale can be removed. Save writes back to the TM.

Hyperlocalise already has native entry create, update, and delete on go-svc and Hono. The content editor only applies a match to the current draft. Concordance drops the identity fields needed to mutate a row or a provider segment.

External TMs (Crowdin, Phrase, Smartling, Lokalise) are search-only. There is no `translation_memory.write` feature and no adapter method that patches or deletes a provider segment. go-svc does not call live TMS APIs.

Native storage is a source–target pair (`memory_entries`). Crowdin stores a multilingual segment with per-locale records. The editor must present one multilingual unit in both cases.

## Decision

Add Crowdin-style edit and delete on content-editor TM cards. Write native units through go-svc. Write external units through Hono provider adapters. Hide the actions when the backend cannot mutate the segment.

Anyone who can edit translations in the file can mutate TM from the editor. TM admin pages keep `memories:write` / `memories:review`. CAT routes check project translation-write, not TM-admin write. Native memories must be attached to the project.

`Use` still copies target text into the draft. It does not write TM.

### Concordance payload

Keep Hono concordance. Grow each match with:

| Field | Role |
| --- | --- |
| `canEdit` | Show the pencil |
| `canDelete` | Allow per-locale delete in the dialog |
| `segmentRef` | Opaque identity for load/save/delete |

`segmentRef` is either a native `{ memoryId, entryId }` or a provider `{ providerKind, resourceId, externalResourceId, externalSegmentId }`. The client does not assemble provider URLs.

`canEdit` / `canDelete` are false when translations are locked, the user cannot write translations, or the backend cannot mutate (Lokalise, missing segment id, reference-only TM).

### Native path (go-svc)

New project-scoped routes, not a relaxation of TM-admin entry PATCH:

| Method | Path | Effect |
| --- | --- | --- |
| `GET` | `/v1/orgs/:slug/projects/:projectId/cat/tm-segments/:entryId` | Source locale plus variant records |
| `PATCH` | `/v1/orgs/:slug/projects/:projectId/cat/tm-segments/:entryId` | One transaction: update changed texts; fan source-text edits out to every pair in the variant group |
| `DELETE` | `/v1/orgs/:slug/projects/:projectId/cat/tm-segments/:entryId/records/:recordId` | Delete one target-locale pair |

Variant grouping matches the admin sheet: same memory, same normalized source (and `variantGroupId` / context when present). Source locale is required and not deletable. Optimistic concurrency uses each row’s `expectedVersion`. Stale writes return `409`.

### External path (Hono)

Project CAT routes on the existing concordance router:

| Method | Path | Effect |
| --- | --- | --- |
| `GET` | `.../files/detail/cat/tm-segments` | Load the multilingual unit from the provider |
| `PATCH` | same | Patch changed locale texts |
| `DELETE` | `.../files/detail/cat/tm-segments/records/:recordId` | Delete one locale record |

Adapters gain `getTranslationMemorySegment`, `updateTranslationMemorySegment`, and `deleteTranslationMemorySegmentRecord`. Add `translation_memory.write` to the TMS feature matrix.

Crowdin maps to `/tms/{tmId}/segments/{segmentId}` (records are `{ id, languageId, text }`). Phrase and Smartling implement the same methods when their APIs expose a multilingual unit; otherwise `canEdit` stays false. Lokalise stays hidden: it has keys, not TM segments.

### Editor UI

Each editable TM card shows a pencil. The dialog title is **Edit TM segment**. Fields are one labeled locale each, source first, then target variants. Trash appears on every non-source locale. Footer is **Save** / **Cancel**.

There is no add-locale control in this change. Trash confirms with **Delete this locale from the TM?** Empty source blocks Save. Provider or network errors keep the dialog open. After success: close, toast, reload concordance for the current segment.

## Consequences

- Linguists can fix a bad TM hit without leaving the editor.
- Native CAT writes use a narrower auth path than TM admin. Translators cannot open the explorer and edit arbitrary libraries.
- External write-back is real. A Crowdin edit changes Crowdin TM, not a local mirror.
- Providers without segment mutation show no pencil. That is expected, not a fallback to local rows.
- Concordance must start returning identity and capability flags. Existing apply-only clients ignore the new fields.

## Out of scope

- Adding locales in the dialog
- Writing TM when the user clicks **Use**
- Relaxing TM-admin `memories:write`
- memoQ, Trados, or XTM
- go-svc calls to live TMS APIs
- Document-editor assistant TM list (Insert only) unless it shares the same card later

## Test plan

- Concordance maps `canEdit` / `canDelete` / `segmentRef` for native, Crowdin, and unsupported providers
- Native variant-group save updates every pair when source text changes
- Native delete removes one target locale and rejects source-locale delete
- Crowdin adapter get / update / delete
- go-svc CAT routes reject users without translation-write and memories not attached to the project
- Hono CAT routes hide or 404 when the provider cannot write
- Dialog: save, per-locale delete, hidden actions when locked or unauthorized
