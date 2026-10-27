---
id: translate-customer-io-campaigns
name: Translate Customer.io Campaigns & Broadcasts
description: Import Customer.io campaign and broadcast message actions as JSON, localise in Jobs, then push approved locales back to Customer.io.
category: popular
---

## Translate Customer.io Campaigns & Broadcasts

Import changed Customer.io campaign and broadcast message actions into the attached native project and open translation jobs for mapped target locales.

- Import runs on schedule, when an operator clicks **Run now**, or from Content Editor **Ingest**.
- Write one JSON source file per broadcast at `customer-io/broadcasts/{broadcast-slug}.json`.
- Write one JSON source file per campaign action at `customer-io/campaigns/{campaign-slug}/{action-slug}.json`.
- Only email (rich-text/code editor), push, Twilio SMS, and Slack actions are eligible. Skip drag-and-drop emails, transactional SMS, in-app messages, and multilingual A/B variants.
- Map Hyperlocalise project locales to Customer.io locales with `mapProjectLocalesToCustomerIo`; skip project locales without a matching Customer.io locale and report them as unmapped.
- Open jobs only for locales that still need translation. Do not write back to Customer.io during import.
- Operators enqueue **Push to Customer.io** separately. That action PUTs approved locales for actions that already have the locale configured. It never publishes.
