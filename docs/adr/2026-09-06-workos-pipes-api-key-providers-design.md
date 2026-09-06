# WorkOS Pipes API-key providers

## Date

2026-09-06

## Context

Ahrefs already connects through WorkOS Pipes. The WorkOS Dashboard now also has API-key integrations for Intercom, SendGrid, Similarweb, Resend, Webflow, HubSpot, Mailchimp, Atlassian, Sanity, and Notion.

Intercom still stored access tokens in `intercom_connections`. The other providers were coming-soon rows or missing from the catalog.

## Decision

Reuse the Ahrefs Pipes path for every API-key provider in that set.

- Add the WorkOS slugs to `PIPES_PROVIDER_SLUGS`.
- Load status and credentials through shared `lib/pipes/accounts.ts`.
- Render one `PipesConnectionPanel` per slug, filtered to that provider.
- Keep `GET /api/orgs/:slug/pipes/:provider`.
- Mark Intercom's local connection table and CRUD routes deprecated. Do not backfill.

Ahrefs automations stay as they are. This change does not add agent tools for the new providers.

## Consequences

- Credentials live in WorkOS, scoped to the user who connected the provider.
- Dashboard setup is required: enable each catalog provider, keep the custom `ahrefs` slug, allow the widget origin, and grant Pipes widget permission on roles that manage integrations.
- Later automations can call `loadPipesApiKey` with the provider slug instead of adding another encrypted table.
