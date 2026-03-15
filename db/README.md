# Atlas Migrations

This repo uses [Atlas](https://atlasgo.io/) as the migration runner.

Current setup:

- Atlas config: [`atlas.hcl`](../atlas.hcl)
- Migration directory: [`db/migrations`](./migrations)
- Current mode: versioned SQL migrations

At the moment, the repo is configured for:

- applying migrations
- checking migration status
- linting/versioning the migration directory

It is not yet configured for automatic `atlas migrate diff` generation from Bun models or a declarative schema source. That requires adding a desired-state schema input such as `schema.hcl`, raw SQL schema files, or Bun model integration code.

## Prerequisites

Install the Atlas CLI and make sure PostgreSQL is reachable through `DATABASE_URL`.

Example:

```bash
export DATABASE_URL='postgres://postgres:postgres@localhost:5432/hyperlocalise?sslmode=disable'
atlas version
```

## Current migration files

The first migration lives at:

- [`db/migrations/202603150001_translation_jobs.sql`](./migrations/202603150001_translation_jobs.sql)

## Apply migrations

Run all pending migrations:

```bash
atlas migrate apply \
  --env translation \
  --url "$DATABASE_URL"
```

Apply only the next migration:

```bash
atlas migrate apply \
  --env translation \
  --url "$DATABASE_URL" \
  --count 1
```

## Check migration status

```bash
atlas migrate status \
  --env translation \
  --url "$DATABASE_URL"
```

## Validate migration directory

```bash
atlas migrate lint \
  --env translation \
  --latest 1
```

If you want Atlas to validate against a disposable local database:

```bash
atlas migrate lint \
  --env translation \
  --dev-url "docker://postgres/16/dev?search_path=public"
```

## Create a new migration

Right now, create migrations manually as SQL files.

1. Add a new file under [`db/migrations`](./migrations)
2. Use a monotonic timestamp prefix such as `202603150002_add_job_indexes.sql`
3. Write forward-only SQL
4. Run `atlas migrate lint`
5. Run `atlas migrate apply` against a local database

Example:

```bash
touch db/migrations/202603150002_add_job_indexes.sql
```

## Why `atlas migrate diff` is not wired yet

`atlas migrate diff` needs a desired schema source. This repo does not have one yet.

Examples of valid future sources:

- `db/schema.hcl`
- `db/schema.sql`
- Bun model metadata exported into Atlas

Without that source, Atlas cannot compute schema diffs automatically. In the current repo state, migrations are SQL-first and authored by hand.

## Future Bun integration

The intended next step is:

1. define Bun models for the translation tables
2. add a schema source Atlas can diff against
3. use `atlas migrate diff <name>` to generate migration SQL

Until that exists, the safe workflow is manual SQL migrations plus `atlas migrate lint` and `atlas migrate apply`.

## Bazel

No Bazel changes are required for the current Atlas workflow.

Reason:

- Atlas is being used as an external developer/CI tool, not as a Bazel-built binary
- the root [`BUILD.bazel`](../BUILD.bazel) does not package or execute migration files today
- the Go services do not depend on migration files at build time

You would only need Bazel changes if you want one of these:

- a Bazel target that shells out to Atlas
- migration files bundled as explicit Bazel data dependencies
- CI pipelines driven entirely through Bazel targets

For now, keeping Atlas outside Bazel is the simpler setup.
