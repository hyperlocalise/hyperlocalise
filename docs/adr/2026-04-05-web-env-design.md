# Web Env Design

## Decision

Use `@t3-oss/env-nextjs` in the web app now with a server-only schema for `DATABASE_URL`.

## Options Considered

1. `@t3-oss/env-nextjs` with a server-only schema.
Recommended because it gives typed validation now and leaves a clean path for adding client variables later.

2. A local `zod` wrapper around `process.env`.
Rejected because it would duplicate work once the app needs split server and client env validation.

## Scope

- Add `@t3-oss/env-nextjs` to the web app dependencies.
- Create `src/lib/env.ts`.
- Validate `DATABASE_URL` as a required non-empty string.

## Notes

- `DATABASE_URL` remains server-only.
- The initial schema avoids strict URL parsing to keep compatibility with PostgreSQL connection string formats.
