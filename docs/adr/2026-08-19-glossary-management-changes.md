# Glossary management changes

## Date

2026-08-19

## Summary

The glossary web experience now treats a glossary as a collection of concepts,
matching Crowdin's glossary model, rather than a source-target pair. Each
concept groups its locale-specific terms and carries the shared metadata that
explains the concept. Glossary detail is a dedicated page, and concept editing
uses dedicated routes so the grouped term workspace has room to grow.

## API and data boundary

- Native glossary create and update payloads no longer accept `targetLocale`.
- Native glossary creation keeps an explicit `sourceLocale`; `projectIds` is
  optional and supports multiple project attachments. A glossary may be
  created without a project attachment and can be attached later from glossary
  detail.
- Native glossary API records no longer expose `targetLocale`.
- The database `target_locale` column becomes nullable and remains stored for
  provider compatibility; native multilingual glossaries leave it null.
- Concept resources are nested under a glossary. The native API exposes
  concept and term operations at `/glossaries/:glossaryId/concepts` and
  `/glossaries/:glossaryId/concepts/:conceptId/terms`.
- The web app exposes glossary detail at `/glossaries/:glossaryId`, existing
  concept detail at `/glossaries/:glossaryId/concepts/:conceptId`, and concept
  creation at `/glossaries/:glossaryId/concepts/new`.
- The existing flat term endpoints are not used for native concept data.
- Concept management is native-only. Provider-backed glossaries remain
  read-only and provider-owned.

## Glossary list

- The glossary list shows a **Languages** column instead of a fixed
  source-target locale pair.
- For native glossaries, languages are derived as the distinct union of the
  required `sourceLocale` and the `locale` values on concept-linked terms.
- The source locale is always included, even when the glossary has no terms;
  it appears first and carries the source-language treatment.
- Additional locales are deduplicated and displayed by localized language name
  with their locale code available as supporting detail.
- Provider-backed rows continue to use provider-reported locale coverage and
  do not enter the native concept model.
- The glossary list API computes native languages server-side and returns them
  as `{ locale, name, isSource }[]`; this is a read-model field, not a
  persisted column or a per-row client fetch.

## Database schema

- `glossaries` remains the top-level reusable terminology library. It keeps
  ownership, source locale, provider metadata, locale coverage, sync state,
  and lifecycle timestamps.
- Add `glossary_concepts` as the language-neutral parent for native terms:
  `id`, `glossary_id`, `primary_term`, `subject`, `definition`,
  `translatable`, `note`, `url`, `created_at`, and `updated_at`.
- `glossary_concepts.glossary_id` references `glossaries.id` with cascade
  deletion. Index concepts by glossary and creation order.
- Add `concept_id`, `locale`, and canonical `term` fields to the existing
  `glossary_terms` table. Keep `source_term`, `target_term`, and all existing
  term metadata fields; adding fields avoids a rename migration and keeps the
  change localized to the current table.
- Add first-class `gender`, `term_type`, and `status` fields for native
  concept terms. Use `preferred`, `draft`, and `not_recommended` for the
  concept editor status; retain `review_status` for existing provider/runtime
  semantics rather than renaming it.
- For concept-linked native terms, `locale` + `term` are authoritative for
  matching and full-text search. Include canonical `term` in the generated
  search vector; do not query the retained source-target columns for this
  path.
- `glossary_terms.concept_id` references `glossary_concepts.id` with cascade
  deletion. Add indexes for concept and locale. The retained `source_term` is
  not unique at the glossary level; canonical native `term` values remain
  unique within a concept and locale.
- A concept's `primary_term` mirrors the source-locale primary term row. A
  concept is created transactionally with that source-locale term, and edits
  to either value keep the pair synchronized.
- Existing `source_term`, `target_term`, and glossary-level `target_locale`
  columns remain in place as stored data and are not renamed or dropped. Rows
  without `concept_id` are outside the concept UI and do not receive a
  dedicated compatibility path. Native concept writes use `locale` and
  canonical `term`; they do not rewrite the retained `source_term` column.
  Newly inserted native rows use a collision-safe compatibility value there
  while older installations still carry the historical unique index.
- `project_glossaries` remains the project attachment table and continues to
  control which glossary libraries are available to runtime translation
  context. Native glossary creation inserts all requested attachments with the
  default priority in the same transaction as the glossary record.

## Schema rollout

Use a minimal additive schema change. Schema changes are made in Drizzle and
generated with `vp run db:generate`; no hand-written SQL migration is required.

1. Add `glossary_concepts` plus `concept_id`, `locale`, and `term` to
   `glossary_terms`, and make `glossaries.target_locale` nullable.
2. Keep the existing table name and columns unchanged; make the new fields
   additive and nullable at the database boundary so existing unlinked rows
   remain stored without a conversion step.
3. Enable one concept-based UI and runtime path for concept-linked native
   data. Existing unlinked rows are out of scope; do not add separate screens,
   branches, or fallback reads for them.
4. Add first-class term metadata columns and the concept/locale indexes
   required by the canonical term fields.

## Glossary creation

- The native **Add glossary** flow includes an optional project selector.
- Every selected project must be accessible to the current user and its source
  locale must match the glossary source locale.
- The create payload may contain `projectIds` (and accepts the legacy singular
  `projectId` for compatibility); `targetLocale` is not part of the payload.
- Creation without an attachment is valid. When projects are selected, the
  glossary row and all `project_glossaries` attachments are written in one
  transaction; if either write fails, neither the glossary nor its attachments
  are created.
- Projects can be attached or removed from the glossary detail page after
  creation, including when the glossary was created unattached.
- Provider-backed glossaries continue to be created by their provider sync
  flow rather than the native project-scoped creation form.

## Native import

- Native CSV and TBX imports use the concept-aware model rather than the old
  source-target payload.
- CSV rows include a concept grouping key, locale, and term. Concept metadata
  may be supplied on the first row for a concept and is shared by its terms.
- Each TBX `termEntry` maps to one concept; its language-tagged terms become
  locale-specific term rows and its descriptive fields map to concept
  metadata.
- Imports create or update concepts and terms through the same nested native
  concept resources used by the editor.

## Glossary detail

- The glossary detail page lists concepts, not a flat list of terms.
- Concepts are displayed in a selectable table with a header checkbox and a
  checkbox for each concept row.
- The table columns are **[source locale] Terms**, **Definition**, **Subject**,
  **Created**, and **Last modified**. For an English source locale, the first
  column is labeled **English Terms**.
- The source-term column is sortable and shows the current sort direction in
  the column header.
- Each concept row shows its primary term followed by compact metadata badges
  such as part of speech, status, term type, and gender.
- Definitions are truncated in the table to preserve row density; the full
  definition is available in the concept editor.
- Created and last-modified timestamps use the viewer's localized date and
  time format.
- Selecting a concept navigates to the dedicated concept page described below.
  On narrow screens, the table preserves its columns inside a horizontal scroll
  region rather than hiding concept data.

## Concept and term interface

- The hierarchy is glossary, concept, locale group, then term.
- A concept is an editable, language-neutral group with these fields:
  primary term, subject, definition, translatable, note, and optional URL.
- Creating a concept requires a primary term and automatically creates the
  corresponding term in the glossary source locale.
- Terms are grouped by locale inside each concept, including the automatically
  created primary term.
- Editing an existing concept opens a dedicated page with a back link and a
  two-pane layout:
  - The left pane contains the primary term, subject, definition, and
    translatable toggle. Note and URL appear in an expandable **Concept
    details** section.
  - The right pane contains the locale term groups and their editing controls.
- The page footer spans the full editor width and has a destructive **Delete
  concept** action plus **Cancel** and **Save** actions.
- The locale term list has its own bounded vertical scroll region so the page
  header, concept fields, and save footer remain available while browsing long
  term lists.
- Each locale group displays its language name, locale code, and source badge
  when applicable.
- Term rows use columns for term, part of speech, gender, type, and status.
- Part of speech, gender, type, and status can be changed inline.
- Term deletion is available from the editor and requires confirmation.

## Adding terms and languages

- **Add concept** navigates to the concept form for the primary term, subject,
  definition, translatable flag, and note. Saving the form creates the concept
  and its primary source-locale term together.
- The concept-level **Add term** control is a button, not a locale switcher.
  Clicking it opens a simple locale-selection dialog, then creates an inline
  draft row for the selected locale.
- The draft row includes the term input and metadata selectors. The concept
  **Save** action persists the concept fields, changed existing terms, and a
  new term together.
- Existing and new terms are submitted in the concept PATCH payload and are
  upserted in the same transaction as the concept update.
- The locale picker includes the common supported locales, the glossary source
  locale, locale coverage, and existing custom term locales.

## Concept editor term workspace

- The term pane provides a **Filter languages...** field and an **Add term**
  button above the locale groups. The button opens the locale-selection dialog.
- Each locale group has a compact language header followed by a table with
  term, part of speech, gender, type, and status columns.
- The source locale header includes a **SOURCE** badge. Non-source locale
  headers do not.
- A new term appears as an inline draft row with a readiness indicator and
  empty metadata controls. There is no row-level save action.
- The green readiness dot appears only when that term row is dirty; clean rows
  render no dot.
- Gender, type, status, and other enum-backed metadata use readable labels in
  controls and read-only views.
- Deleting a term or concept requires confirmation before the destructive
  action is performed.

## Color treatment

The interface uses the existing issue-sheet semantic palette:

- Success green identifies source-language groups and dirty term rows.
- Warning amber identifies non-source language groups and the **Add term**
  language picker.
- Status text uses success, warning, and destructive colors for preferred,
  draft, and not-recommended terms.

## Verification

- `vp check --fix` completed with zero errors; four existing warnings remain in
  unrelated Storybook and email-story files.
- The focused glossary/auth test run passed: 7 tests across 2 files.
- Storybook covers the glossary list, project multi-select, concept list,
  concept detail, and both concept loading skeletons.
- The additive Drizzle migration was generated but not applied locally; the
  database was intentionally left untouched.
