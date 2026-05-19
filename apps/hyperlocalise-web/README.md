# Hyperlocalise Web

This is the Hyperlocalise web application. It lives in `apps/hyperlocalise-web`
inside the monorepo and runs as a Next.js app with the Vite+ toolchain.

Use `vp` for package management, local development, checks, and tests. Do not
run `npm`, `pnpm`, `yarn`, `npx`, or direct Vitest/Oxlint commands in this app.

## Setup

From `apps/hyperlocalise-web`, install dependencies with Vite+:

```bash
vp install
```

## Development

Start the local development server:

```bash
vp dev
```

By default, the app is available at `http://localhost:3000`. If that port is in
use, pass a different one:

```bash
vp dev --port 3001
```

## Validation

Run the Vite+ checks before sending web changes for review:

```bash
vp check --fix
vp test
```

`vp check --fix` formats, lints, and type-checks the app. `vp test` runs the
JavaScript test suite through the Vite+ bundled test runner.

## Useful Paths

- `src/app/`: Next.js app routes and pages
- `src/api/`: Hono API routes mounted through the Next.js API adapter
- `src/lib/database/`: Drizzle schema and database helpers
- `drizzle/`: generated migrations and metadata
- `vite.config.ts`: Vite+ configuration for formatting, linting, tests, and
  path aliases

For database schema changes, edit `src/lib/database/schema.ts`, then run
`vp run db:generate` and commit the generated migration files together with the
schema update.
