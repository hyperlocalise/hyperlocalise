# Semrush automation tool (API key → MCP)

## Problem

Workspace automations list Semrush under Coming soon. Teams need Semrush SEO
and traffic data in automations without building custom API clients. Semrush
exposes this through their MCP server, with API key auth for agents that do
not support OAuth.

## Decision

Mirror Contentful and MCP Server: store the API key at the organization level;
store only a connection reference on the automation. At run time, connect to
Semrush MCP with that key and query through a planned orchestrator tool.

### Org-level: `semrush_connections`

| Field | Secret? | Notes |
|-------|---------|-------|
| `display_name` | no | Label in Integrations and automation pickers |
| `ciphertext` / `iv` / `auth_tag` / `key_version` / `encryption_algorithm` | yes | AES-256-GCM via `PROVIDER_CREDENTIALS_MASTER_KEY` |
| `masked_api_key_suffix` | no | UI hint only |
| `enabled`, `validation_status`, `validation_message` | no | Connection health |

Encrypted plaintext is the raw Semrush API key string.

Fixed MCP endpoint (not stored per row):

`https://mcp.semrush.com/v2/mcp`

Auth header on every request:

`Authorization: Apikey <api_key>`

Never put the API key in `tool_config`, automation instructions, or list API
responses. Decrypt only on the server when validating or opening the MCP
client.

### Per-automation: `toolConfig.semrush`

```ts
toolConfig.semrush = {
  enabled: boolean;
  connectionId?: string; // uuid of semrush_connections
};
```

Saving an enabled Semrush tool requires a connection that belongs to the org
and is enabled.

### Runtime: `use_semrush`

Add `use_semrush` to the workspace orchestrator plan when Semrush is enabled.
That tool:

1. Loads and decrypts the selected connection
2. Opens an MCP client (`@ai-sdk/mcp`) with HTTP transport and the Apikey header
3. Runs a short tool loop against Semrush discovery / report tools
4. Writes a summary into `session.stepResults.use_semrush`
5. Closes the MCP client

This keeps Semrush inside the existing sequential `prepareStep` plan. It does
not change how GitHub, Contentful, or notification tools run.

## Behavior

1. Admin adds a Semrush connection under Integrations (display name + API key).
2. User adds **Semrush** from Add Tool → Supported tools.
3. Tools settings row lets them choose which connection to use.
4. On save, validate `connectionId` against `semrush_connections`.
5. On run, the orchestrator calls `use_semrush` when it is in the plan.

## Alternatives considered

1. **Reuse generic MCP Server only** — rejected for product UX; Semrush should
   appear as a named tool, with a fixed URL and Apikey header, not a manual
   MCP URL/header form.
2. **OAuth to Semrush MCP** — deferred; the request specifies the API key
   approach from Semrush docs.
3. **Inject Semrush MCP tools into the top-level orchestrator** — rejected for
   v1; it fights the sequential `prepareStep` model. A nested tool loop under
   `use_semrush` is simpler and safer.
4. **Call Semrush REST APIs directly** — rejected; the linked docs standardize
   on MCP discovery + `get_report_schema` + `execute_report`.

## Out of scope

- Semrush OAuth for MCP
- Generic MCP orchestrator runtime (still follow-up from the MCP Server design)
- Per-report allowlists in the automation UI
- Ahrefs / Google SERP / other Coming soon SEO tools
