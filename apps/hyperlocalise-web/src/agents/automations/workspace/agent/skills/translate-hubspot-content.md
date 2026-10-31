---
id: translate-hubspot-content
name: Translate HubSpot content
description: Import HubSpot marketing emails, forms, blog posts, landing pages, and website pages into a native project, localise in Jobs, then push approved locales as unpublished copies.
category: popular
---

## Translate HubSpot content

Import primary HubSpot marketing emails, forms, blog posts, landing pages, and website pages into the attached native project and open translation jobs for mapped target locales.

- Import runs on schedule or when an operator clicks **Run now**.
- Write marketing emails at `hubspot/emails/{id}/{slug}.html`, forms at `hubspot/forms/{id}/{slug}.json`, and blog posts at `hubspot/blog-posts/{id}/{slug}.json`.
- Write landing pages at `hubspot/landing-pages/{id}/{slug}.json` and website pages at `hubspot/website-pages/{id}/{slug}.json`.
- Skip names that already look like locale copies (`Welcome [fr-FR]`). Skip blog posts and pages that are already language variations.
- Leave field names, widget ids, URLs, and colors locked. Do not write anything to HubSpot during import.
- Operators enqueue **Push to HubSpot** separately. That action creates or updates unpublished locale copies named `{source} [{locale}]`. It never edits the source object and never publishes or sends.
