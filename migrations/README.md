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

Migrations are automatically applied when the cache service starts. The service uses Bun's migration system.

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
