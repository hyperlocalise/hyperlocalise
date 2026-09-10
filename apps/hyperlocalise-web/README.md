# Hyperlocalise Web

Next.js application for Hyperlocalise Cloud. It lives in `apps/hyperlocalise-web` and uses the Vite+ toolchain (`vp`).

Use `vp` for installs, development, checks, and tests. Do not run `npm`, `pnpm`, `yarn`, `npx`, or direct Vitest/Oxlint commands in this app.

For API conventions, Hono route layout, Drizzle migrations, and agent-specific notes, see [`AGENTS.md`](./AGENTS.md).

## Prerequisites

- Docker (PostgreSQL for local development)
- [`vp`](https://vite.plus) — install with `curl -fsSL https://vite.plus | bash`, then run `vp env setup`
- Repository bootstrap from the monorepo root: `make bootstrap`

Start Postgres from the repository root:

```bash
sudo dockerd &>/tmp/dockerd.log &
sudo chmod 666 /var/run/docker.sock
docker compose up -d
```

## Setup

From `apps/hyperlocalise-web`:

```bash
vp install
```

Create `.env` with at least:

```bash
DATABASE_URL=postgresql://hyperlocalise:hyperlocalise@localhost:5432/hyperlocalise
PROVIDER_CREDENTIALS_MASTER_KEY=MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=
WORKOS_API_KEY=sk_test_placeholder
WORKOS_CLIENT_ID=client_placeholder
WORKOS_REDIRECT_URI=http://localhost:3000/auth/callback
NEXT_PUBLIC_WORKOS_REDIRECT_URI=http://localhost:3000/auth/callback
WORKOS_COOKIE_PASSWORD=this-is-a-test-cookie-password-at-least-32-characters
AUTUMN_API_KEY=am_sk_test_placeholder
```

Apply migrations after Postgres is running:

```bash
vp run db:migrate
```

## Development

Start the Next.js dev server with the app script (not the built-in `vp dev`, which starts Vite directly):

```bash
vp run dev
```

The app listens on `http://localhost:3000` by default. Pass a port through the script if needed.

### Domains research locally

Keyword research and rank tracking proxy to [`go-svc`](../go-svc/README.md). For live DataForSEO calls:

1. Run `go-svc` with `DATAFORSEO_API_KEY` and matching `WORKOS_*` values.
2. Set `GO_SVC_URL=http://127.0.0.1:8080` in `.env`.
3. Enable the `workspace-domains` WorkOS feature flag for your test org.

Without `go-svc`, Domains UI still loads but research mutations return provider errors.

### Browser E2E (WorkOS emulator)

Browser tests under `src/e2e/` are separate from `vp test`. See the **Browser E2E** section in [`AGENTS.md`](./AGENTS.md) and [`.env.e2e.example`](./.env.e2e.example).

## Validation

Before opening a PR that touches this app:

```bash
vp check --fix
vp test
```

`vp check --fix` formats, lints, and type-checks. `vp test` runs the Vitest suite through Vite+.

## Useful paths

| Path | Purpose |
| --- | --- |
| `src/app/` | Next.js App Router pages |
| `src/api/` | Hono API mounted through the Next.js catch-all |
| `src/lib/database/` | Drizzle schema and helpers |
| `src/lib/domains/` | Domains research store and go-svc client |
| `drizzle/` | Generated migrations (do not edit by hand) |
| `vite.config.ts` | Vite+ config for lint, format, tests, aliases |

## Database migrations

Edit `src/lib/database/schema.ts`, then generate and apply:

```bash
vp run db:generate
vp run db:migrate
```

Commit the new `drizzle/<NNNN>_*.sql` and matching snapshot with the schema change. See **Drizzle Migrations** in [`AGENTS.md`](./AGENTS.md) for collision handling after rebases.

## Common pitfalls

- **`vp dev` vs `vp run dev`** — `vp dev` starts Vite, not Next.js. Use `vp run dev` for the Cloud app.
- **Placeholder WorkOS keys in `.env`** — keep emulator credentials in `.env.e2e` only. Putting `sk_test_default` in `.env` makes unit tests treat the emulator as live WorkOS.
- **`withWorkflow` dev crashes** — `next.config.ts` may fail `vp run dev` or `vp run build` with a workflow bundler error around `node:crypto`. Tests and `vp check` still run; CI builds behave differently.
- **Fixtures in production bundles** — never import `*.fixture.ts`, `*-msw-handlers.ts`, or `*.stories.*` from route or page code. Vercel type-check excludes them via `tsconfig.build.json`.
- **Message modules** — every `*.messages.ts` file needs `"use client"` at the top. Server Components must not import message modules.
