# Bun to Rain ORM cutover design

## Context

The repository currently uses Bun as the primary ORM in two places:

- the Postgres-backed translation store under `internal/translation/store`
- the SQLite-backed CLI cache under `apps/cli/internal/i18n/cache`

Bun is also coupled to schema and migration workflows through:

- `ariga.io/atlas-provider-bun`
- Atlas env files for schema inspection and migration diffs
- Bun-specific test setup and model metadata

The target state is to replace Bun with `github.com/hyperlocalise/rain-orm` in one cutover branch. The migration should leave the repository with a single ORM model for schema definition, queries, and transactions.

## Decision

The repository will perform a full Bun-to-Rain cutover in one branch.

The cutover includes:

- runtime query execution
- transaction orchestration
- schema definition
- migration ownership
- test database setup
- dependency and build wiring

The cutover does not keep Bun or Atlas+Bun as transitional runtime dependencies.

## Target architecture

Rain becomes the only ORM layer for the affected packages.

### Translation store

`internal/translation/store` will define Rain schema tables for:

- `translation_projects`
- `translation_jobs`
- `outbox_events`
- `translation_file_uploads`
- `translation_files`
- `translation_file_variants`
- `translation_glossary_terms`

The store package will keep plain Go row structs for scan and insert payloads. Bun metadata such as `bun.BaseModel` and `bun:"..."` tags will be removed. Rain table definitions will become the source of truth for table names, aliases, column names, constraints, and conflict targets.

Repository methods will use Rain query builders for reads and writes. Where Rain does not provide an exact Bun equivalent, the repository may execute explicit SQL through Rain while still keeping Rain as the owning database handle.

### CLI cache

`apps/cli/internal/i18n/cache` will define Rain schema tables for:

- `exact_cache_entries`
- `translation_memory_entries`

The cache package will keep startup schema bootstrap behavior, but the implementation will move from Bun DDL helpers and Bun queries to Rain-native schema definitions plus Rain-backed SQL execution.

### Database handles

Database open and close helpers will return Rain handles instead of Bun handles.

- Postgres helpers will open a `*rain.DB` over the existing pgx-backed `database/sql` connection strategy
- SQLite helpers will open a `*rain.DB` over the current sqlite driver strategy

### Transactions

Application code will use Rain transactions directly.

Existing Bun transaction call sites that currently use:

- `RunInTx(ctx, nil, func(ctx context.Context, tx bun.Tx) error { ... })`

will be rewritten to Rain's transaction API. Repository methods that currently accept `bun.IDB` will accept the Rain database or transaction type needed for read/write execution.

## Schema and migration strategy

The cutover will replace Atlas+Bun schema ownership with Rain-owned schema definitions and checked-in SQL migrations.

### Source of truth

Rain schema definitions become the canonical application schema description.

### Migration format

The repository will keep SQL migrations in versioned files committed to source control.

This first cutover should favor explicitness over automation:

- author SQL migrations that preserve current schema semantics
- use Rain migration helpers where they fit cleanly
- avoid introducing a second schema-diff system during the cutover

### Scope

The migration replacement includes:

- removing `atlas-provider-bun`
- removing Bun-oriented Atlas env files and docs
- introducing a Rain-backed migration entrypoint or helper suitable for dev, test, and local runtime use

For the SQLite cache, startup migrations remain in-process. The implementation may use a mix of Rain migration primitives and explicit SQL executed via Rain where that yields the simplest exact behavior match.

## Query rewrite rules

The migration will apply the following mechanical rewrite rules.

### Models

- remove `bun.BaseModel`
- remove `bun:"..."` struct tags
- add Rain table definitions with explicit columns
- use plain structs for row payloads and scan targets
- use `db` tags only where field names do not map cleanly by default

### Inserts

Bun:

- `db.NewInsert().Model(model).Exec(ctx)`

Rain:

- `db.Insert().Table(TableDef).Model(model).Exec(ctx)`

### Selects

Bun:

- `db.NewSelect().Model(&row)...Scan(ctx)`

Rain:

- `db.Select().Table(TableDef)...Scan(ctx, &row)`

### Updates

Bun:

- `db.NewUpdate().Model(...).Set(...).Where(...).Exec(ctx)`

Rain:

- `db.Update().Table(TableDef).Set(...).Where(...).Exec(ctx)`

### Deletes

Bun:

- `db.NewDelete().Model(...).Where(...).Exec(ctx)`

Rain:

- `db.Delete().Table(TableDef).Where(...).Exec(ctx)`

### Upserts

Bun currently uses raw `ON CONFLICT` strings in several places.

The preferred Rain rewrite is:

- `OnConflict(columns...).DoUpdateSet(columns...)`

If a specific query needs SQL that Rain cannot express precisely, the repository may fall back to explicit SQL through Rain's execution methods.

### Dynamic filters and `IN` predicates

Bun helpers such as `bun.List(ids)` will be replaced by:

- Rain-native predicates when available
- explicit SQL with placeholders when that is clearer or safer

The goal is behavior parity, not strict avoidance of raw SQL in every case.

## Execution order

The branch is a single cutover branch, but the implementation should still proceed in ordered slices.

1. Add Rain schema definitions and DB helpers for translation store and cache tables.
2. Rewrite translation store repository methods onto Rain.
3. Rewrite transaction call sites in `internal/translation/app`.
4. Rewrite CLI cache schema bootstrap and query code onto Rain.
5. Replace Atlas+Bun schema tooling with Rain-owned migrations.
6. Update tests, Bazel deps, docs, and module wiring.
7. Remove remaining Bun dependencies and Bun-only files.

This keeps each slice reviewable while still landing as one coherent cutover.

## Verification plan

The cutover is complete when all of the following are true:

- all existing Go tests pass
- translation store behavior matches current semantics
- SQLite cache behavior matches current semantics
- schema constraints and conflict behavior are preserved
- no Bun imports remain in the application code
- Bun-specific dependency, build, and documentation wiring is removed

Verification should include:

- focused package tests during each migration slice
- full repository Go test execution at the end
- targeted checks for transaction boundaries, upserts, pagination, and cache schema bootstrap

## Risks

The highest-risk areas are:

- upsert rewrites that depend on exact `ON CONFLICT` behavior
- `IN (...)` and other dynamic predicate rewrites
- transaction semantics in service-layer write paths
- SQLite cache schema bootstrap parity, especially around existing constraints and legacy tables
- test fixtures that currently depend on Bun setup helpers

These risks are acceptable for a single-cutover branch, but they require explicit verification rather than assuming the query-builder rewrite is mechanical.

## Consequences

- the repository moves to one ORM model instead of maintaining Bun at runtime and Rain for new work
- schema ownership becomes coherent with the runtime ORM
- the initial migration is larger, but the post-cutover maintenance model is simpler
- some migration SQL may be handwritten in the first pass until Rain schema automation in this repo matures further
