# Public API projects and queries

Status: Accepted

## Decision

Add read-only Projects and Queries resources to the standalone Go service in
`apps/public-api`. The service reads PostgreSQL through `pgxpool`; it does not
proxy resource requests through the web application.

The service validates each personal access token directly in PostgreSQL, applies
the intersection of stored scopes and the owner's current role, and enforces
the required scope, organization boundary, and project team access on each query.
`files:read` also grants Projects and Queries read access. Admins and
localization managers may read every project in their organization. Other roles
may read projects owned by their teams. Missing and inaccessible resources return
the same `404` response.

Queries retain the existing Queries plan entitlement. The Go service checks
Autumn when `AUTUMN_API_KEY` is configured so Queries can fail closed without
moving resource reads back into the web application.

## Routes

The first resource surface contains:

- `GET /v1/projects`
- `GET /v1/projects/{projectId}`
- `GET /v1/queries`
- `GET /v1/queries/{queryId}`

Collections use `limit` and `offset` pagination and return resource-keyed JSON
with pagination metadata. Query filters mirror the useful read-only filters in
the current Queries board: project, status, type, priority, locale, assignee,
search, and sort order.

Project responses omit internal organization, credential, and actor fields.
Query responses expose the current board record and its public project,
translation-key, assignment, and timestamp fields.

## OpenAPI

Commit an OpenAPI 3.1 document at `apps/public-api/openapi.yaml`, embed it in the
binary, and serve it from `GET /openapi.yaml`. Serve interactive documentation
from `GET /docs`. The document covers health, identity, Projects, Queries,
authentication, pagination, schemas, examples, and standard errors.

## Operations and tests

`DATABASE_URL` becomes required for the public API. Startup opens a bounded
pool, verifies connectivity, and closes it during shutdown. Health remains a
process-liveness response at `GET /health`.

Handler tests cover authentication, scopes, pagination, filters, inaccessible
resources, and error mapping. Store tests cover organization and team access.
Contract tests parse the embedded OpenAPI document and confirm the implemented
paths.

## Alternatives

Platform resource proxies would reuse TypeScript services but leave the Go API
as a forwarding shell. Platform introspection would centralize membership
reconciliation but couples every request to the web app. A new shared Go domain
package would reduce future duplication, but two read-only resources do not
justify that abstraction yet.
