# Braze WorkOS Pipes Design

## Date

2026-10-11

## Context

Braze automations need a REST API key and the instance host (for example
`https://rest.iad-03.braze.com`). WorkOS Pipes stores API keys per user and org.
The key alone cannot call Braze. Intercom probes `us` / `eu` / `au` at runtime;
Braze has many cluster hosts, so that probe does not apply.

## Decision

Connect Braze through WorkOS Pipes for the REST API key. Persist the allowlisted
cluster key on `braze_connection_settings`, keyed by
`(organization_id, workos_user_id)`.

- Add slug `braze` to `PIPES_PROVIDER_SLUGS`.
- Render `BrazeConnectionPanel`: WorkOS `<Pipes>` widget for the key, plus a
  cluster picker.
- Reuse `GET /api/orgs/:slug/pipes/braze` for connection status. Do not change
  `PipesConnectionStatus`.
- Add `GET` / `PUT` / `DELETE /api/orgs/:slug/braze` for the host.
- Disconnect (widget or `DELETE /pipes/braze`) deletes that user's settings row.
- Later automations load `loadPipesApiKey("braze")` and the stored host.

Do not store the API key in Postgres. Do not call Braze to validate the key in
this change.

## Consequences

- Dashboard setup is required: enable Braze as an API-key data integration with
  slug `braze`. Request a custom slug if WorkOS has no catalog entry. Widget
  origin and Pipes widget permission already apply to other providers.
- Campaign, Canvas, and email-template import stay on later tickets.
