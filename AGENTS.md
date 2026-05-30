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
 AUTUMN_API_KEY=am_sk_test_placeholder
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

### TypeScript Error Handling with Result

For predictable error handling in the web app, prefer the Go-like `Result<T, E>` pattern for expected failures in shared business logic and provider integrations.

```typescript
import { err, isErr, ok, type Result } from "@/lib/primitives/result/results";

type ProviderCredentialError =
    | { code: "unsupported_provider_model" }
    | { code: "provider_validation_failed"; message: string };

async function validateCredential(input: CredentialInput): Promise<Result<void, ProviderCredentialError>> {
    if (!isSupportedModel(input.provider, input.model)) {
        return err({ code: "unsupported_provider_model" });
    }

    const response = await validateWithProvider(input);
    if (!response.ok) {
        return err({ code: "provider_validation_failed", message: response.message });
    }

    return ok(undefined);
}

const result = await validateCredential(input);
if (isErr(result)) {
    return mapCredentialErrorToResponse(result.error);
}
```

Use `Result` when the failure is expected and part of normal control flow:

- Provider credential validation, provider API calls, billing/usage tracking, URL/SSRF validation, encryption/decryption checks, and other integration boundaries.
- Domain rules that callers should branch on, such as unsupported models, missing provider credentials, rate limits, invalid external IDs, or unsafe URLs.
- Shared library functions with multiple callers. Let routes, server actions, workers, or UI handlers decide how to present the error.
- Parsing helpers. Use `safeJsonParse`, Zod `safeParse`, or `fromThrowable` wrappers instead of open-coded `try`/`catch` for recoverable parsing failures.

Model errors as small discriminated unions with stable `code` values. Avoid string-matching `error.message` for known errors.

Keep `throw`/`try`/`catch` where exceptions are the right contract:

- Framework boundaries and control flow, such as Next.js `redirect()` and Hono/Next request handlers that catch unknown errors.
- Drizzle transaction rollback paths, unless the transaction is explicitly aborted another way.
- Best-effort cleanup and logging, where the original failure must still propagate.
- Truly unexpected programmer errors or invariant violations.
- Third-party APIs that throw before they reach a local adapter. Wrap them once at the adapter boundary and return `Result` from our code.

At HTTP and server-action boundaries, convert `Result` errors into the existing response conventions. For Hono JSON routes, return the standard `{ error, message, details }` envelope from `apps/hyperlocalise-web/src/api/response.schema.ts`. For server actions, return action state with field or form errors. Re-throw unknown failures so global error handling still catches bugs.

## Code Style & Conventions

Use 4 spaces indentation

### Naming Conventions

- **Classes**: PascalCase
- **Variables/Functions/Methods**: camelCase
- **Files/Directories**: kebab-case
- **Environment Variables**: UPPERCASE
- **Constants**: UPPERCASE (avoid magic numbers)
