# Public API service with platform-backed PAT validation

Status: Accepted

## Decision

Create `apps/public-api` as a separate Go executable in the root Go module.
Clients send their existing personal access token in `x-api-key`. The service
validates each request through `POST /api/internal/public-api/introspect` on the
platform. A dedicated `PUBLIC_API_SERVICE_SECRET` authenticates this internal
call through `Authorization: Bearer`; it is independent of encryption keys.

The platform reuses its PAT middleware to check the stored SHA-256 hash,
revocation, workspace lifecycle, and current owner membership. Returned
permissions are the intersection of stored scopes and the owner's current role.
The response contains only token, owner, and organization IDs and permissions.
Resource routes must additionally enforce organization and project/team access;
the introspection response alone does not authorize arbitrary resources.

## Initial scope

- `GET /healthz` reports process health without authentication.
- `GET /v1/me` authenticates a PAT and returns its effective identity.
- An HTTP client with a bounded timeout, response size limit, HTTPS outside
  loopback development, and redirects disabled performs introspection.
- Server timeouts, graceful shutdown, a container recipe, and setup instructions
  make the executable independently deployable.
- Tests cover service authentication, PAT rejection, role restrictions,
  revocation between requests, upstream failures, and credential forwarding.

No authentication results are cached. Platform outages fail closed with 503;
invalid PATs receive 401 and rejected workspace access receives 403. Responses
use `Cache-Control: no-store`. Neither service logs credentials.

## Alternatives

Direct database validation removes a network hop but couples the service to
platform tables and duplicates membership reconciliation and authorization.
Forwarding every public request to the web app preserves existing behavior but
does not establish an independent API implementation. Platform introspection
keeps authentication policy centralized while allowing Go resource handlers.

## Deployment

Configure the same dedicated service secret in both deployments and set
`PUBLIC_API_PLATFORM_URL` in Go to the platform's HTTPS origin. Deploy the
platform endpoint before starting the Go service. Existing public routes and
browser-facing `apps/go-svc` remain at their current locations. Migrating jobs
and files, DNS routing, rate limiting at ingress, and resource authorization
are follow-on work when those routes are added.
