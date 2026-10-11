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
- Render `BrazeConnectionPanel` like Crowdin: Connect expands an inline form
  with the API key and REST cluster. Save writes the key with
  `workos.pipes.updateDataIntegrationApiKey` and the cluster locally.
- Reuse `GET /api/orgs/:slug/pipes/braze` for connection status. Do not change
  `PipesConnectionStatus`.
- `PUT /api/orgs/:slug/braze` accepts `restEndpoint` and an optional `apiKey`.
  The key is required when Pipes is not connected. Do not persist `apiKey`.
- Disconnect (`DELETE /pipes/braze`) deletes that user's settings row.
- Later automations load `loadPipesApiKey("braze")` and the stored host.

Do not store the API key in Postgres. Do not call Braze to validate the key in
this change. Do not embed the Pipes widget or start the authorize redirect.

## Consequences

- Dashboard setup is required: enable Braze as an API-key data integration with
  slug `braze`. Request a custom slug if WorkOS has no catalog entry.
- One Pipes connection serves both Crowdin-shaped Braze skills. See
  [Braze localisation models](./2026-10-11-braze-localisation-models.md).
- Email-template import and **Push to Braze** shipped as
  `translate-braze-email-templates`. See
  [Braze Email Templates](./2026-10-11-braze-email-templates.md).
- Campaigns and Canvas remain HL-862.
