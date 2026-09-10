# Zernio ads integration

## Date

2026-09-10

## Context

Teams localize ad copy in Hyperlocalise, then still leave the product to create paid campaigns. Zernio exposes one API for Meta, Google, TikTok, LinkedIn, Pinterest, X, and OpenAI Ads. An org-level connection plus agent tools lets automations and inbound MCP agents create those ads from localized content.

## Decision

Store a Zernio API key on the organization, the same way Semrush stores its key. Automations keep only a connection id. Runtime calls `https://zernio.com/api/v1` with `Authorization: Bearer`.

### Org-level: `zernio_connections`

Encrypt the key with `PROVIDER_CREDENTIALS_MASTER_KEY`. List and get responses never include the secret. Saving validates the key with `GET /v1/accounts` unless the caller sets `validate: false`.

### Per-automation: `toolConfig.zernio`

```ts
toolConfig.zernio = {
  enabled: boolean;
  connectionId?: string; // uuid of zernio_connections
};
```

Saving an enabled Zernio tool requires an enabled, valid connection that belongs to the org.

### Runtime: `use_zernio`

Add `use_zernio` to the workspace orchestrator plan when Zernio is enabled. That tool opens a nested agent with typed Zernio tools:

- `zernio_list_accounts`
- `zernio_list_ads`
- `zernio_get_ad`
- `zernio_create_ad` (`POST /v1/ads/create`)
- `zernio_create_campaign` (`POST /v1/ads/campaigns`)

The same operations register on the hosted MCP server so Cursor and other inbound agents can use a connected Zernio key. If the org has one valid connection, MCP tools use it. If there are several, the caller passes `connectionId`.

## Alternatives considered

1. **WorkOS Pipes** — rejected. Zernio is not in the Pipes catalog.
2. **Official `@zernio/node` SDK** — deferred. A thin `fetch` client keeps tests mockable and avoids a generated client in the web bundle.
3. **Generic MCP Server row only** — rejected. Zernio has no public MCP server. Ads need a named tool and a fixed REST base URL.

## Consequences

- Integrations shows Zernio under SEO tools, next to Semrush.
- Automations can add a Zernio tool and pick a connection.
- Hosted `/mcp` agents can list accounts and create ads after the org connects a key.
