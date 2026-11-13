---
id: translate-webflow-items
name: Translate Webflow CMS items
description: Import Webflow CMS collection items into a native project on a schedule, localise in Jobs, then push approved translations when you are ready.
category: popular
---

## Translate Webflow CMS items

Import changed Webflow CMS collection items into the attached native project and open translation jobs for configured target locales.

- Import runs on schedule or when an operator clicks **Run now**.
- Write one JSON source file per item at `webflow/{siteId}/{collectionId}/{slug}.json`.
- Map project locales onto Webflow CMS locale tags. Skip targets that are unmapped or disabled on the site.
- The Webflow primary locale must match the project source locale when saving the automation.
- Do not push translations to Webflow during import.
- Operators enqueue **Push to Webflow** separately. That action PATCHes staged secondary locales and publishes when configured.
