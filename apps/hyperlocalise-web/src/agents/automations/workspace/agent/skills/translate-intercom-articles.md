---
id: translate-intercom-articles
name: Translate Intercom Help Center articles
---

## Translate Intercom Help Center articles

Import changed Help Center articles into the attached native project and open translation jobs for configured target locales.

- Import runs on schedule or when an operator clicks **Run now**.
- Write one JSON source file per article at `intercom/{help-center-id}/{article-id}.json` with `title`, `description`, and `body`.
- Match project locales to Intercom Help Center locale codes exactly. Do not treat `en` and `en-US` as the same locale.
- Do not push translations to Intercom during import.
- Operators enqueue **Push to Intercom** separately. That action writes Intercom `translated_content` drafts. It does not publish.
