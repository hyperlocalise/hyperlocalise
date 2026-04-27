---
project_name: 'hyperlocalise'
user_name: 'henry'
date: '2026-04-21'
sections_completed: ['technology_stack', 'language_rules', 'framework_rules', 'testing_rules', 'quality_rules', 'critical_rules']
status: 'complete'
rule_count: 52
optimized_for_llm: true
---

# Project Context for AI Agents

_This file contains critical rules and patterns that AI agents must follow when implementing code in this project. Focus on unobvious details that agents might otherwise miss._

---

## Technology Stack & Versions

### CLI (Go)
- Go 1.26
- Cobra 1.10.2 — CLI framework
- BubbleTea v2.0.6 / Bubbles v2.1.0 / Lipgloss v2.0.3 (charm.land) — TUI
- OpenTelemetry 1.43.0 — tracing
- openai-go v3.32.0 — LLM calls
- golangci-lint v2, gofumpt, gci — linting/formatting

### Web (TypeScript)
- Next.js 16.2.4 with App Router
- React 19.2.5
- TypeScript 6.0.3
- Hono 4.12.14 — API layer
- Drizzle ORM 0.45.2 + pg 8.20.0 — database
- Zod 4.3.6 — validation
- WorkOS AuthKit 3.0.0 — auth
- Tailwind CSS 4.2.2
- Vite+ (vp) 0.1.18 — unified toolchain (wraps pnpm, Vitest, Oxlint, Oxfmt)
- shadcn/ui 4.3.0 + Base UI 1.4.0 — UI components

---

## Critical Implementation Rules

### Language-Specific Rules

#### TypeScript (Web)
- Import test utilities from `vite-plus/test`, NOT from `vitest` directly — `vitest` must not be installed as a standalone dependency
- Import framework utilities from `vite-plus`, NOT from `vite` directly
- All env vars are validated via `@t3-oss/env-nextjs` in `src/lib/env.ts` — never access `process.env` directly; always import from `@/lib/env`
- Use the custom `Result<T,E>` type from `src/lib/primitives/result/results.ts` for fallible operations — use `ok()`, `err()`, `isOk()`, `isErr()`, `fromThrowableAsync()` rather than bare try/catch at the domain layer
- Path alias `@/` maps to `src/` — always use this for internal imports

#### Go (CLI)
- Formatting is enforced by `gofumpt` (stricter than `gofmt`) + `gci` for import ordering — run `make fmt` before committing; CI will reject non-conforming code
- `golangci-lint v2` runs ~50 linters including `exhaustruct` (all struct fields must be explicitly set), `gochecknoglobals` (no package-level vars), and `errname` (error types must be named `*Error`) — `make lint` must pass cleanly
- Config is read from `i18n.yml` or `i18n.jsonc` via `pkg/i18nconfig/` — never parse config ad-hoc; always go through the config package
- LLM provider calls go through `runsvc`; never call `openai-go` directly from the cmd layer

---

### Framework-Specific Rules

#### Hono (API layer)
- The root app is `src/api/app.ts` — always import/test against this; never construct a parallel ad-hoc `new Hono()` in test files
- Define route handlers inline (route-local), NOT extracted to a separate function with a loose signature — inline handlers preserve `c.req.param()` and `c.req.valid()` type inference; middleware extraction is fine
  - ✗ `const handler = (c) => c.req.param('id')` (loses type)
  - ✓ Define the handler inline where the path is declared
- Split larger APIs into route modules and mount with `app.route(...)`
- Use `createMiddleware` from `hono/factory` for custom middleware; use `createFactory().createHandlers()` if shared handler composition is unavoidable
- Auth middleware is `workosAuthMiddleware` from `@/api/auth/workos` — apply via `.use("*", workosAuthMiddleware)` on the route-local instance, typed with `new Hono<{ Variables: AuthVariables }>()`; mount before any protected routes — Hono middleware is order-sensitive
- Validators use `hono/validator` — always return a typed error response on failure, never throw
- Canonical error response shape: `c.json({ error: "snake_case_error_code" }, STATUS)` — use this exact shape everywhere (e.g., `{ error: "unauthorized" }`, `{ error: "glossary_not_found" }`, `{ error: "forbidden" }`)
- Public endpoints (health, webhooks) do NOT apply `workosAuthMiddleware` — all other routes are protected by default

#### Next.js 16 (App Router)
- This is Next.js 16 with breaking API changes — read `node_modules/next/dist/docs/` before writing any Next.js-specific code; do not rely on training data for Next.js 15+ APIs
- API routes are handled by Hono via the catch-all at `src/app/api/[[...route]]/route.ts` — do NOT add new `route.ts` files under `src/app/api/` for business logic; extend the Hono app instead
- Auth routes (`/auth/*`) are Next.js Route Handlers that delegate to WorkOS AuthKit
- Mark components `'use client'` only when they use browser APIs, event handlers, or React hooks that can't run on the server — default to server components
- `params` and `searchParams` in page components are Promises in Next.js 16 — always `await` them:
  - ✗ `const id = params.id`
  - ✓ `const { id } = await params`
- Do not use `unstable_cache`, `unstable_noStore`, or other `unstable_*` Next.js APIs without first checking `node_modules/next/dist/docs/`

#### Drizzle ORM
- Schema is the single source of truth — always define tables in `src/lib/database/schema.ts`; schema changes require a new migration (`npm run db:generate` then `npm run db:migrate`)
- Always use `$onUpdateFn(() => new Date())` on `updatedAt` columns — never set manually
- `tsvector` columns (`searchVector` on `translationGlossaryTerms` and `translationMemoryEntries`) are always-generated — Drizzle does not prevent writes at the TypeScript layer but Postgres will throw a DB error; never write to them
- Import db and schema together: `import { db, schema } from "@/lib/database"`
- `translationProjects.id` and `translationJobs.id` are caller-supplied `text` PKs — check the existing ID generation pattern in the route before writing; do not auto-generate a UUID
- Always use `.returning()` after `insert`, `update`, or `delete` — Drizzle on Postgres does not return the mutated row by default
- Multi-step mutations across tables must use `db.transaction(async (tx) => { ... })` — never leave partial writes possible
- Avoid N+1 queries — use Drizzle's `with()` for eager-loading relations in a single query rather than fetching related records in a loop

#### WorkOS / Auth
- Auth context flows through `ApiAuthContext` — contains `user.localUserId`, `organization.localOrganizationId`, and `membership.role`; after `workosAuthMiddleware`, `c.var.auth` is guaranteed non-null
- Role-based guards use `membership.role` values: `"owner"`, `"admin"`, `"member"` — mutations typically require `owner` or `admin`; return `c.json({ error: "forbidden" }, 403)` on role violations
- `resolveApiAuthContextFromSession` is the only function that should be mocked in tests
- **Multi-tenancy scoping is a security boundary** — every query on user-owned data must filter by `organizationId = auth.organization.localOrganizationId`; never query a user-scoped table without this filter; if a table genuinely has no org scope, add an inline comment explaining why

#### Provider Credential Encryption
- API keys are encrypted at rest with AES-256-GCM via `src/lib/security/provider-credential-crypto.ts`
- `PROVIDER_CREDENTIALS_MASTER_KEY` (loaded from `src/lib/env.ts`) must be 32 bytes — accepted as 64-char hex or 32-byte base64; the current key version is `1`
- Always call `encryptProviderCredential()` before writing to DB; always call `decryptProviderCredential()` after reading — never store plaintext
- If `decryptProviderCredential()` throws (unsupported algorithm or key version), let the error bubble up — log the actual error server-side with `userId`, `organizationId`, and timestamp; return a generic 500 to the client

---

### Testing Rules

#### Web (TypeScript)
- Import all test utilities from `vite-plus/test`: `import { describe, it, expect, vi, beforeAll, afterEach } from "vite-plus/test"`
- Use Hono's `testClient(app)` against the real app from `src/api/app.ts` — never build a parallel test app
- Tests that touch the DB are integration tests and hit a real Postgres instance — do not mock the database
- Auth is mocked at the `resolveApiAuthContextFromSession` layer only:
  ```ts
  vi.mock("@/api/auth/workos-session", () => ({
    resolveApiAuthContextFromSession: vi.fn(() => globalThis.__testApiAuthContext ?? null),
  }))
  ```
- Test files live alongside source files: `src/api/routes/foo/foo.test.ts`
- Fixtures live in `foo.fixture.ts` alongside the route — handle setup and cleanup
- `afterEach` must call fixture cleanup to prevent data leakage between tests
- `beforeAll` should verify DB connectivity (`await db.$client.query("select 1")`) before running route tests
- Use `vi.hoisted()` for mocks that must be hoisted above imports

#### Go (CLI)
- Run a single test: `go test ./path/to/package/... -run TestFunctionName -v`
- Test files are colocated with source: `cmd/run_test.go` alongside `cmd/run.go`
- `make test-workspace` runs all tests with coverage; must pass before committing
- Do not mock the config layer in CLI tests — use real config fixtures

---

### Code Quality & Style Rules

#### Web (TypeScript)
- Run `vp check --fix` before committing — enforces Oxlint + Oxfmt in one pass
- Never run `pnpm`, `npm`, or `npx` directly — all package and tooling operations go through `vp`
- Never install `vitest`, `oxlint`, `oxfmt`, or `tsdown` directly — these are bundled in `vite-plus`
- For one-off binaries use `vp dlx` instead of `npx`/`pnpm dlx`
- Custom scripts that share a name with a `vp` built-in must be run as `vp run <script>`, not `vp <script>`
- File naming: kebab-case for all files (`glossary.route.ts`, `glossary.test.ts`, `glossary.fixture.ts`, `glossary.schema.ts`, `glossary.shared.ts`)
- Route module files follow the pattern: `{name}.route.ts`, `{name}.schema.ts`, `{name}.shared.ts`, `{name}.fixture.ts`, `{name}.test.ts`
- Components: PascalCase filenames (`AppShell.tsx`), kebab-case directories (`app-shell/`)

#### Go (CLI)
- Run `make precommit` before every commit — runs fmt → lint → test → build in sequence
- `make fmt` runs `gofumpt` + `gci` — do not use `gofmt` directly
- `exhaustruct` linter requires all struct fields to be explicitly set — no partial initialization
- `gochecknoglobals` forbids package-level variables — use function-scoped vars or inject via parameters
- Error type names must end in `Error` (e.g., `ValidationError`) per `errname` linter
- Import ordering enforced by `gci`: stdlib → external → internal; run `make fmt` to auto-fix
- No comments unless the WHY is non-obvious — never comment what the code already says

---

### Critical Don't-Miss Rules

#### Security
- **Never** store LLM provider API keys in plaintext — always encrypt via `encryptProviderCredential()` in `src/lib/security/provider-credential-crypto.ts` before DB write
- **Never** query user-scoped tables without an `organizationId` filter — cross-org data leakage is a silent failure with no runtime error
- **Never** expose raw decryption or security errors to the client — return a generic 500; log the actual error server-side with `userId`, `organizationId`, and timestamp for triage
- `PROVIDER_CREDENTIALS_MASTER_KEY` must never appear in code, logs, or version control
- Provider credential encryption uses key versioning (`keyVersion` column) — if decrypting a credential with an unsupported key version, throw immediately; never silently fall back
- **Never** allow a user to update an org's LLM provider credentials without verifying they hold the `owner` or `admin` role

#### LLM / Translation Workflow
- **Never** concatenate raw user-supplied source strings directly into LLM system or user prompts — use structured input formats to prevent prompt injection
- **Never** process an LLM translation request without pre-checking org quota and rate limits — fail fast with a clear error, not a silently hanging job
- The Go CLI must always operate with an explicit org context (env var, flag, or config file) — never assume a default org from an ambiguous session token

#### Hono Type Safety
- Extracting a full route handler to a separate function with a loose `(c) => ...` signature silently breaks `c.req.param()` and `c.req.valid()` types — always define handlers inline where the path is declared
- Always type protected Hono instances: `new Hono<{ Variables: AuthVariables }>()`

#### Drizzle Gotchas
- `tsvector` columns (`searchVector` on `translationGlossaryTerms` and `translationMemoryEntries`) are always-generated — Drizzle will not prevent writes at the TypeScript layer but Postgres will throw
- `translationProjects.id` and `translationJobs.id` are caller-supplied `text` PKs — check the existing ID generation pattern in the route before writing; do not auto-generate a UUID
- Always use `.returning()` after `insert`, `update`, or `delete` — Drizzle on Postgres does not return the mutated row by default
- Multi-step mutations must use `db.transaction(async (tx) => { ... })` — never leave partial writes possible

#### Go CLI
- The `charm.land` module path is used for TUI packages — import `charm.land/bubbletea/v2`, `charm.land/bubbles/v2`, `charm.land/lipgloss/v2`; do not use the old `github.com/charmbracelet/*` paths for these
- `var` at package scope fails `gochecknoglobals` — inject dependencies via function parameters instead
- All struct fields must be initialized explicitly — `exhaustruct` linter will reject zero-value omissions even when semantically valid

#### Next.js 16
- Do not add new `route.ts` files under `src/app/api/` for business logic — the catch-all at `src/app/api/[[...route]]/route.ts` delegates everything to Hono; extend the Hono app instead
- `params` and `searchParams` in page components are Promises in Next.js 16 — always `await` them; never access `.id` etc. directly

#### Vite+ Footguns
- Always run `vp check --fix` before committing — this is the check that breaks CI
- `vp dev` starts Vite's dev server for the Next.js app only; if a `dev` script in `package.json` runs multiple services, invoke it as `vp run dev`
- Never invoke `vitest` directly — use `vp test`

---

## Usage Guidelines

**For AI Agents:** Read this file before implementing any code. Follow all rules exactly as documented. When in doubt, prefer the more restrictive option.

**For Humans:** Keep this file lean and focused on agent needs. Update when the technology stack or conventions change. Remove rules that become obvious over time.

_Last updated: 2026-04-21_
