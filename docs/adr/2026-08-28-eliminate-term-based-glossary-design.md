# ADR: Eliminate term-based glossary

- Status: Accepted
- Date: 2026-08-28
- Supersedes: the “keep flat term endpoints” and “unlinked rows stay stored without a conversion step” parts of [2026-08-19-glossary-management-changes.md](./2026-08-19-glossary-management-changes.md)

## Context

Native glossary already uses Crowdin-style concepts: a language-neutral concept groups locale-specific terms. The UI, concept API, and native concordance follow that model.

A leftover term-based model still exists. A glossary term row with `concept_id` null is one source→target pair (`source_term` / `target_term`), keyed to a glossary-level `target_locale`. Flat REST lives at `/glossaries/:glossaryId/terms`. Several translation, QA, MCP, and agent loaders still read those columns as a pair.

Native concept writes copy the same locale text into both `source_term` and `target_term`. Native glossaries leave `target_locale` null. Loaders that treat one row as a pair, or that filter on `glossaries.target_locale`, miss native terminology.

[2026-08-19](./2026-08-19-glossary-management-changes.md) left unlinked rows out of the concept UI and kept the old columns. This ADR records how we finish the cutover.

## Decision

Stop using the term-based model in application code. Native glossary is concept-based only.

1. **Leftover data.** Do not convert or delete `glossary_terms` rows where `concept_id` is null. Ignore them. Every native read and count must require `concept_id IS NOT NULL`.
2. **This pass is code only.** Keep `source_term`, `target_term`, and nullable `glossaries.target_locale`. Do not drop columns or rebuild `search_vector` in this change. A later schema pass may make `concept_id`, `locale`, and `term` required and drop the pair columns.
3. **One native pair loader.** Runtime source→target pairs come from joining two concept-linked terms by `concept_id` and locale (`listNativeGlossaryTermPairs`). QA, file translation, agent file translate, MCP, and asset search use that helper. They must not SELECT `source_term`/`target_term` as a pair on one row, and they must not filter native glossaries by `target_locale`.
4. **Remove the flat write surface.** Delete `GET/POST/PATCH/DELETE /glossaries/:glossaryId/terms` and `POST .../terms/import`. Delete product methods `listTerms`, `createGlossaryTerm(s)`, `updateGlossaryTerm`, and `deleteGlossaryTerm`, including the Crowdin flat-term shim. Concept CRUD at `/concepts` and nested `/concepts/:conceptId/terms` stays.
5. **Keep flattened match DTOs.** CAT, QA, and AI may still use `{ sourceTerm, targetTerm }`. That shape is a pair of two locale terms, not the old storage model.
6. **Leave external TMS alone.** Crowdin, Lokalise, Phrase, and Smartling “terms” APIs, and the Go CLI glossary downloads, are provider contracts. They are not Hyperlocalise’s flat table.
7. **Comment leftover columns as deprecated.** In the Drizzle schema, mark `glossaries.target_locale`, `glossary_terms.source_term`, and `glossary_terms.target_term` as deprecated term-based fields. Describe `concept_id` null as leftover ignored rows, not as a current provider-compatible path. Keep the comments in the TypeScript schema; do not add a SQL comment migration. Do not deprecate CAT/QA pair DTOs.

## Alternatives considered

### Convert leftover rows into concepts

Wrap each unlinked row in a concept plus source-locale and target-locale terms. That preserves old data in the concept UI. Rejected: leftover rows will be ignored; no backfill.

### Delete leftover rows

Drop unlinked rows in a data migration. Unnecessary if queries already ignore them, and it is irreversible if any row still mattered.

### Drop `source_term` / `target_term` in the same change

Makes `term` the only stored surface form and rebuilds full-text search. Deferred: the columns are still `NOT NULL` and `search_vector` is generated from them. Code can stop using the pair model without a schema migration.

## Consequences

Native translation, QA, and search start seeing concept-backed terms that the old `target_locale` filters skipped. Unlinked rows vanish from every native path, including counts. Flat `/terms` clients break; the web app does not call those routes. Provider glossary products keep concept operations only. Schema cleanup remains a follow-up.

## Validation

When this decision is implemented: `vp test` and `vp check --fix` in `apps/hyperlocalise-web`. Confirm no remaining `isNull(conceptId)` read or write paths except comments that leftover rows are ignored. Confirm the leftover pair columns carry deprecation comments in the Drizzle schema.
