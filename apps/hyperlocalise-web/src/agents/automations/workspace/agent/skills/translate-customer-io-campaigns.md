---
id: translate-customer-io-campaigns
name: Translate Customer.io Campaigns, Broadcasts, Newsletters & Transactional
description: Import Customer.io campaign, broadcast, newsletter, and transactional message actions as JSON, localise in Jobs, then push approved locales back to Customer.io.
category: popular
---

## Translate Customer.io Campaigns, Broadcasts, Newsletters & Transactional

Import changed Customer.io campaign, broadcast, newsletter, and transactional message actions into the attached native project and open translation jobs for mapped target locales.

- Import runs on schedule, when an operator clicks **Run now**, or from Content Editor **Ingest**.
- Write one JSON source file per broadcast action at `customer-io/broadcasts/{broadcast-slug}/actions/{action-slug}.json` — except email actions, which save as HTML (see below).
- Write one JSON source file per campaign action at `customer-io/campaigns/{campaign-slug}/{action-slug}.json` — except email actions.
- Write one HTML source file per email action at `customer-io/{broadcasts|campaigns|newsletters|transactional}/{slug}/{actions|contents}/{action-slug}.html`, with the body as HTML and subject/preheader as field blocks. Email files open in HTML File view.
- Write one JSON source file per newsletter content variant at `customer-io/newsletters/{newsletter-slug}/contents/{content-slug}.json`.
- Write one JSON source file per transactional message content variant at `customer-io/transactional/{message-slug}/contents/{content-slug}.json`.
- Only email (rich-text/code editor), push, Twilio SMS, and Slack actions are eligible. Skip drag-and-drop emails, transactional SMS, in-app messages, and multilingual A/B variants. Newsletter and transactional messages with several default variants (A/B tests) import each variant but are skipped on push.
- Map Hyperlocalise project locales to Customer.io locales with `mapProjectLocalesToCustomerIo`; skip project locales without a matching Customer.io locale and report them as unmapped.
- Open jobs only for locales that still need translation. Do not write back to Customer.io during import.
- Operators enqueue **Push to Customer.io** separately. That action PUTs approved locales for actions that already have the locale configured. It never publishes, and for transactional messages it never sends.
