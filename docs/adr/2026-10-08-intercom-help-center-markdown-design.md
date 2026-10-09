# Intercom Help Center articles as markdown

## Status

Accepted. Implemented by the **Translate Intercom Help Center articles** workspace
automation: import writes markdown sources, CAT approves keyed units, and
**Push to Intercom as draft** writes Intercom `translated_content` drafts.

## Context

Early Help Center copy treated each Intercom article as a JSON source at
`intercom/{help-center-id}/{article-id}.json` with `title`, `description`, and
`body` keys. That contract does not match how Intercom or the Content Editor
work:

- Intercom Articles REST 2.16 exposes `body_markdown`. HTML `body` and
  `body_markdown` are mutually exclusive on write. List payloads often omit
  markdown; `GET /articles/{id}` is required to read it.
- Native markdown already opens in the document Content Editor and is parsed
  into CAT keys (`md.frontmatter/*`, headings, paragraphs). A three-key JSON
  file would force a different approval model and a different editor.
- Push eligibility that only looked for document variants or JSON keys hid
  **Push to Intercom as draft** after CAT approved every visible markdown unit.
- CAT display that left source `MD#0` chips next to a target `[title](url)`
  made the same link look like two different strings.

The connection itself stays on WorkOS Pipes. This ADR covers the article file
shape, CAT compose, and draft write-back only.

## Decision

### Source files

Import writes one markdown file per article:

```text
intercom/{help-center-slug}/{article-title-slug}.md
```

YAML frontmatter holds `title` and `description`. The document body is the
Intercom `body_markdown` (newlines as stored by Intercom, not JSON `\n`
escapes). Import never publishes. A later import skips an article whose
source hash has not changed.

Persisted `.json` mappings from the earlier contract remap to `.md` on the
next import. New writes do not use JSON article keys.

### Parser and editor

The markdown parser protects Intercom Kramdown heading ids (`{#h_…}`) and
leaves `:::callout` fences intact so draft push can send Intercom’s flavor
back. Opening `:::callout …` and closing `:::` lines are not CAT units; only
the callout body is translated. The document editor hides those heading ids
in preview and renders callouts. CAT expands protected markup so source and
translation display the same `[text](url)` form; QA recovers tokens so
required-placeholder checks do not fire on expanded links.

### Approval and compose

CAT stores approved units under markdown keys, not JSON field names. Push
eligibility composes `title`, `description`, and `body` from those approved
units plus the source markdown:

- Every visible unit for that locale must be approved, including the title
  (`md.frontmatter/title` or `frontmatter/title`).
- Units apply left to right. Internal markup sentinels expand from the
  companion source delimiters before the article is parsed.
- A stored target document variant still wins when one exists. Otherwise the
  composed article is the push payload.
- Compose fails closed when a visible unit is missing, empty, or cannot be
  placed back into the source markdown.

### Draft push

**Push to Intercom as draft** is a separate operator action on the Content
Editor header and the automation. It is not part of import or the schedule.

The write uses `translated_content.{locale}` with `body_markdown` and
`state: "draft"`. It does not publish. A later push skips a locale whose
approved hash matches the last successful push unless overwrite is enabled
for newer Intercom drafts.

Project locales map onto Help Center locales by exact tag first, then
language-only aliases such as `en` ↔ `en-US` and `de-DE` ↔ `de` when only
one regional form is present. Keep locked writing-system and regional pairs
separate (`en-US` is not `en-GB`, `zh-CN` is not `zh-TW`, `pt-BR` is not
`pt`, and `de` is not `de-form`).

## Alternatives considered

1. **Keep the JSON article contract** — rejected. It diverges from Intercom
   `body_markdown` and from CAT markdown keys, so approvals never made a
   locale eligible to push.
2. **Push HTML `body`** — rejected. Intercom treats `body` and
   `body_markdown` as mutually exclusive; sending HTML would drop the
   markdown Intercom already stores.
3. **Publish on push** — rejected. Operators review drafts in Intercom
   before they go live.

## Consequences

- Customer docs describe markdown sources and **Push to Intercom as draft**,
  not JSON article files.
- The workspace skill
  `translate-intercom-articles.md` is the operator contract for the agent.
- Help Center localisation is this skill, not `kind: "content_sync"` from
  the project content-sync ADR.
- Internal helpers live under `article-markdown.ts` and
  `keyed-article-compose.ts`. Do not reintroduce `INTERCOM_ARTICLE_JSON_KEYS`
  or an `article-json` module.
