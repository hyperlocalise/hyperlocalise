---
id: translate-braze-email-templates
name: Translate Braze Email Templates
description: Import Braze email templates and Content Blocks into a native project on a schedule, localise HTML in Jobs, then push approved locales as library copies.
category: popular
---

## Translate Braze Email Templates

Import changed Braze email templates and Content Blocks into the attached native project and open translation jobs for configured target locales.

- Import runs on schedule or when an operator clicks **Run now**.
- Write one HTML source file per email template at `braze/email/{template-slug}.html` with `subject`, `preheader`, `body`, and optional `plaintext_body` field blocks.
- Write one HTML source file per Content Block at `braze/content-block/{block-slug}.html`.
- Protect Liquid (`{{ }}` and `{% %}`) as HTML comments before ingest so translators do not break personalization.
- Skip drag-and-drop email templates and skip names that already look like locale copies (`Template_Name_fr`).
- When a mapped target locale already has a locale-suffixed Braze copy, import that copy as an approved translation. The default only fills empty locales.
- Open jobs only for locales that still need translation. Do not push copies during import.
- Operators enqueue **Push to Braze** separately. That action creates or updates locale-suffixed library copies (`Template_Name_fr`). It never updates the source template and never publishes.
