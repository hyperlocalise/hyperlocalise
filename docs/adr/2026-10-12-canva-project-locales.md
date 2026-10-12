# Canva project locales and page files

## Status

Accepted. Implemented on Canva connections, collect and generate
routes, the Integrations panel, and the Canva app.

## Date

2026-10-12

## Context

Canva does not translate. Hyperlocalise jobs do. The connection form and
Canva app kept a separate locale list (`en`, `es`, `fr`) and a language
to region mapper. Jobs then failed with `job_source_locale_not_in_project`
because `en` is not `en-US`.

The bound project already owns source and target locales. A second list
and a mapper add drift without adding a Canva capability.

The app also used one shared locale picker and one pull. That mixed job
scope with write-back and treated the whole design as a single file.

## Decision

1. Create and update a Canva connection from display name, API key, and
   project only. Copy the project's source locale and target locales onto
   the connection as a snapshot. Ignore client-supplied locales.
2. Resolve each job from the live project. Source is always the project
   source locale. Requested targets are used only when they are a
   non-empty subset of the project targets. Otherwise use every project
   target.
3. Do not map language tags to regional tags. `en` is not `en-US`.
4. The Integrations panel shows API key and project names in the
   dropdowns. It does not expose locale fields.
5. The Canva app hydrates locales from `session.project`. It shows
   languages as `English (en-US)`. Collect and generate use the BCP-47
   tag, not the display name.
6. Collect writes one source file per chosen page at
   `canva/designs/<design-slug>/page-<n>.json`, starting at `page-1.json`.
   The slug comes from the Canva title. Untitled designs fall back to
   the design id. The operator
   can collect one selected page or every selected page.
7. Generate starts one-locale jobs for every file in the latest collect
   batch.
8. Add to design replaces text on a chosen Canva page, or replaces each
   matching page. It does not insert a page above or below. The first
   language row is the project source locale. After collect, apply writes
   the collected source JSON back. Translated rows write that locale’s
   job output. Apply flattens nested `canva.segment` keys from JSON job
   output so dotted source keys match.
9. Do not backfill older Canva files, jobs, or app settings. Generate
   and apply use only the latest collect batch. Old single-file designs
   stay unused.

Customer help lives in [Localize Canva](../platform/connections/canva.mdx)
and [Connect your tools](../platform/integrations.mdx).

## Alternatives considered

1. **Map `en` to `en-US`** — rejected. Ambiguous when a project has
   `en-US` and `en-GB`. Hides a mismatch instead of using the project
   list.
2. **Keep editable connection locales** — rejected. Operators would
   maintain two lists. Jobs still have to match the project.
3. **One JSON file per design** — rejected. Apply and review are
   page-shaped.
4. **Insert a translated page above or below** — rejected. The Canva
   Apps SDK cannot place a full page copy at an arbitrary index.

## Consequences

- Changing project languages changes the next Canva job. The connection
  snapshot is informational.
- Saved Canva app settings that still store `en` or `es` are replaced on
  the next session load.
- A project without a source locale cannot create or update a Canva
  connection.
- Collecting one page replaces the current collect batch. Earlier page
  files from that design are not reused.
