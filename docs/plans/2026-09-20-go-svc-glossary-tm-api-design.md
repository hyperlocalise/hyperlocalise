# go-svc glossary and translation memory API

## Goal

Add native Postgres glossary and translation-memory APIs to go-svc beside the existing Hono routes. Hono stays the live client path until a later cutover.

## Decisions

- **Relation to Hono:** Parallel `/api/go-svc/v1/...` endpoints; no Hono proxy or removal.
- **Scope:** Native libraries only (no live TMS / provider CRUD).
- **Style:** Dictionary-style handlers in `package main`, delivered in slices.
- **Schema:** Drizzle remains migration owner; go-svc reads/writes existing tables.

## Architecture

- Paths: `/v1/orgs/{organizationSlug}/glossaries[...]` and `/translation-memories[...]` (plus `/api/go-svc` prefix).
- Auth: WorkOS session cookie + live membership role (same as dictionaries/teams).
- Responses: resource-keyed JSON; `{error, message}` errors; `204` on DELETE; raw bytes for exports later.
- Unimplemented interchange paths: `501` + `not_implemented`.

## Delivery slices

1. Libraries + project attach/detach
2. Concepts/terms and memory entries (pagination/search basics)
3. Import/export, import reports/attempts, glossary history

## Non-goals (this phase)

- Removing Hono handlers or switching browser clients
- Live provider / virtual TM paths
- Activity-log enqueue and product analytics parity
