# Braze Campaigns and Canvas

## Status

Accepted. Implemented as `translate-braze-campaigns` on the HL-861 Braze
connection.

## Date

2026-10-12

## Context

Crowdin’s Campaigns & Canvas app writes tagged draft strings through the
Braze Translation API. Email Templates writes locale-suffixed library
HTML copies. Those write-backs must stay on separate automations.

## Decision

1. Store campaign/Canvas settings in `toolConfig.brazeCampaigns`. Do not
   reuse `toolConfig.braze`. Reject attaching both Braze skills on one
   automation.
2. Import tagged draft message variations as JSON `translation_map`
   files (`braze/campaigns/…json`, `braze/canvas/…json`). Do not wrap
   campaign copy in the Email Templates HTML envelope.
3. Push approved locales with `PUT /campaigns/translations` and
   `PUT /canvas/translations`. Locale IDs are Braze UUIDs from GET
   translations. Never send `fr-FR` as `localeId`. Never rewrite
   message HTML. Never publish.
4. Import drafts only, including post-launch drafts. Skip archived,
   live-only, and messages without multi-language setup.
5. Content Editor **Ingest** queues the same manual run as Automations
   **Run now** (no `operation: "push_approved"`). **Push to Braze**
   stays a separate write-back.

## Alternatives considered

1. **HTML files like Email Templates** — rejected. Crowdin syncs the
   translation map, not surrounding message HTML.
2. **One Braze toolConfig flag** — rejected. The orchestrator would
   route campaign automations to template import/push.

## Consequences

- Connect-time pings stay list-only. Missing details/translations
  permissions fail at import or push.
- Project locale tags map to Braze UUIDs by `locale.name` or
  `locale_key`. No language fallback.
