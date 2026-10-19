# Sanity Studio plugin

## Status

Accepted

## Context

Authors using Sanity need in-Studio upload, translate, and apply flows aligned with Figma/Canva, while write-back must follow Intercom-style draft locale slots on official i18n schemas.

## Decision

- Ship `sanity-plugin-hyperlocalise` via `@sanity/plugin-kit`.
- Authenticate with public PKCE OAuth only (no connection-token paste).
- Store one flat JSON source file per document at `sanity/{projectId}/{dataset}/{docType}/{slug}-{id}.json` with keys `sanity.k.*`.
- Apply writes drafts only into field-level internationalized arrays or document-level `@sanity/document-internationalization` copies.
- Keep Sanity Pipes as a separate Integrations surface.

## Consequences

- New web tables and `/api/oauth/sanity` + `/api/integrations/sanity` endpoints mirror Figma.
- Studio CORS allows `localhost:3333` and `localhost:3334` by default.
