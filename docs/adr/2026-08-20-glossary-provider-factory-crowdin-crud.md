# ADR: Glossary provider factory and live Crowdin CRUD

- Status: Accepted
- Date: 2026-08-20

## Context

Glossary routes currently persist native glossaries directly and reject mutations for external glossaries. Crowdin glossaries are already discovered and mirrored into local glossary rows, but the local concept and term rows are not the source of truth for an external resource.

The API needs one glossary surface that supports native glossaries and live Crowdin resources without coupling route handlers to either storage model.

## Decision

Introduce a glossary-provider contract and factory. Route handlers resolve a provider through the single `getGlossaryProduct()` entry point:

- Native glossaries use the existing database-backed implementation.
- Crowdin glossaries use a live Crowdin API implementation for list, detail, concept, and term reads and mutations.
- Unsupported external providers resolve to `null`, allowing routes to preserve the existing immutable response without selecting providers themselves.

Local external glossary rows remain organization-scoped identity and credential/project linkage records. Crowdin concepts and terms are not mirrored into local tables.

The API preserves Hyperlocalise response envelopes and fields. Crowdin concept groups are mapped into the existing concept model, and Crowdin identifiers are represented as stable string IDs suitable for subsequent route calls.

Glossary routes do not maintain a provider-specific `glossaryStore`. Provider-aware reads and CRUD operations use the product interface directly. Native collection creation, list filtering, project attachment queries, and flat-term compatibility operations remain explicit database-backed route helpers because they are not part of the provider product contract.

Live provider identifiers and provider-author metadata are response-level data only. `glossary_terms` does not persist `external_key`, `external_user_id`, `external_created_at`, or `external_updated_at`; Crowdin terms remain owned by the live provider API rather than becoming local rows.

External glossary creation is not part of this change. External glossaries continue to enter through provider discovery/import. Deleting an external glossary deletes the remote Crowdin resource first and removes its local mapping only after the remote operation succeeds.

Expected provider failures use stable API error envelopes. Credentials are resolved through the linked external project and existing user-scoped authentication flow.

## Alternatives considered

### Mutation-only dispatch

Use a factory only for writes while keeping reads and mapping in routes. This reduces the first change but leaves provider-specific behavior in the HTTP layer and makes future providers expensive to add.

### Local mirror as source of truth

Continue serving external concepts and terms from local tables and synchronize mutations asynchronously. This avoids live request latency but allows stale terminology and contradicts the requirement that Crowdin be the source of truth.

### Separate Crowdin-only API

Add a second route surface for Crowdin resources. This avoids changing existing routes but duplicates authorization, response mapping, and client behavior.

## Consequences

The route layer becomes provider-agnostic for glossary and concept CRUD and can support additional glossary providers later. Live Crowdin operations add provider latency and availability dependence to external reads and writes. Native collection and legacy flat-term helpers remain local database concerns. Local search and concept persistence remain available only for native glossaries unless a future provider implements a local synchronization strategy.

## Validation

The glossary provider tests verify native and Crowdin factory selection. `vp check --fix` completes with zero errors and only pre-existing unrelated warnings. The focused provider test passes with 3 tests. Full route and web test execution requires local PostgreSQL and app services; in the development sandbox those services were unavailable, so database-backed route tests could not complete.
