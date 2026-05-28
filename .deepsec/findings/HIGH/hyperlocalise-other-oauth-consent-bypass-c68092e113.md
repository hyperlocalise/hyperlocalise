# [HIGH] MCP OAuth callback grants tokens to arbitrary registered clients without user consent

**File:** [`apps/hyperlocalise-web/src/app/mcp/[[...route]]/route.ts`](https://github.com/hyperlocalise/hyperlocalise/blob/main/apps/hyperlocalise-web/src/app/mcp/[[...route]]/route.ts#L5-L7) (lines 5, 7)
**Project:** hyperlocalise
**Severity:** HIGH  •  **Confidence:** high  •  **Slug:** `other-oauth-consent-bypass`

## Owners

**Suggested assignee:** `cungminh2710@gmail.com` _(via last-committer)_

## Finding

This App Router handler exposes createMcpRoutes at the root /mcp surface. In the imported route factory, /mcp/register allows public dynamic registration of any HTTPS redirect URI, and /mcp/callback accepts client_id, redirect_uri, code_challenge, scope, state, and organizationSlug directly from the request. If a victim with an active Hyperlocalise session is tricked into visiting a crafted /mcp/callback URL for an attacker-registered client, the callback resolves the victim session, creates an authorization code for the victim user and organization, and redirects that code to the attacker's redirect_uri. PKCE does not mitigate this because the attacker supplies both the code_challenge and later the code_verifier. The attacker can then exchange the code at /mcp/token for MCP access and refresh tokens and read organization-scoped project/glossary data through the MCP tools. There is no server-generated authorization transaction, consent screen, or trusted-client allowlist gating the token grant.

## Recommendation

Do not let /mcp/callback mint authorization codes solely from request parameters. Start an authorization transaction at /mcp/authorize, bind it to an HttpOnly SameSite session cookie or server-side record, require explicit user consent for the client, organization, and scopes, and validate the callback against that transaction. Disable open dynamic registration in production or restrict clients/redirect URIs to an allowlist or an approval flow.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-05-13)
