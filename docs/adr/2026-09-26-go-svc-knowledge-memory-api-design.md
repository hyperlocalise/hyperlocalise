# Go service knowledge-memory API design

**Status:** Accepted

## Context

HL-845 adds workspace and project Markdown knowledge-memory APIs to `go-svc` in
parallel with the Hono routes. The contract includes optimistic writes, immutable
revision history, restore, and a selected-context preview. Data lives in the
existing PostgreSQL tables. The `workspace-knowledge` WorkOS feature flag gates
both scopes.

## Decision

Add a focused knowledge-memory API module to `apps/go-svc`. It will use the
existing organization actor resolution and workspace flag checker, and will
fail closed when the flag checker is absent, disabled, or errors. Reads require
valid organization membership. Writes and restores require the same
`workspace:update` capability as Hono (admin and localization manager roles).

Project access will use persisted project rows scoped to the organization and
the existing project team-access predicate. The API will not resolve provider
projects live, decrypt provider credentials, or call Blob, Workflow, or AI
services.

The API will read and write the existing workspace/project memory tables and
their revision tables directly. Commits and restores will run in PostgreSQL
transactions, compare the expected revision, archive the prior head, and update
the head atomically. Matching content remains a no-op unless restoring, and
revision pages merge the current head with archived revisions in descending
version order.

The preview endpoint will use a Go implementation of the existing Markdown
selection contract, including normalization, limits, fallback modes, excerpts,
and response metrics. HTTP paths, JSON casing, ETags, status codes, and stable
error codes will match Hono.

## Validation

Add handler tests for the route contracts and errors; unit tests for selection,
revision ordering, restore, no-op, and optimistic conflicts; authorization tests
for feature flags, roles, project teams, and provider IDs; and PostgreSQL
integration tests for transactional writes and revisions. Document the routes
and validation commands in `apps/go-svc/README.md`.

## Alternatives considered

- **Forward requests to Hono:** avoids porting preview logic, but does not add
  the requested Go implementation or keep the route's data path PostgreSQL-only.
- **Embed knowledge-memory behavior in the workspace API:** reuses more handler
  plumbing but couples a versioned document resource to workspace feature
  routes. A focused resource module keeps the HTTP and persistence logic local
  while reusing the existing actor, flag, and team-access helpers.

## Non-goals

Agent execution, embeddings, repository retrieval, provider credential
decryption, Blob, Workflow, AI SDK usage, browser cutover, and Hono removal.
