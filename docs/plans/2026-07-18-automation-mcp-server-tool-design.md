# Automation MCP Server tool

## Problem

Workspace automations can opt into GitHub, Slack, email, Contentful, translation,
and Memories tools, but they cannot call an external Model Context Protocol
(MCP) server. Teams need to attach a remote MCP server so the automation agent
can use that server's tools at run time.

## Decision

Mirror the Contentful connection pattern: store authentication at the
organization level; store only a connection reference and run options on the
automation.

### Org-level: `mcp_server_connections`

Each row is one remote MCP server the workspace can reuse:

| Field | Secret? | Notes |
|-------|---------|-------|
| `display_name` | no | Label in Integrations and automation pickers |
| `server_url` | no | HTTPS MCP endpoint (SSRF-validated) |
| `transport` | no | `http` (streamable HTTP) or `sse` |
| `auth_kind` | no | `none`, `bearer`, or `headers` |
| `ciphertext` / `iv` / `auth_tag` / `key_version` / `encryption_algorithm` | yes | AES-256-GCM via `PROVIDER_CREDENTIALS_MASTER_KEY` |
| `masked_token_suffix` | no | UI hint only |
| `enabled`, `validation_status`, `validation_message` | no | Connection health |

Encrypted plaintext is JSON:

```json
{
  "bearerToken": "optional",
  "headers": { "X-Api-Key": "optional" }
}
```

Never put tokens in `tool_config`, automation instructions, or API list
responses. List/detail APIs return metadata and the masked suffix only.
Decrypt only on the server when validating or opening an MCP client.

Do **not** reuse inbound Hyperlocalise MCP OAuth tables (`mcp_sessions`,
`mcp_oauth_clients`). Those authenticate clients *into* Hyperlocalise.

### Per-automation: `toolConfig.mcp`

```ts
toolConfig.mcp = {
  enabled: boolean;
  connectionId?: string; // uuid of mcp_server_connections
  // Future: allowedToolNames?: string[]
};
```

The automation Tools UI picks a connection created under Integrations. Saving
an enabled MCP tool requires a connection that belongs to the org and is
enabled.

### Runtime (follow-up)

Use AI SDK `createMCPClient` (HTTP/SSE transport) with decrypted headers, then
expose that server's tools to the workspace orchestrator for the run. Close the
client after the run. Stdio transport is out of scope (not deployable).

## Behavior

1. Admin adds an MCP server under Integrations (URL, transport, auth).
2. User adds **MCP Server** from Add Tool → Supported tools.
3. Tools settings row lets them choose which connection to use.
4. On save, validate `connectionId` against `mcp_server_connections`.
5. On run (follow-up), connect with encrypted credentials and register tools.

## Alternatives considered

1. **Secrets inside `toolConfig`** — rejected; secrets would leak into
   automation snapshots and list APIs.
2. **Generic `connectors` row only** — rejected; MCP needs URL, transport, and
   encrypted header material, which fits a dedicated connection table like
   Contentful.
3. **OAuth-only auth in v1** — deferred; bearer/header covers most remote MCP
   servers. OAuth can add an `auth_kind: "oauth"` later with a token store.

## Out of scope

- Orchestrator runtime wiring / tool injection during a run
- MCP OAuth client provider for remote servers
- Stdio / local process MCP servers
- Per-tool allowlists in the automation UI
