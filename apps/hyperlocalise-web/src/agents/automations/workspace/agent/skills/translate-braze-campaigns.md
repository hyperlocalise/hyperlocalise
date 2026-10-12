---
id: translate-braze-campaigns
name: Translate Braze Campaigns & Canvas
description: Import tagged draft campaign and Canvas message variations as JSON, localise in Jobs, then push approved locales through the Braze Translation API.
category: popular
---

## Translate Braze Campaigns & Canvas

Import changed Braze campaign and Canvas draft message variations into the attached native project and open translation jobs for mapped target locales.

- Import runs on schedule, when an operator clicks **Run now**, or from Content Editor **Ingest**.
- Write one JSON source file per campaign message variation at `braze/campaigns/{campaign-slug}/{variation-slug}.json`.
- Write one JSON source file per Canvas message variation at `braze/canvas/{canvas-slug}/{step-slug}/{variation-slug}.json`.
- File body is the Braze `translation_map` only. Surrounding untagged HTML and Liquid stay in Braze.
- Import drafts only, including post-launch drafts. Skip archived, live-only, and messages without multi-language setup.
- Seed existing Braze locale maps per the configured policy. The default only fills empty locales.
- Open jobs only for locales that still need translation. Do not write back to Braze during import.
- Operators enqueue **Push to Braze** separately. That action PUTs approved locales by Braze locale UUID. It never rewrites message HTML and never publishes.
