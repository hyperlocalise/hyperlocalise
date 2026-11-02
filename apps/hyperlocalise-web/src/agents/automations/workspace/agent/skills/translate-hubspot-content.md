---
id: translate-hubspot-content
name: Translate HubSpot content
description: Import HubSpot blog posts into a native project, localise in Jobs, then push approved locales as unpublished drafts.
category: popular
---

## Translate HubSpot content

Import primary HubSpot blog posts into the attached native project and open translation jobs for mapped target locales.

- Import runs on schedule or when an operator clicks **Run now**.
- Write blog posts at `hubspot/blog-posts/{id}/post.html`.
- Emails, forms, landing pages, and website pages are temporarily unsupported and are skipped.
- Skip names that already look like locale copies (`Welcome [fr-FR]`).
- Leave field names, widget ids, URLs, and colors locked. Do not write anything to HubSpot during import.
- Operators enqueue **Push to HubSpot** separately. That action creates or updates unpublished locale copies named `{source} [{locale}]`. The operator adds the languages on the blog first (**Settings → Blog → Add/edit multi-language variations**). When that language is on the blog, push creates an unpublished post draft. It does not add a language to the blog. A missing language skips that locale with a warning; the run still succeeds. It never edits the source object and never publishes.
