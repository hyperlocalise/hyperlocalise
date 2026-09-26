# Public API

Standalone Go service for external consumers using Hyperlocalise personal access tokens.
The web frontend continues to use its existing APIs. It does not call this service.
The API reports the token's effective identity and provides read-only Projects
and Queries resources. Jobs and files continue to use the existing platform API.

## Run locally

From the repository root:

```sh
export PORT=8081
export DATABASE_URL=postgresql://hyperlocalise:hyperlocalise@localhost:5432/hyperlocalise
# Optional. Required to expose Queries resources for entitled workspaces.
# export AUTUMN_API_KEY=am_sk_test_...
go run ./apps/public-api
```

`PORT` defaults to 8081. `DATABASE_URL` is required. The service validates PATs
directly against PostgreSQL and does not need a WorkOS secret, provider encryption
key, or platform URL.

```sh
curl http://localhost:8081/health
curl -H "x-api-key: $HYPERLOCALISE_API_KEY" http://localhost:8081/v1/me
curl -H "x-api-key: $HYPERLOCALISE_API_KEY" http://localhost:8081/v1/projects
curl -H "x-api-key: $HYPERLOCALISE_API_KEY" 'http://localhost:8081/v1/queries?status=open'
```

A successful authenticated response has this shape:

```json
{
    "principal": {
        "tokenId": "token-id",
        "userId": "owner-id",
        "organizationId": "workspace-id",
        "permissions": ["jobs:read", "files:read", "projects:read", "queries:read"],
        "entitlements": { "queries": true }
    }
}
```

Each request looks up the presented token hash in `organization_api_keys`,
checks revocation, workspace lifecycle, and the owner's current organization
membership role. Effective permissions are the intersection of stored token
scopes and the owner's role, with `files:read` also granting read access to
Projects and Queries resources. Queries additionally require the Queries plan
entitlement from Autumn when `AUTUMN_API_KEY` is configured. Authentication
results are not cached. Resource queries apply organization and team access
rules directly in PostgreSQL.

Invalid PATs receive 401, denied workspace access receives 403, and database or
entitlement service failures receive 503. Responses are not cacheable. The health
endpoint reports process liveness, not database availability.

## API reference

The OpenAPI 3.1 document lives in [`openapi.yaml`](./openapi.yaml) and is embedded
in the service binary. A running service exposes the document at
`GET /openapi.yaml` and interactive documentation at `GET /docs`.

Projects use `projects:read` (including via `files:read`). Queries use
`queries:read` (including via `files:read`) and require the Queries workspace
entitlement. Collection endpoints accept `limit` and `offset`; Query lists also
accept project, status, type, priority, locale, assignee, search, and sort
filters. Missing and inaccessible records both return `404`.

## Build and test

```sh
go test -race ./apps/public-api
make check-build-public-api
docker build -f apps/public-api/Dockerfile -t hyperlocalise-public-api .
```

Deploy this service behind a TLS ingress with request rate limits. Configure
`DATABASE_URL` and optional `AUTUMN_API_KEY` through deployment secrets, not
build arguments. No DNS or existing API routes change automatically.

## Adding resource endpoints

Require the relevant effective token scope and enforce workspace and project/team
access for each resource. A validated principal alone does not grant access to
every project in a workspace. Never log tokens or secrets.
