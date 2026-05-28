# [HIGH] Untrusted MCP OAuth clients can mint tokens without user consent

**File:** [`apps/hyperlocalise-web/src/api/routes/mcp/mcp.route.ts`](https://github.com/hyperlocalise/hyperlocalise/blob/main/apps/hyperlocalise-web/src/api/routes/mcp/mcp.route.ts#L369-L515) (lines 369, 391, 415, 447, 458, 469, 490, 515)
**Project:** hyperlocalise
**Severity:** HIGH  •  **Confidence:** high  •  **Slug:** `oauth-flow`

## Owners

**Suggested assignee:** `cungminh2710@gmail.com` _(via last-committer)_

## Finding

The MCP OAuth flow allows unauthenticated dynamic client registration for any HTTPS redirect URI, then the authorize/callback path immediately issues an authorization code for the signed-in user's organization without a consent screen, trusted-client allowlist, or per-user client grant. An attacker can register a client with an attacker-controlled HTTPS redirect URI, send a logged-in victim to /api/mcp/authorize with the attacker's client_id and PKCE challenge, receive the code at the registered redirect URI, and exchange it at /api/mcp/token for MCP access and refresh tokens. Those tokens can call the MCP tools, which expose organization-scoped project and glossary data.

## Recommendation

Require explicit user consent before issuing MCP authorization codes to dynamically registered clients, or restrict registration/authorization to trusted pre-approved clients. Bind client grants to the user and organization, show the registered client name and redirect URI, and refuse token exchange unless that grant exists.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-05-22)
