# Ahrefs WorkOS Pipes Design

## Date

2026-09-06

## Context

Ahrefs automations stored org-level MCP API keys in `ahrefs_connections` and referenced a row UUID from `toolConfig.ahrefs.connectionId`. Nobody used that path. WorkOS Pipes now stores third-party API keys per user and vends them at run time.

Ahrefs is not in the WorkOS catalog. The dashboard must enable a custom API-key provider with slug `ahrefs`.

## Decision

Connect Ahrefs through WorkOS Pipes. Keep `ahrefs_connections` in the schema and the old CRUD routes, marked deprecated. Do not backfill.

### Integrations UI

Render the WorkOS `<Pipes>` widget filtered to `slugs: ['ahrefs']`. Authenticate with the AuthKit access token (`useAccessToken().getAccessToken`). Status for the row badge and automations comes from `GET /api/orgs/:slug/pipes/:provider` (`provider=ahrefs`). Additional Pipes providers share that route.

### Automations

`toolConfig.ahrefs` is `{ enabled, workosUserId? }`. `connectionId` is accepted and ignored. Saving an enabled Ahrefs tool stamps the saver's WorkOS user id and checks that user has a connected Ahrefs pipe. The form is an on/off tool with no connection picker.

### Runtime

`use_ahrefs` loads the API key with `workos.pipes.createDataIntegrationCredential`, then calls Ahrefs MCP as before (`https://api.ahrefs.com/mcp/mcp`, `Authorization: Bearer`).

## Consequences

- Credentials live in WorkOS, scoped to the user who connected Ahrefs.
- Dashboard setup is required: custom provider slug `ahrefs`, widget CORS on the app origin, and Pipes widget permission on roles that manage integrations.
- Old DB rows stay unused until a later drop.
