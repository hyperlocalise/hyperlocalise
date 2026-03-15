# Migrations

This directory contains database migrations managed by [Atlas](https://atlasgo.io/).

## Prerequisites

- Install Atlas: `curl -sSf https://atlasgo.sh | sh`
- Go 1.26+

## Generate Migrations

After modifying the Bun models in `apps/cli/internal/i18n/cache/models.go`, generate a new migration:

```bash
atlas migrate diff --env bun
```

## Apply Migrations

The service does not automatically apply Atlas SQL migration files at runtime; instead it creates the schema programmatically using Bun queries when the cache service starts. Atlas migrations are used for development and CI-side schema management.

## View Schema

To see the current schema without applying:

```bash
atlas schema inspect --env bun
```

## Manual Migration (Advanced)

If you need to manually apply SQL migrations:

```bash
atlas migrate apply --env bun --url "sqlite:///path/to/cache.sqlite"
```
