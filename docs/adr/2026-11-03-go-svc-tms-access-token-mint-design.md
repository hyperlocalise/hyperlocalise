# go-svc TMS access-token mint

## Status

Accepted

## Context

TMS credentials stay encrypted in Postgres and are decrypted only in the web app.
go-svc does not hold `PROVIDER_CREDENTIALS_MASTER_KEY` and returns
`provider_cat_deferred` for connected TMS CAT. A go-svc caller still needs a
short-lived TMS credential so it can call Crowdin, Phrase, Lokalise, or Smartling
directly.

Service authentication already exists in one direction: the web app sends
`X-Go-Svc-Research-Token` (HMAC-SHA256 of `go-svc-research` keyed by
`WORKOS_COOKIE_PASSWORD`) to go-svc `/internal/*` routes.

## Decision

Keep decryption, OAuth refresh, and per-user connections in the web app. Add
`POST /api/internal/tms/access-token` for go-svc.

The route:

- requires the existing go-svc service token, not a user session;
- takes `organizationId`, `providerKind`, optional `credentialId`, and optional
  `actorUserId`;
- refreshes OAuth tokens when needed, using the existing advisory locks;
- returns `{ tmsAccessToken: { providerKind, credentialId, authMode, baseUrl, headerName, headerValue, expiresAt, probeUrl } }`;
- never returns refresh tokens, client secrets, or Smartling user secrets.

Smartling mint calls `/auth-api/v2/authenticate` in the web app and returns the
access token. Crowdin, Phrase OAuth, and Lokalise OAuth require `actorUserId`.

go-svc uses `apps/go-svc/internal/tmsauth`. `Mint` calls the web route. `Apply`
sets the header on an outbound TMS request. `Probe` GETs `probeUrl` when present.
`Check` is mint then probe.

## Consequences

- go-svc TMS calls depend on the web app being reachable.
- Browser TMS health checks stay on Hono.
- A later CAT cutover can keep this mint or move decrypt and refresh into go-svc.
