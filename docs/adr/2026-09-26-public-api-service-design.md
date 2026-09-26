# Public API service with database-backed PAT validation

Status: Accepted

## Decision

Create `apps/public-api` as a separate Go executable in the root Go module.
Clients send their existing personal access token in `x-api-key`. The service
validates each request by looking up the token hash in PostgreSQL, checking
revocation, workspace lifecycle, and the owner's organization membership role.
Returned permissions are the intersection of stored scopes and the owner's
current role. The response contains token, owner, and organization IDs,
permissions, and optional Queries entitlements. Resource routes must additionally
enforce organization and project/team access; authentication alone does not
authorize arbitrary resources.

## Initial scope

- `GET /health` reports process health without authentication.
- `GET /v1/me` authenticates a PAT and returns its effective identity.
- `DATABASE_URL` connects to the shared Hyperlocalise database for authentication
  and read-only Projects and Queries resources.
- Optional `AUTUMN_API_KEY` enables Queries plan entitlement checks.
- Server timeouts, graceful shutdown, a container recipe, and setup instructions
  make the executable independently deployable.
- Tests cover PAT rejection, role restrictions, resource authorization, upstream
  entitlement failures, and error mapping.

No authentication results are cached. Database or entitlement outages fail closed
with 503; invalid PATs receive 401 and rejected workspace access receives 403.
Responses use `Cache-Control: no-store`. The service does not log credentials.

## Alternatives

Platform introspection keeps authentication policy centralized but couples the
service to the web application on every request. Forwarding every public request
to the web app preserves existing behavior but does not establish an
independent API implementation. Direct database validation keeps resource reads
and token checks in one deployable service while reusing existing tables.

## Deployment

Configure `DATABASE_URL` and optional `AUTUMN_API_KEY` through deployment
secrets. Deploy behind a TLS ingress with request rate limits. Existing public
routes and browser-facing `apps/go-svc` remain at their current locations.
Migrating jobs and files, DNS routing, rate limiting at ingress, and additional
resource authorization are follow-on work when those routes are added.
