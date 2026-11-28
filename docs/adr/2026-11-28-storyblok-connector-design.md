# Storyblok connector

## Status

Accepted.

## Date

2026-11-28

## Context

Storyblok is a common headless CMS among teams that compare us with Phrase.
WorkOS Pipes lists Storyblok as an API-key provider, so customers paste a
Storyblok personal access token and nobody has to review an OAuth app.

Storyblok offers three localisation models: field-level (one story,
`field__i18n__<lang>` values), folder-level (a story per locale folder) and
space-level (a space per market). Field-level is the default and the most common.

The Management API has two ways to read and write translations:

1. Read component schemas to find fields marked Translatable, walk each story's
   content tree, and write `field__i18n__<lang>` values with a story update.
   Works on every plan.
2. `GET .../stories/:id/export.json` and `PUT .../stories/:id/import.json`,
   which back Storyblok's Export/Import Translatable Fields apps. They return a
   flat object keyed `<block uid>:<component>:<field>` (rich text is flattened
   to per-node keys) and accept the same object back with a `lang_code`. Storyblok
   only allows them on plans that include translation export.

## Decision

Use the export/import endpoints (option 2), as chosen by product. Support
field-level translation only.

- **Connection.** Pipes slug `storyblok` holds the token per connecting user.
  `storyblok_connections` stores the space ID, region and default folder slugs,
  like `webflow_connections`. The region picks the Management API host (`eu`,
  `us`, `ca`, `ap`, `cn`); a space only answers on its own region's host. Tokens
  are sent raw in `Authorization`, without `Bearer`.
- **Validation.** Saving runs discovery: list spaces, load the space, list
  folders, and probe `export.json` on one story. 403 or 422 from the probe means
  the plan lacks translation export, and the connection is refused before
  anything is stored in Pipes.
- **Import** (`import_storyblok_stories`). List stories under the configured
  folders (`starts_with`), export each in the default language, and upload one
  JSON source file per story at `storyblok/{spaceId}/{full_slug}.json`. Keys are
  Storyblok's export keys, kept verbatim; meta keys (`page`, `language`, `url`,
  `text_nodes`) are dropped. Top-level keys stay literal in our JSON ingest, so
  `.` and `[` inside rich-text keys are safe. Existing translations are seeded
  from `export.json?lang_code=..&export_lang=true` under the shared
  existing-translation policy; a value equal to the source counts as
  untranslated because Storyblok falls back to the default language. A
  `updated_at` watermark in `storyblok_sync_cursors` skips old stories; the
  content hash on `storyblok_story_sync_states` skips unchanged ones.
- **Push** (`push_storyblok_translations`, `push_approved` runs). For each story,
  re-export the source and skip it when its hash no longer matches the import.
  For each mapped language, export the current target, overlay approved
  translations for keys still in the source, and `PUT import.json`. Fields
  without an approved translation keep their current value. Push never publishes.
- **Locales.** The space's default language is the source. Project targets map
  to `options.languages` codes as BCP 47 tags (`pt-br` ↔ `pt-BR`, `es_co` ↔
  `es-CO`); a language-only code covers regional targets; several regional
  candidates stay unmapped.
- **Rate limits.** Starter spaces allow 3 requests per second. Import and push
  run two stories at a time, and the client retries 429s with `Retry-After` or
  exponential backoff, up to three times.
- **Surfaces.** Integrations panel, automation tool and skill
  (`translate-storyblok-stories`) with a template, and Content Editor ingest and
  push buttons. Push runs only start from the Content Editor, so the buttons ship
  with the first version.

## Alternatives considered

1. **Schema walk on every plan** — rejected for v1 by product: more code (schema
   cache, nested blocks, rich-text JSON) for the first release. It stays the path
   if plan coverage becomes a sales blocker.
2. **Folder-level and space-level models** — deferred. They need story creation
   per locale and a different mapping table.
3. **Publish on push** — deferred. Storyblok can publish per language when
   individual translation publishing is on; that needs a setting and testing
   against real spaces.

## Consequences

- Customers on plans without translation export can't connect. The panel and the
  docs say so.
- WorkOS dashboard: enable the Storyblok API-key integration with slug
  `storyblok`.
- The export key format is Storyblok's. If they change it, imported files change
  keys and translations need to be re-seeded.
- Whether `import.json` creates a draft version or updates the published story is
  not documented. Docs tell editors to review and publish in Storyblok.
