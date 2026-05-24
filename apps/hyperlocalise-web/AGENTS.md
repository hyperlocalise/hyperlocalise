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

## Testing

- Use Hono's `testClient` for route tests.
- Test the real API app exported from [`src/api/app.ts`](src/api/app.ts) when possible, rather than rebuilding a parallel test-only app structure.

<!-- END:hono-agent-rules -->

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

# Drizzle Migrations

- Do not hand-write SQL files in `drizzle/` or edit `drizzle/meta/` snapshots by hand.
- Change the schema in `src/lib/database/schema.ts`, then run `vp run db:generate` to produce a new migration and snapshot.
- Commit the generated `drizzle/<NNNN>_*.sql` and matching `drizzle/meta/<NNNN>_snapshot.json` (and updated `_journal.json`) together with the schema change.
- Apply migrations locally with `vp run db:migrate`. CI runs `vp run db:generate` and fails if it produces uncommitted changes, so any drift between the schema and the migration history will block the build.
- One-off data backfills belong in `src/lib/**/run-*.ts` scripts (see `vp run db:backfill-project-teams`), not hand-edited SQL inside generated migrations. After migration `0022`, run `vp run db:deprecate-local-org-workspaces` to mark legacy `local_org_*` rows as `deprecated`.
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
