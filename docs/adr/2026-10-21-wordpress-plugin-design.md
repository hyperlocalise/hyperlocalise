# WordPress plugin

## Status

Proposed

## Context

WordPress sites that need translation already run a multilingual plugin, usually WPML or Polylang. That plugin owns language URLs, hreflang, menus, and SEO. If Hyperlocalise stored its own language layer, it would compete with those plugins and force sites to migrate.

## Decision

- Ship `apps/hyperlocalise-wp` as a server-side PHP plugin. It writes into the active multilingual plugin through an `Adapter` interface. WPML and Polylang adapters ship first.
- Authenticate with a personal access token stored in `wp_options` or the `HYPERLOCALISE_API_KEY` constant. No OAuth is needed because every API call runs on the WordPress server.
- Use the existing public API only:
  - `POST /api/v1/files` uploads one flat JSON source file per post at `wordpress/{host}/{post-type}/{post-id}.json`.
  - `POST /api/v1/jobs` creates one file job.
  - Job status is read from `api.hyperlocalise.com/v1/jobs/{id}/status`.
  - Translations are read from `/api/v1/projects/{id}/translations/download`.
- Segment content from `parse_blocks()` output. Keys are `title`, `excerpt`, `content.{block-path}.{part}.{chunk}`, and `meta.{key}`. Block comments and attributes are never sent.
- Create new translations as drafts. Do not overwrite published translations unless the site opts in.
- Poll running jobs with WP-Cron and save translations automatically when a job finishes.

## Consequences

- No backend changes. The plugin works with every native project.
- Source paths use post IDs, so a renamed slug keeps its translations.
- Content keys depend on block position. Restructuring a post changes its keys, so the post must be sent again.
- Block attributes such as image `alt` text are not translated yet.
- TMS-backed projects are rejected until the upload response returns a stored file id for them.
