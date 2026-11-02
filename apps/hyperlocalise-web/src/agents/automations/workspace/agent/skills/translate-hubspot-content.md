---
id: translate-hubspot-content
name: Translate HubSpot content
description: Import HubSpot emails, blog posts, and forms into a native project, localise in Jobs, then push approved locales as unpublished copies.
category: popular
---

## Translate HubSpot content

Import primary HubSpot emails, blog posts, and forms into the attached native project and open translation jobs for mapped target locales.

- Import runs on schedule or when an operator clicks **Run now**.
- Write emails at `hubspot/emails/{id}/{slug}.html`.
- Write blog posts at `hubspot/blog-posts/{id}/post.html`.
- Write forms at `hubspot/forms/{id}/{slug}.json`.
- Landing pages and website pages are temporarily unsupported and are skipped.
- Skip names that already look like locale copies (`Welcome [fr-FR]`).
- Leave field names, widget ids, URLs, and colors locked. Do not write anything to HubSpot during import.
- Operators enqueue **Push to HubSpot** separately. That action creates or updates unpublished locale copies named `{source} [{locale}]`. For emails, push clones the source and writes a draft with the target language. For blog posts, the operator adds the languages on the blog first (**Settings → Blog → Add/edit multi-language variations**). When that language is on the blog, push creates an unpublished post draft. It does not add a language to the blog. A missing language skips that locale with a warning; the run still succeeds. For forms, push creates a new form or replaces the existing locale copy. It never edits the source object and never publishes.
