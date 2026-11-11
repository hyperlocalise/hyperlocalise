# Braze localisation models

## Status

Accepted. Product docs follow Crowdin’s two Braze apps. Email Templates
(HL-863) and Campaigns & Canvas (HL-862) are implemented.

## Date

2026-10-11

## Context

[Crowdin’s Braze partner page](https://www.braze.com/docs/partners/message_personalization/localization/crowdin)
ships two apps against one Braze account:

| App | Writes to Braze |
| --- | --- |
| Email Templates | Locale-suffixed library copies (`Template_Name_fr-FR`) |
| Campaigns & Canvas | Multi-language variants on tagged draft messages |

Mixing those write-backs in one skill would hide which Braze surface
operators are changing. Hyperlocalise already stores one Pipes API key
and REST cluster (HL-861). Skills share that connection.

## Decision

Document and implement two Intercom-shaped workspace skills on the same
Braze connection.

1. **Translate Braze Email Templates** (`translate-braze-email-templates`,
   HL-863). Import HTML from `/templates/email` and `/content_blocks`.
   Push creates or updates library copies. Never update the source.
   Never publish. See [Braze Email Templates](./2026-10-11-braze-email-templates.md).
2. **Translate Braze Campaigns & Canvas** (`translate-braze-campaigns`,
   HL-862). Import tagged draft campaign and Canvas message variations
   as JSON `translation_map` files. Push writes Braze multi-language
   variants through the Translation API. Import and push never publish
   a live send. See [Braze Campaigns and Canvas](./2026-10-12-braze-campaigns-and-canvas.md).

Customer help uses Crowdin’s comparison table (Campaigns, Canvas steps,
email templates, Content Blocks).

Do not add a Store checkbox UI, marketplace listing, or Connected
Content in either skill.

## Alternatives considered

1. **One Braze skill for every surface** — rejected. The Templates API
   and Campaigns/Canvas APIs write different objects. Operators need to
   pick the model before they import.
2. **Campaigns first** — rejected. Email Templates is the shipped skill
   on this branch. Campaigns stay HL-862.

## Consequences

- One **Integrations → Braze** row. Two automations later.
- Product docs live on one page, `docs/platform/connections/braze.mdx`.
- API keys created for Email Templates should already include campaigns
  and Canvas so the same connection works for both skills. Save pings
  `templates.email.list`, `content_blocks.list`, `campaigns.list`, and
  `canvas.list` before the key is stored. Campaigns import and push also
  need details and translations get/update permissions.
