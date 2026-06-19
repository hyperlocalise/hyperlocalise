<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

<!-- END:nextjs-agent-rules -->

<!-- BEGIN:hono-agent-rules -->

# Hono Best Practices

Follow the official Hono best-practices guide for this app: [Best Practices](https://hono.dev/docs/guides/best-practices).

## Route Structure

- Prefer route-local handlers instead of Rails-style controller functions. Define the handler inline where the path is declared so `c.req.param()` and other route types infer correctly.
- Split larger APIs into route modules and mount them with `app.route(...)`.
- Keep the root API app in [`src/api/app.ts`](src/api/app.ts). If a test or feature needs an app instance, import the factory or app from there instead of constructing a separate ad hoc `new Hono()` shape in the test file.
- Compose [`src/api/app.ts`](src/api/app.ts) through named router groups for the API boundary they serve: internal/MCP, auth, legacy app routes, org-scoped app routes, public `/v1` routes, and webhooks. Keep the Next.js catch-all handler in `src/app/api/[[...route]]/route.ts` as the single adapter to the Hono app.

## Route Folder Conventions

- Keep the current `<resource>.route.ts` naming. Use it for the route factory and route-local handlers.
- Put params, query, body, and response schemas in `<resource>.schema.ts`.
- Add `<resource>.fixture.ts` only for thin typed helpers used by route tests.
- Use `<resource>.test.ts` or `<resource>.route.test.ts` for route behavior tests, matching the existing folder convention nearby.
- Do not add `<resource>.controller.ts` by default. Extract a controller only when a route handler becomes large enough that route-local code is harder to read, and keep request validation and Hono response shaping in the route file.
- Keep using plain `Hono` route modules for now. Do not introduce `OpenAPIHono` or `createRoute` unless the route is becoming a stable public contract that needs generated OpenAPI metadata and the dependency/typing tradeoff is handled in the same change.

## Middleware

- Use `createMiddleware` from `hono/factory` for custom middleware.
- If shared handler composition is unavoidable, prefer `createFactory()` and `factory.createHandlers()` over controller-style indirection.
- Keep middleware focused on request concerns such as auth, validation, request context, and response shaping.

## Logging

- Do not log PII, credentials, secrets, raw request bodies, email addresses, file contents, user-supplied text, repository names, organization names, or other customer-identifying values.
- Prefer stable opaque identifiers, counts, statuses, and event names. If customer-identifying context is needed for debugging, log the internal database ID or provider ID instead of display names or free-form content.
- Do not assume every emitted log has a trace ID. Bind a safe correlation ID such as a request ID, webhook delivery ID, job ID, or provider event ID when logging work that may need cross-event debugging.

## Testing

- Use Hono's `testClient` for route tests.
- Test the real API app exported from [`src/api/app.ts`](src/api/app.ts) when possible, rather than rebuilding a parallel test-only app structure.

<!-- END:hono-agent-rules -->

# Frontend Module Imports

- **Do not add barrel files** (`index.ts` / `index.tsx`) that re-export a folder’s public API. Import the concrete module instead, for example `@/components/theme-toggle/theme-toggle` rather than `@/components/theme-toggle`.
- **Prefer direct file paths** for components, hooks, messages, and utilities so bundlers and static analysis see explicit dependencies.
- **Colocate related files in folders** when a feature has multiple modules (component, messages, tests), but export from the implementation file, not an `index.ts` shim.

# Internationalization (react-intl)

## Message modules (`*.messages.ts`)

Every `*.messages.ts` file **must** start with `"use client"` before importing `defineMessages` from `react-intl`:

```ts
"use client";

import { defineMessages } from "react-intl";

export const exampleMessages = defineMessages({
  title: {
    defaultMessage: "Example",
    id: "abc123",
    description: "Example title",
  },
});
```

`defineMessages()` is a **client-only** API. If a messages file omits `"use client"`, any Server Component or route module that transitively imports it fails at build time:

```
Error: Failed to collect configuration for /[lang]/blog
  [cause]: Error: Attempted to call defineMessages() from the server but defineMessages is on the client.
```

## Server Components and translated strings

**Do not import `*.messages.ts` from Server Components.** Message modules are client modules; pick one of these patterns instead:

1. **Inline descriptors** — pass `{ id, defaultMessage, description }` objects to `getIntlShape(locale).formatMessage()`. See [`src/app/[lang]/(marketing)/blog/blog-route-metadata.ts`](<src/app/[lang]/(marketing)/blog/blog-route-metadata.ts>).
2. **Client Components** — add `"use client"` to the component, import the messages module, and use `<FormattedMessage>` or `useIntl()`.

A component that calls `getIntlShape()` without `"use client"` is a Server Component. It must use inline descriptors, not imports from `*.messages.ts`.

# API Response Conventions

New JSON routes must follow the conventions below. Shared schemas and helpers live in [`src/api/response.schema.ts`](src/api/response.schema.ts).

## Success envelopes (JSON routes)

Return a **resource-keyed envelope**. The top-level key is the singular or plural name of the resource:

```ts
// Single resource
c.json({ project: projectRecord }, 200);

// Collection
c.json({ projects: projectRecords }, 200);

// Public API shape with selected fields
c.json({ job: { id: job.id, status: job.status } }, 201);
```

Do **not** use a generic `{ data }` envelope for new routes. The `/api/v1/*` public API already exposes resource-keyed shapes; a future move to `{ data, status }` would require a new API version.

Use the helper `successEnvelopeSchema("resourceKey", resourceSchema)` from `response.schema.ts` when you need a Zod schema for a success body.

## Error envelopes (JSON routes)

Every JSON error response must match this shape:

```ts
{
  error:   "machine_readable_code",  // required, snake_case, stable contract
  message?: "Human-readable text",    // optional but recommended for new routes
  details?: { ... }                   // optional structured context
}
```

Clients should branch on `error`. `message` is for debugging and may change without notice.

Import helpers from `response.schema.ts` instead of defining ad-hoc error functions:

```ts
import { notFoundResponse, badRequestResponse } from "@/api/response.schema";

// in a handler:
return notFoundResponse(c, "project_not_found");
return badRequestResponse(c, "invalid_project_payload", "Name is required");
```

## Exceptions (non-JSON or non-envelope responses)

These response types are intentionally outside the standard envelope:

1. **File downloads** – return the raw body with `Content-Disposition` and the correct `Content-Type`. No JSON envelope.
2. **204 No Content** – return `c.body(null, 204)` for successful DELETE operations. No body at all.
3. **Health checks** – may return a minimal shape such as `{ ok: boolean }` because they are consumed by load-balancer probes.
4. **Webhook acknowledgements** – return whatever the external provider expects (often a bare 200/204 or `{ ok: true }`). These are not part of the public REST contract.
5. **Server-Sent Events / streaming** – body is an event stream, not JSON.

## TypeScript Error Handling with Result

For predictable error handling, prefer the Go-like `Result<T, E>` pattern for expected failures in shared business logic and provider integrations.

```typescript
import { err, isErr, ok, type Result } from "@/lib/primitives/result/results";

type ProviderCredentialError =
  | { code: "unsupported_provider_model" }
  | { code: "provider_validation_failed"; message: string };

async function validateCredential(
  input: CredentialInput,
): Promise<Result<void, ProviderCredentialError>> {
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

At HTTP and server-action boundaries, convert `Result` errors into the existing response conventions. For Hono JSON routes, return the standard `{ error, message, details }` envelope from [`src/api/response.schema.ts`](src/api/response.schema.ts). For server actions, return action state with field or form errors. Re-throw unknown failures so global error handling still catches bugs.

## TypeScript Robustness Patterns

Use these Go-inspired patterns when they make the code safer without adding heavy abstractions:

- **Branded IDs**: do not pass important domain IDs as interchangeable strings across shared business logic. Define branded aliases such as `ProjectId`, `OrganizationId`, `JobId`, or `ProviderCredentialId` at module boundaries where mix-ups are likely. Parse and validate raw strings at HTTP/provider boundaries, then pass the branded type internally.
- **AbortSignal convention**: long-running work, provider API calls, file operations, agent tools, and sync workflows should accept an optional `AbortSignal` and pass it to nested operations that can be cancelled. Prefer `{ signal?: AbortSignal }` in options objects over positional parameters.
- **Exhaustive unions**: model domain states and expected errors as discriminated unions with stable `code`, `kind`, or `status` fields. When switching on the discriminator, cover every case and use `assertNever` from [`src/lib/primitives/assert-never/assert-never.ts`](src/lib/primitives/assert-never/assert-never.ts) so TypeScript catches new cases during development.
- **Bounded concurrency**: use `mapWithConcurrency` from [`src/lib/primitives/map-with-concurrency/map-with-concurrency.ts`](src/lib/primitives/map-with-concurrency/map-with-concurrency.ts) when processing lists from users, providers, the database, or repositories. Reserve unbounded `Promise.all(items.map(...))` for small fixed-size lists.
- **Go-style defer with `try`/`finally`**: use `try`/`finally` for cleanup that must run after acquiring resources such as locks, temporary files, timers, spans, subscriptions, or transaction-like handles. Keep the cleanup close to the acquisition, and let the original error continue to propagate unless the cleanup failure is more important.

# Drizzle Migrations

- Do not hand-write SQL files in `drizzle/` or edit `drizzle/meta/` snapshots by hand.
- Change the schema in `src/lib/database/schema.ts`, then run `vp run db:generate` to produce a new migration and snapshot.
- Commit the generated `drizzle/<NNNN>_*.sql` and matching `drizzle/meta/<NNNN>_snapshot.json` (and updated `_journal.json`) together with the schema change.
- Apply migrations locally with `vp run db:migrate`. CI runs `vp run db:generate` and fails if it produces uncommitted changes, so any drift between the schema and the migration history will block the build.
- Drizzle assigns sequential numeric prefixes (`0004_`, `0005_`, ...). Two branches that both generate against the same base will collide on the same number. After rebasing/merging, delete your migration files and snapshot, then rerun `vp run db:generate` so your migration is renumbered on top of whatever landed on `main`. CI also fails fast on duplicate indices in `_journal.json` or duplicate filename prefixes in `drizzle/`.

<!--VITE PLUS START-->

# Using Vite+, the Unified Toolchain for the Web

This project is using Vite+, a unified toolchain built on top of Vite, Rolldown, Vitest, tsdown, Oxlint, Oxfmt, and Vite Task. Vite+ wraps runtime management, package management, and frontend tooling in a single global CLI called `vp`. Vite+ is distinct from Vite, but it invokes Vite through `vp dev` and `vp build`.

## Vite+ Workflow

`vp` is a global binary that handles the full development lifecycle. Run `vp help` to print a list of commands and `vp <command> --help` for information about a specific command.

### Start

- create - Create a new project from a template
- migrate - Migrate an existing project to Vite+
- config - Configure hooks and agent integration
- staged - Run linters on staged files
- install (`i`) - Install dependencies
- env - Manage Node.js versions

### Develop

- dev - Run the development server
- check - Run format, lint, and TypeScript type checks
- lint - Lint code
- fmt - Format code
- test - Run tests

### Execute

- run - Run monorepo tasks
- exec - Execute a command from local `node_modules/.bin`
- dlx - Execute a package binary without installing it as a dependency
- cache - Manage the task cache

### Build

- build - Build for production
- pack - Build libraries
- preview - Preview production build

### Manage Dependencies

Vite+ automatically detects and wraps the underlying package manager such as pnpm, npm, or Yarn through the `packageManager` field in `package.json` or package manager-specific lockfiles.

- add - Add packages to dependencies
- remove (`rm`, `un`, `uninstall`) - Remove packages from dependencies
- update (`up`) - Update packages to latest versions
- dedupe - Deduplicate dependencies
- outdated - Check for outdated packages
- list (`ls`) - List installed packages
- why (`explain`) - Show why a package is installed
- info (`view`, `show`) - View package information from the registry
- link (`ln`) / unlink - Manage local package links
- pm - Forward a command to the package manager

### Maintain

- upgrade - Update `vp` itself to the latest version

These commands map to their corresponding tools. For example, `vp dev --port 3000` runs Vite's dev server and works the same as Vite. `vp test` runs JavaScript tests through the bundled Vitest. The version of all tools can be checked using `vp --version`. This is useful when researching documentation, features, and bugs.

## Common Pitfalls

- **Using the package manager directly:** Do not use pnpm, npm, or Yarn directly. Vite+ can handle all package manager operations.
- **Always use Vite commands to run tools:** Don't attempt to run `vp vitest` or `vp oxlint`. They do not exist. Use `vp test` and `vp lint` instead.
- **Running scripts:** Vite+ built-in commands (`vp dev`, `vp build`, `vp test`, etc.) always run the Vite+ built-in tool, not any `package.json` script of the same name. To run a custom script that shares a name with a built-in command, use `vp run <script>`. For example, if you have a custom `dev` script that runs multiple services concurrently, run it with `vp run dev`, not `vp dev` (which always starts Vite's dev server).
- **Do not install Vitest, Oxlint, Oxfmt, or tsdown directly:** Vite+ wraps these tools. They must not be installed directly. You cannot upgrade these tools by installing their latest versions. Always use Vite+ commands.
- **Use Vite+ wrappers for one-off binaries:** Use `vp dlx` instead of package-manager-specific `dlx`/`npx` commands.
- **Import JavaScript modules from `vite-plus`:** Instead of importing from `vite` or `vitest`, all modules should be imported from the project's `vite-plus` dependency. For example, `import { defineConfig } from 'vite-plus';` or `import { expect, test, vi } from 'vite-plus/test';`. You must not install `vitest` to import test utilities.
- **Type-Aware Linting:** There is no need to install `oxlint-tsgolint`, `vp lint --type-aware` works out of the box.

## CI Integration

For GitHub Actions, consider using [`voidzero-dev/setup-vp`](https://github.com/voidzero-dev/setup-vp) to replace separate `actions/setup-node`, package-manager setup, cache, and install steps with a single action.

```yaml
- uses: voidzero-dev/setup-vp@v1
  with:
    cache: true
- run: vp check
- run: vp test
```

## Review Checklist for Agents

- [ ] Run `vp install` after pulling remote changes and before getting started.
- [ ] Run `vp check --fix` and `vp test` to validate changes.
<!--VITE PLUS END-->
