---
id: translate-mailchimp-content
name: Translate Mailchimp content
description: Import Mailchimp campaigns and user templates into a native project, localise in Jobs, then push approved locales as draft copies.
category: popular
---

## Translate Mailchimp content

Import Mailchimp regular campaigns and user templates into the attached native project and open translation jobs for mapped target locales.

- Import runs on schedule or when an operator clicks **Run now**.
- Write campaigns at `mailchimp/campaigns/{id}/{slug}.html`.
- Write templates at `mailchimp/templates/{id}/{slug}.html`.
- Skip names that already look like locale copies (`Welcome [fr-FR]`).
- Protect merge tags and locked HTML envelope fields during translation.
- Operators enqueue **Push to Mailchimp** separately. Push creates draft campaigns or updates/creates user templates named `{source} [{locale}]`. It never sends, schedules, or edits the source object.
