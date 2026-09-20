# go-svc WorkOS session access tokens

## Date

2026-09-20

## Status

Accepted

## Context

go-svc authenticated humans only by unsealing the AuthKit `wos-session`
cookie. Some clients may already hold a short-lived WorkOS session access
token from AuthKit. That JWT is the same credential sealed inside the cookie.
Cookie integrity currently replaces JWT signature checks, so a bare Bearer token
needs real JWKS verification.

AuthKit agent JWTs are a different channel. They use the AuthKit issuer, an
`act.sub` claim, and scopes meant for MCP and `/api/v1` only.

## Decision

Accept WorkOS User Management session access tokens on go-svc as
`Authorization: Bearer` in addition to the sealed session cookie.

- Verify RS256 signatures against `GET {WORKOS API}/sso/jwks/{WORKOS_CLIENT_ID}`.
- Require `aud` = `WORKOS_CLIENT_ID`, `sub` (WorkOS user id), `sid`, and `exp`.
- Allow `iss` of the WorkOS API base URL, or that URL plus `/{client_id}`.
- Reject tokens with an `act` claim so agent JWTs cannot reach go-svc.
- Prefer a present `wos-session` cookie over Bearer. Do not fall through from
  an invalid cookie to a Bearer token.
- Do not refresh Bearer tokens in go-svc. Clients refresh and send a new JWT.

Org-scoped Hono routes stay cookie-based. Figma stays PAT-only. Agent JWTs
stay on MCP and `/api/v1`.

## Consequences

Clients that hold a WorkOS session access token can call go-svc with
`Authorization: Bearer`. Browser CAT traffic is unchanged. go-svc needs
`WORKOS_CLIENT_ID` (and the same WorkOS API host as the web app) to verify
tokens. Access tokens expire in minutes; clients must refresh via AuthKit or
present the sealed session cookie, which go-svc can still refresh.

JWKS is cached for ten minutes. An unknown `kid` does not refetch while that
set is still fresh, so callers cannot force a WorkOS JWKS request per token.
