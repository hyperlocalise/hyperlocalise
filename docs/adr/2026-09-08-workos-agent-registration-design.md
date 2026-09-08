# WorkOS Agent Registration

## Date

2026-09-08

## Status

Accepted

## Context

Coding agents need a standards-based way to obtain credentials for Hyperlocalise.
AuthKit Agent Registration (discovery, `service_auth` registration, hosted claim,
JWT exchange) is that protocol. Hyperlocalise already authenticates humans with
AuthKit sessions, MCP clients with first-party OAuth (`hl_mcp_*`), and the
public REST API with personal access tokens (`x-api-key`).

Anonymous/pre-claim agents would skip the WorkOS membership gate. MCP clients
discover authorization servers from protected-resource metadata and use the
first listed server. Adding AuthKit there would send Claude, Codex, and Cursor
through AuthKit's human OAuth instead of `/mcp/authorize`.

## Decision

Agent registration, claim, and token minting stay on AuthKit. Hyperlocalise
hosts `/auth.md`, advertises a separate RFC 9728 document for `/api/v1`, and
validates claimed agent JWTs on MCP and `/api/v1`.

- Enable **service auth** only. Do not enable anonymous registration.
- Use the hosted AuthKit claim page. Do not implement the standalone claim API.
- Issue short-lived access-token JWTs. Verify them locally with AuthKit JWKS.
- Keep MCP OAuth and PATs. Figma stays PAT-only.
- Leave MCP protected-resource metadata pointing at Hyperlocalise. Add
  `/.well-known/oauth-protected-resource/api/v1` for AuthKit.
- Effective access is token `scope` intersected with the claimed user's live
  membership and capabilities. Tokens without `act.sub` are rejected.

## Consequences

Dashboard setup is required before the live flow works: Agent Registration
enabled, service auth on, access-token credentials, trusted permissions matching
PAT scopes plus `mcp`, and the AuthKit domain in `WORKOS_AUTHKIT_DOMAIN`.

The local WorkOS emulator does not implement agent registration. Unit tests sign
fixture JWTs; the hosted claim is verified against staging AuthKit.
