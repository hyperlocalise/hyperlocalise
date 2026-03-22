# Migrations

This directory contains database migrations managed by [Atlas](https://atlasgo.io/).

## Prerequisites

- Install Atlas: `curl -sSf https://atlasgo.sh | sh`
- Go 1.26+

## Generate Migrations

CLI translation cache schema:

```bash
atlas migrate diff --env bun
```

Cloud translation service schema:

```bash
atlas migrate diff --env translation --config file://atlas-cloud-translation.hcl
```

## Apply Migrations

Services do not automatically apply Atlas SQL migration files at runtime. Atlas migrations are used for development and CI-side schema management.

## View Schema

To see the current schema without applying:

```bash
atlas schema inspect --env bun

atlas schema inspect --env translation --config file://atlas-cloud-translation.hcl
```

## Manual Migration (Advanced)

If you need to manually apply SQL migrations:

```bash
atlas migrate apply --env bun --url "sqlite:///path/to/cache.sqlite"

atlas migrate apply --env translation --config file://atlas-cloud-translation.hcl --url "$DATABASE_URL"
```
