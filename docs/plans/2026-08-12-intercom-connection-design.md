# Intercom connection (org credentials)

## Problem

Teams want to connect Intercom workspaces so Hyperlocalise can later read and
localise Help Center content. v1 only needs a durable, validated connection:
access token plus the regional REST endpoint.

## Decision

Mirror Ahrefs/Semrush org connections. Store encrypted access tokens in
`intercom_connections`. Require a regional REST endpoint from the three hosts
documented by Intercom. Validate on save with the official `intercom-client`
Node SDK. Do not add automation tools or Articles sync in this change.

### Org-level: `intercom_connections`

| Field | Secret? | Notes |
|-------|---------|-------|
| `display_name` | no | Label in Integrations |
| `rest_endpoint` | no | `us` \| `eu` \| `au` |
| ciphertext / iv / auth_tag / key_version / encryption_algorithm | yes | AES-256-GCM via `PROVIDER_CREDENTIALS_MASTER_KEY` |
| `masked_access_token_suffix` | no | UI hint only |
| `enabled`, `validation_status`, `validation_message`, `last_validated_at` | no | Connection health |

Endpoint allowlist:

| `rest_endpoint` | Base URL |
|-----------------|----------|
| `us` | `https://api.intercom.io` |
| `eu` | `https://api.eu.intercom.io` |
| `au` | `https://api.au.intercom.io` |

Never accept a free-form base URL. Never return the access token from list or
create responses. Decrypt only on the server when validating or (later) opening
an Intercom client.

### Client

Wrap `intercom-client` (`IntercomClient`) with the chosen regional base URL.
Validate credentials by calling the `/me` identity endpoint (or the SDK
equivalent). Map failures to stable `Result` error codes.

### API

`/api/orgs/:organizationSlug/intercom-connections`

- `GET` — list summaries
- `POST` — create (`displayName`, `accessToken`, `restEndpoint`)
- `PATCH /:id` — update name / token / endpoint / enabled
- `DELETE /:id` — delete

Re-validate when the token or endpoint changes. Capabilities match other
integrations: `integrations:read` and `provider_credentials:write`.

### UI

Add an Intercom panel on the Integrations page: display name, access token,
REST endpoint select (US / Europe / Australia). Show masked suffix and region
on existing rows.

## Out of scope

- Workspace automation `toolConfig.intercom`
- Agent tools that call Intercom APIs
- Help Center / Articles sync into localisation jobs
- OAuth app install flow

## Alternatives considered

1. **Generic `connectors` row** — rejected; that path fits OAuth bots, not
   encrypted token + region validation.
2. **Hand-rolled `fetch` client** — rejected; the product asks for the Node SDK.
3. **Full Articles sync in v1** — deferred; connection storage is the first
   slice and unblocks later sync work.
