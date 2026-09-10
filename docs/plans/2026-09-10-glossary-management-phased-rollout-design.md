# Glossary management phased rollout

## Goal

Split HL-641 into independently deployable pull requests so each migration is additive, reviewable, and reversible.

## Rollout

1. **PR1 — concept pagination and management list**
   Add only the concept-level fields and indexes needed by the native glossary list. Add a signed, filter-bound cursor endpoint and move the native UI to server-side pagination. Keep the existing concepts endpoint and provider-backed path unchanged.
2. **PR2 — durable history**
   Add the minimum history tables and write one glossary-level import event for each native import. Keep history writes additive and independent from list reads.
3. **PR3 — history API and UI**
   Expose history through a paginated API and add the management UI. This phase consumes PR2’s records without changing import behavior.

## Safety rules

- Use expand-only migrations. Do not drop or rename existing columns in this rollout.
- Keep each PR deployable on its own.
- Bind cursors to their filters and expire them so a page cannot silently change meaning.
- Preserve the existing endpoint while clients migrate to the page endpoint.
