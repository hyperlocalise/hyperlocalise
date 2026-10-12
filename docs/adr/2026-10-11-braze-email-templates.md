# Braze Email Templates

## Status

Accepted. Implemented by the **Translate Braze Email Templates** workspace
automation: import writes HTML sources, CAT approves HTML units, and
**Push to Braze** writes locale-suffixed library copies. It never updates
the source template and never publishes.

## Date

2026-10-11

## Context

HL-861 stored a Braze REST API key in WorkOS Pipes and the cluster on
`braze_connection_settings`. Operators still needed an Intercom-shaped skill
that imports Braze Templates API resources into a native project and pushes
approved locales back.

The official Templates API is eight endpoints only: list/get/create/update for
`/templates/email` and `/content_blocks`. Campaigns, Canvas, Connected Content,
drag-and-drop email, and marketplace listing stay out of this change.

Braze has no per-locale `translated_content` on a template. The library is a
flat list of named copies. Locale write-back therefore creates or updates
`Template_Name_fr-FR`, not the source.

The connection itself stays on WorkOS Pipes. This ADR covers the file shape,
import, CAT eligibility, and copy write-back only.

## Decision

Ship one workspace skill, `translate-braze-email-templates`.

### Import

Import on schedule or **Run now**. Push only when `operation=push_approved`.
Import never writes to Braze.

Import writes one HTML file per resource:

```text
braze/templates/{template-slug}.html
braze/content-blocks/{block-slug}.html
```

Email files store `subject`, `preheader`, `body`, and optional
`plaintext_body` in `data-hl-braze-field` blocks. Content Blocks store
`content`. Ingest is native HTML. Liquid is protected as
`<!--HL_BRAZE_LIQUID_n-->` so translators do not break personalization.

Skip drag-and-drop email templates and names that already look like locale
copies (`Template_Name_fr-FR`). Persist sync state on
`braze_template_sync_states` and watermarks on `braze_sync_cursors`.

Existing-translation policy defaults to `seed_empty`. A later import still
checks mapped target locales when the source has not changed. If Braze
already has a locale-suffixed copy, import can seed that copy as an approved
translation. `seed_empty` never overwrites work already in Hyperlocalise.

### Approval and push

CAT eligibility requires at least one mapped locale approved. It does not
require every visible unit on every locale.

**Push to Braze** is a separate operator action on the Content Editor header
and the automation. It is not part of import or the schedule.

Push creates or updates locale-suffixed library copies. Never update the
source. Never publish. Content Block creates use `state=draft`. If a copy is
already active, update content only.

A later push skips a locale whose approved hash matches the last successful
push. When `overwriteWhenRemoteNewer` is off, it also skips a locale whose
remote copy is newer than the last successful push.

Braze copy suffixes are the native project locale tags (`fr-FR` writes
`Template_Name_fr-FR`). Keep locked writing-system and regional pairs
separate when checking source compatibility (`en-US` is not `en-GB`,
`zh-CN` is not `zh-TW`, `pt` is not `pt-BR`).

## Alternatives considered

1. **Write Intercom-style `translated_content` on the source** — rejected.
   The Templates API has no locale bag. Copies are named library items.
2. **Update the source template on push** — rejected. The source stays the
   default-language original. Operators review copies in Braze.
3. **Publish on push** — rejected. Content Block creates stay draft.
   Operators publish in Braze.
4. **Campaigns and Canvas in the same skill** — rejected. Those APIs are
   HL-862.

## Consequences

- Operators connect Braze (HL-861), attach the skill, then use
  **Push to Braze** from CAT when approved locales are ready.
- Customer docs describe HTML sources at `braze/templates/` and
  `braze/content-blocks/`, locale-suffixed copies, and **Push to Braze**.
- The workspace skill `translate-braze-email-templates.md` is the operator
  contract for the agent.
- Email-template localisation is this skill, not `kind: "content_sync"`.
- Campaigns and Canvas remain HL-862. Product docs treat them as a
  second, upcoming model. See
  [Braze localisation models](./2026-10-11-braze-localisation-models.md).
