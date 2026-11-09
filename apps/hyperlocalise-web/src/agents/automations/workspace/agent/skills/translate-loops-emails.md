---
id: translate-loops-emails
name: Translate Loops Emails
description: Import Loops transactional, campaign, and workflow emails into a native project on a schedule, localise HTML in Jobs, then push approved locales as unpublished locale copies.
category: popular
---

## Translate Loops Emails

Import changed Loops emails into the attached native project and open translation jobs for configured target locales.

- Import runs on schedule or when an operator clicks **Run now**.
- Write one HTML source file per email at `loops/transactional/{slug}.html`, `loops/campaigns/{slug}.html`, or `loops/workflows/{workflow}/{slug}.html` with `subject`, `previewText`, and one `segment-N` block per LMX text run.
- Protect `{data.*}`, `{contact.*}`, and `{event.*}` variables as HTML comments before ingest so translators do not break personalization.
- Skip names that already look like locale copies (`Name [fr-FR]`) and skip legacy MJML messages that return 409.
- Open jobs only for locales that still need translation. Do not push copies during import.
- Operators enqueue **Push to Loops** separately. That action creates or updates unpublished locale copies named `{source} [{locale}]` with `languageCode` set. It never updates the source email and never publishes, schedules, or sends.
- Workflow sources land as unpublished transactional copies named `{workflow} / {email} [{locale}]` because Loops has no safe duplicate-workflow endpoint for live triggers.
