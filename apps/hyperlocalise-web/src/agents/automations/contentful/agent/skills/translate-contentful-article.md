---
id: translate-contentful-article
---

## Contentful article translation procedure

1. Call `fetch_entry` to load the entry and content type.
2. Call `list_translatable_fields` to discover translatable text and image fields.
3. For each text field and target locale that needs translation, call `translate_string` with the source text, locales, and binding context from your instructions.
4. When image fields need localization, call `localize_asset` per asset and locale.
5. When QA is enabled, call `run_qa` on translated text before writeback.
6. When writeback is enabled, call `write_drafts` with accumulated translations.
7. Summarize fields translated, QA findings, and draft writeback results.

Preserve placeholders, links, product terms, glossary terms, tone, and rich text structure.
