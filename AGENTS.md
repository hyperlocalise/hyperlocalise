# Agent Instructions

## Setup

- Run `make bootstrap` before working if dependencies are not installed yet.
- For web-related work, also check [`apps/hyperlocalise-web/AGENTS.md`](apps/hyperlocalise-web/AGENTS.md).

## Commit Messages

- Use conventional commit style when possible: `<type>(<scope>): <summary>`.
- Keep the summary short, imperative, and specific.
- Common types in this repo include `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, and `init`.
- Use a scope when it adds clarity, for example `feat(schema): add enum column metadata`.

## Before Finalizing

If we change Go code:

- Run `make fmt`.
- Run `make lint`.
- Run `make test`.

In apps/hyperlocalise-web, if we change these folders:

- Run `vp test`
- Run `vp check --fix`

Do not finalize work until all commands complete successfully.

## Cursor Cloud specific instructions

### Prerequisites

Docker must be running for the web app (PostgreSQL). Start the daemon and compose stack:

```
sudo dockerd &>/tmp/dockerd.log &
sudo chmod 666 /var/run/docker.sock
docker compose up -d          # starts Postgres 18 on :5432
```

Ensure `$(go env GOPATH)/bin` is on PATH for `golangci-lint`. The Makefile `bootstrap` target installs it, but it may build with a lower Go version. If `make lint` fails with a Go version mismatch, rebuild it from the workspace module:

```
go build -o $(go env GOPATH)/bin/golangci-lint github.com/golangci/golangci-lint/v2/cmd/golangci-lint
```

### Web app (apps/hyperlocalise-web)

- Use `vp run dev` (not `vp dev`) to start the Next.js dev server — `vp dev` starts Vite directly.
- Before the dev server works, create `apps/hyperlocalise-web/.env` with at minimum:
  ```
  DATABASE_URL=postgresql://hyperlocalise:hyperlocalise@localhost:5432/hyperlocalise
  PROVIDER_CREDENTIALS_MASTER_KEY=MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=
  NEXT_PUBLIC_WAITLIST_URL=https://example.com/waitlist
  WORKOS_API_KEY=sk_test_placeholder
  WORKOS_CLIENT_ID=client_placeholder
  WORKOS_REDIRECT_URI=http://localhost:3000/auth/callback
  NEXT_PUBLIC_WORKOS_REDIRECT_URI=http://localhost:3000/auth/callback
  WORKOS_COOKIE_PASSWORD=this-is-a-test-cookie-password-at-least-32-characters
  ```
- Run `vp run db:migrate` after starting Postgres to apply Drizzle migrations.
- The `make test` target uses coverage flags that may warn about a missing `covdata` tool — all actual tests still pass. Use `go test ./...` if you want a clean exit code without coverage.

### Web app dev server caveat

The `withWorkflow` plugin in `next.config.ts` may crash `vp run dev` and `vp run build` with a `workflow-node-module-error` about `node:crypto` in `src/lib/agents/github/app.ts`. This does not affect `vp test` or `vp check`. If you only need to run tests or lint, proceed normally. CI builds pass because the workflow bundler behaves differently in that environment.

### vp (Vite+) CLI

Install `vp` via `curl -fsSL https://vite.plus | bash`, then run `vp env setup` to create Node.js shims. If `nvm` is active, ensure `$HOME/.vite-plus/bin` is before the nvm path so the vp-managed Node.js is used.

### CLI (Go)

- Standard commands per `AGENTS.md`: `make bootstrap`, `make fmt`, `make lint`, `make test`.
- Run the CLI with `go run ./apps/cli <command>`.
