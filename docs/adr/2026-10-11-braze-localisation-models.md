# Braze localisation models

## Status

Accepted. Product docs follow Crowdin’s two Braze apps. Email Templates
(HL-863) is implemented. Campaigns & Canvas (HL-862) is upcoming.

## Date

2026-10-11

## Context

[Crowdin’s Braze partner page](https://www.braze.com/docs/partners/message_personalization/localization/crowdin)
ships two apps against one Braze account:

| App | Writes to Braze |
| --- | --- |
| Email Templates | Locale-suffixed library copies (`Template_Name_fr`) |
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
   HL-862). Upcoming. Import draft campaigns and Canvas steps that use
   `{% translation id %}` tags. Push writes Braze multi-language
   variants. Import and push never publish a live send.

Customer help uses Crowdin’s comparison table (Campaigns, Canvas steps,
email templates, Content Blocks) and marks Campaigns & Canvas upcoming.

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
  and Canvas so the same connection works when HL-862 ships.
