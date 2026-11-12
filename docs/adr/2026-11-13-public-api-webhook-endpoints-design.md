# Job webhook endpoints in the public API

**Status:** Accepted

## Context

Job-change webhooks already fan out from Hyperlocalise Platform. Workspaces register HTTPS endpoints in **Settings** → **Webhooks**, behind a web-app session and the `api_keys:read` / `api_keys:write` capabilities. Personal access tokens cannot carry those capabilities, so scripts cannot register an endpoint.

## Decision

Add webhook endpoint management to `apps/public-api` on `https://public-api.hyperlocalise.com`:

- `GET, POST /v1/webhook-endpoints`
- `PATCH, DELETE /v1/webhook-endpoints/{endpointId}`
- `POST /v1/webhook-endpoints/{endpointId}/rotate-secret`
- `GET /v1/webhook-endpoints/{endpointId}/deliveries`

The request and response shapes match the session routes. The signing secret is returned only on create and rotate. URL checks, the 20-endpoint limit, event-type filters, and project filters stay the same. The public API does not hold `PROVIDER_CREDENTIALS_MASTER_KEY`. Create and rotate mint the secret from the web app (`POST /api/internal/webhooks/signing-secret`) and store the encrypted JSON blob. See [Webhook signing-secret mint](2026-11-13-public-api-webhook-secret-mint-design.md).

Effective permissions `webhooks:read` and `webhooks:write` are derived: `jobs:read` / `jobs:write` plus an admin or localization manager role. That matches who can open the Settings page, without a new stored PAT scope.

Sending a `webhook.test` event stays in the web app. It needs an SSRF-guarded outbound POST with DNS pinning, which the public API does not do today.

## Alternatives

A new stored `webhooks:write` PAT scope would let a manager grant webhook access without `jobs:write`. Settings already sit next to API keys and job changes; deriving from job scopes avoids a token-UI change.

Keeping management on the Hono session API and documenting cookie auth would not let an API key register an endpoint.

Proxying the whole create through Hono would move CRUD out of public-api. Minting only the signing secret keeps CRUD here and keeps the master key in the web app.
