# Migrations

The repository now uses Rain ORM for schema definitions and runtime access.

## Current State

- the translation store schema is defined in `internal/translation/store`
- the CLI cache schema is defined in `apps/cli/internal/i18n/cache`
- the CLI cache still applies its SQLite schema at runtime during startup

## Migration Workflow

Checked-in SQL migrations remain the source of truth for operational schema changes.
When the Rain table definitions change, update the corresponding SQL migrations and
verify them against the affected runtime path or package tests.

## Verification

Use focused Go tests while changing schema-related code:

```bash
go test ./internal/translation/store ./internal/translation/app ./api/services/translation

go test ./apps/cli/internal/i18n/cache
```
