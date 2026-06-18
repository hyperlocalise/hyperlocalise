---
id: translate-contentful-article
name: Translate Contentful article
category: popular
defaultTrigger: contentful
executorAgent: contentful
executorSkill: translate-contentful-article
activatable: true
---

Translate Contentful help center article updates into the configured target locales.

Workflow:

- Read the updated entry and metadata from Contentful.
- Detect translatable title, body, SEO, tags, CTA fields, and localized image assets.
- Localize embedded or linked images when the entry contains image content.
- Preserve placeholders, links, product terms, glossary terms, tone, and rich text structure.
- Run QA checks before writeback.
- Write localized fields back as Contentful drafts for review. Do not publish.
