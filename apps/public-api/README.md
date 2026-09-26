# Public API

Standalone Go service for external consumers using Hyperlocalise personal access tokens.
The web frontend continues to use its existing APIs. It does not call this service.
The initial endpoint reports the token's owner, workspace, and effective scopes.
Jobs and files continue to use the existing platform API.

## Run locally

Set `PUBLIC_API_SERVICE_SECRET` to the same random secret (at least 32 characters)
in the platform's server environment and this service. Generate one with
`openssl rand -hex 32`; store it in your secret manager. Restart the platform
after setting it. This is a dedicated service credential, unrelated to the
provider encryption key.

From the repository root, after exporting that secret:

```sh
export PUBLIC_API_PLATFORM_URL=http://localhost:3000
export PORT=8081
go run ./apps/public-api
```

`PUBLIC_API_PLATFORM_URL` must be an HTTPS origin in deployment. HTTP is allowed
only for localhost or loopback IPs during development. `PORT` defaults to 8081.
Go needs no database connection, WorkOS secret, or provider encryption key.

```sh
curl http://localhost:8081/healthz
curl -H "x-api-key: $HYPERLOCALISE_API_KEY" http://localhost:8081/v1/me
```

A successful authenticated response has this shape:

```json
{
    "principal": {
        "tokenId": "token-id",
        "userId": "owner-id",
        "organizationId": "workspace-id",
        "permissions": ["jobs:read", "files:read"]
    }
}
```

Each request calls `POST /api/internal/public-api/introspect` on the platform.
The platform authenticates the service before checking the user's PAT. It
reuses the existing revocation, workspace, membership reconciliation, and role
checks. Permissions reflect both the token's scopes and the owner's current
role. Authentication results are not cached.

Invalid PATs receive 401, denied workspace access receives 403, and platform
errors or service credential problems receive 503. Responses are not cacheable.
The health endpoint reports process liveness, not platform availability.

## Build and test

```sh
go test -race ./apps/public-api
make check-build-public-api
docker build -f apps/public-api/Dockerfile -t hyperlocalise-public-api .
```

Deploy the platform endpoint first, then deploy this service behind a TLS ingress
with request rate limits. Configure both secrets through deployment secrets,
not build arguments. No DNS or existing API routes change automatically.

## Adding resource endpoints

Require the relevant effective token scope and enforce workspace and project/team
access for each resource. A validated principal alone does not grant access to
every project in a workspace. Do not forward client cookies, authorization
headers, or workspace headers to the platform; only the PAT and this service's
own credential belong on the introspection call. Never log tokens or secrets.
