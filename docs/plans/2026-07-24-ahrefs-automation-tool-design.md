# Ahrefs automation tool (API key → MCP)

## Problem

Workspace automations list Ahrefs under Coming soon. Teams need Ahrefs SEO
data in automations without building custom API clients. Ahrefs exposes this
through their hosted MCP server, with MCP API key (Bearer) auth.

## Decision

Mirror Semrush: store the MCP API key at the organization level; store only a
connection reference on the automation. At run time, connect to Ahrefs MCP with
that key and query through a planned orchestrator tool.

### Org-level: `ahrefs_connections`

| Field | Secret? | Notes |
|-------|---------|-------|
| `display_name` | no | Label in Integrations and automation pickers |
| `ciphertext` / `iv` / `auth_tag` / `key_version` / `encryption_algorithm` | yes | AES-256-GCM via `PROVIDER_CREDENTIALS_MASTER_KEY` |
| `masked_api_key_suffix` | no | UI hint only |
| `enabled`, `validation_status`, `validation_message` | no | Connection health |

Encrypted plaintext is the raw Ahrefs MCP token string (from Account Settings →
API Keys → Generate MCP key).

Fixed MCP endpoint (not stored per row):

`https://api.ahrefs.com/mcp/mcp`

Auth header on every request:

`Authorization: Bearer <mcp_token>`

Never put the API key in `tool_config`, automation instructions, or list API
responses. Decrypt only on the server when validating or opening the MCP
client.

### Per-automation: `toolConfig.ahrefs`

```ts
toolConfig.ahrefs = {
  enabled: boolean;
  connectionId?: string; // uuid of ahrefs_connections
};
```

Saving an enabled Ahrefs tool requires a connection that belongs to the org
and is enabled with `validationStatus === "valid"`.

### Runtime: `use_ahrefs`

Add `use_ahrefs` to the workspace orchestrator plan when Ahrefs is enabled.
That tool:

1. Loads and decrypts the selected connection
2. Opens an MCP client (`@ai-sdk/mcp`) with HTTP transport and the Bearer header
3. Runs a short tool loop against Ahrefs MCP tools
4. Writes a summary into `session.stepResults.use_ahrefs`
5. Closes the MCP client

This keeps Ahrefs inside the existing sequential `prepareStep` plan. It does
not change how GitHub, Contentful, Semrush, or notification tools run.

## Behavior

1. Admin adds an Ahrefs connection under Integrations (display name + MCP key).
2. User adds **Ahrefs** from Add Tool → Supported tools.
3. Tools settings row lets them choose which connection to use.
4. On save, validate `connectionId` against `ahrefs_connections`.
5. On run, the orchestrator calls `use_ahrefs` when it is in the plan.

## Alternatives considered

1. **Reuse generic MCP Server only** — rejected for product UX; Ahrefs should
   appear as a named tool, with a fixed URL and Bearer header, not a manual
   MCP URL/header form.
2. **Inject Ahrefs MCP tools into the top-level orchestrator** — rejected for
   v1; a nested tool loop under `use_ahrefs` matches Semrush and stays safer.
3. **Call Ahrefs REST APIs directly** — rejected; the linked docs standardize
   on the hosted MCP server.

## Out of scope

- Generic MCP orchestrator runtime (still follow-up from the MCP Server design)
- Per-tool allowlists in the automation UI
- Other Coming soon SEO tools (Meta Ads Library, Similarweb, Google SERP, etc.)
