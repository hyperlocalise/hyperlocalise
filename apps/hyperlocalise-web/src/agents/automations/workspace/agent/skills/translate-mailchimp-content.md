---
id: translate-mailchimp-content
name: Translate Mailchimp content
description: Import Mailchimp regular campaigns and code-your-own HTML templates into a native project, localise in Jobs, then push approved locales as draft copies.
category: popular
---

## Translate Mailchimp content

Import Mailchimp regular campaigns and **code-your-own HTML** user templates into the attached native project and open translation jobs for mapped target locales.

- Import runs on schedule or when an operator clicks **Run now**.
- Write campaigns at `mailchimp/campaigns/{id}/{slug}.html` (includes rendered HTML for drag-and-drop campaign designs).
- Write HTML user templates at `mailchimp/templates/{id}/{slug}.html` only when Mailchimp `content_type` is `html`.
- Do not import saved drag-and-drop user templates (`content_type: template` or `multichannel`); the Marketing API does not expose HTML. Localise those emails by importing the **campaign** that uses the layout instead.
- Skip names that already look like locale copies (`Welcome [fr-FR]`).
- Protect merge tags and locked HTML envelope fields during translation.
- Operators enqueue **Push to Mailchimp** separately. Push creates draft campaigns or updates/creates HTML user templates named `{source} [{locale}]`. It never sends, schedules, or edits the source object.
