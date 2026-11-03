# Mailchimp campaigns and user templates

## Status

Accepted. Implemented on the Mailchimp integration branch. Product
docs live on one page, `docs/platform/connections/mailchimp.mdx`.

## Date

2026-11-03

## Context

Mailchimp exposes many Marketing API surfaces. Operators asked for
the same pattern as Loops and HubSpot: import HTML into a native
project, translate in Jobs, push approved locales as separate copies,
and never send from Hyperlocalise.

Mailchimp’s npm SDK (`@mailchimp/mailchimp-marketing`) is unreliable
to install in CI; the Marketing API 3.0 REST reference is stable and
documented for agents at
[mailchimp.com/developer/llms.txt](https://mailchimp.com/developer/llms.txt).

## Decision

Implement one workspace skill, **Translate Mailchimp content**
(`translate-mailchimp-content`), for **regular campaigns** and **user
HTML templates** only (v1). Saved drag-and-drop user templates
(`content_type: template` or `multichannel`) are out of scope because
the Marketing API does not expose exportable HTML for them; operators
localise those emails via **campaign** import instead.

1. Import as HTML source files at `mailchimp/campaigns/` and
   `mailchimp/templates/`. Wrap subject, preview text, from name, and
   body in an HTML envelope with `data-hl-mailchimp-field` blocks.
   Protect `*|MERGE|*` tags during translation.
2. Push approved locales as draft copies named `{source} [{locale}]`.
   Campaign push creates or updates a `save` regular campaign and sets
   content through the Marketing API. Template push creates or updates
   user templates. Never send, schedule, or mutate the source object.
3. Call Mailchimp only through `fetch` to
   `https://{dc}.api.mailchimp.com/3.0` in
   `apps/hyperlocalise-web/src/lib/mailchimp/client.ts`. Do not add
   `@mailchimp/mailchimp-marketing` or vendored SDK copies.
4. Connect with OAuth only through WorkOS Pipes slug `mailchimp`.
   Load access tokens with `loadPipesAccessToken`, resolve the account
   Marketing API base URL from `GET https://login.mailchimp.com/oauth2/metadata`,
   then call the API with `Authorization: Bearer`. Mount a custom
   **Integrations → Mailchimp** panel (HubSpot-style OAuth popup); keep
   `mailchimp` off the generic Pipes widget list.
5. Track mappings in `mailchimp_content_sync_states`. Expose
   `GET/PUT /api/orgs/:slug/mailchimp` and `GET .../mailchimp/library`
   for the connection panel and automation resource tree.
6. One automation template, mutually exclusive with HubSpot, Braze,
   Customer.io, Iterable, and Loops tools on the same automation.

## Alternatives considered

1. **Official TypeScript SDK** — rejected. Publish and install are
   brittle; REST matches other Pipes API-key integrations and the agent
   skill documents endpoints directly.
2. **Audiences, automations, and transactional** — deferred. Campaigns
   and templates cover the first marketing-email workflow without
   branching into list management or send orchestration.
3. **In-place locale variants on the source campaign** — rejected.
   Separate draft copies keep the source untouched and match Loops and
   HubSpot copy naming.

## Consequences

- Operators connect with OAuth only; API keys are not accepted in the
  product UI or automation credential loader.
- Dashboard setup requires enabling Mailchimp as a Pipes OAuth
  integration with slug `mailchimp`.
- Push eligibility and `queueMailchimpPushRun` follow the same
  `push_approved` run contract as HubSpot and Loops; Content Editor
  actions can attach when product wires the queue helper into the
  header UI.
- REST client code lives under `apps/hyperlocalise-web/src/lib/mailchimp/`;
  product docs in `docs/platform/connections/mailchimp.mdx`.
- Template importability is gated on Mailchimp `content_type: html` and
  API HTML availability; non-importable templates surface in the library
  API and automation tree but cannot be selected for import.
