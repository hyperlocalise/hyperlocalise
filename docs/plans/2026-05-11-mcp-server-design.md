# MCP HTTP Server Design

**Date:** 2026-05-11  
**Ticket:** [HL-271](https://linear.app/hyperlocalise/issue/HL-271)  
**Scope:** MVP — OAuth authorization server + MCP transport + `list_projects` tool

## Overview

Build a spec-compliant MCP HTTP server endpoint that enables AI assistants (Claude Desktop, Cursor, etc.) to query Hyperlocalise data. Authentication follows the MCP authorization specification using OAuth 2.1 with PKCE, delegating identity to WorkOS AuthKit.

## Simplified Token Model

We **do not store WorkOS tokens** in our database.

- At `/mcp/callback`: exchange WorkOS code → get user profile → issue our own MCP access/refresh tokens
- Store only `user_id`, `organization_id`, `access_token_hash`, `refresh_token_hash`, `expires_at` in `mcp_sessions`
- Rely on existing WorkOS webhooks for membership revocation
- No `MCP_ENCRYPTION_KEY` needed

## Data Model

### `mcp_sessions`

```sql
CREATE TABLE mcp_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  access_token_hash text NOT NULL,
  refresh_token_hash text NOT NULL,
  expires_at timestamp NOT NULL,
  created_at timestamp DEFAULT now()
);

CREATE INDEX idx_mcp_sessions_access_token_hash ON mcp_sessions(access_token_hash);
CREATE INDEX idx_mcp_sessions_refresh_token_hash ON mcp_sessions(refresh_token_hash);
```

Token generation: 32-byte random strings, SHA-256 hashed for storage.

## Auth Flow

```
MCP Client → GET /.well-known/oauth-authorization-server
           ← metadata

MCP Client → GET /api/mcp/authorize?redirect_uri=...&state=...&code_challenge=...
           ← 302 Redirect to WorkOS /authorize

User → logs in at WorkOS
     ← 302 Redirect to /api/mcp/callback?code=...&state=...

MCP Client ← /api/mcp/callback exchanges WorkOS code, creates mcp_session, issues MCP auth code
           ← 302 Redirect to client redirect_uri?code=...&state=...

MCP Client → POST /api/mcp/token {grant_type=authorization_code, code=..., code_verifier=...}
           ← {access_token, refresh_token, token_type, expires_in}

MCP Client → GET /api/mcp/sse (Bearer token)
           ← SSE stream with endpoint event

MCP Client → POST /api/mcp/message (Bearer token, JSON-RPC)
           ← JSON-RPC response
```

## Endpoints

| Endpoint | Method | Purpose |
|---|---|---|
| `/.well-known/oauth-authorization-server` | GET | Returns OAuth metadata |
| `/api/mcp/authorize` | GET | Initiates OAuth flow, validates params, redirects to WorkOS |
| `/api/mcp/callback` | GET | Receives WorkOS callback, creates session, redirects with MCP auth code |
| `/api/mcp/token` | POST | Exchanges auth code + PKCE for tokens; handles refresh |
| `/api/mcp/sse` | GET | MCP SSE transport (Bearer auth) |
| `/api/mcp/message` | POST | MCP JSON-RPC message endpoint (Bearer auth) |

## MCP Transport

Uses `@modelcontextprotocol/sdk`:
- `SSEServerTransport` for `/mcp/sse`
- `JSONRPCMessage` handling for `/mcp/message`
- Bearer token validated via middleware before transport handlers

## Tool: `list_projects`

- Input: `{}` (no args, org scoped by token)
- Execute: query `projects` table where `organization_id = session.organization_id`
- Return: array of `{id, name, slug, description, created_at}`

## Environment Variables

```
MCP_AUTH_ENABLED=true                # default: true
MCP_TOKEN_LIFETIME_MINUTES=60        # default: 60
MCP_REFRESH_TOKEN_LIFETIME_DAYS=30   # default: 30
```

## Testing

- Mock WorkOS token exchange in auth flow tests
- Test PKCE validation (fail on mismatched verifier)
- Test token refresh
- Test SSE connection establishment
- Test `list_projects` tool execution with mocked DB

## Future Work (Phase 3+)

- Implement remaining 7 tools (get_project, list_translations, upload_sources, download_translations, list_glossaries, get_glossary_entries, run_workflow)
- Add rate limiting to MCP endpoints
- Add audit logging for MCP tool invocations
- Add dynamic client registration (`/mcp/register`)
- Write documentation for connecting Claude Desktop / Cursor
