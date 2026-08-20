# ADR: Glossary provider factory and live Crowdin CRUD

- Status: Accepted
- Date: 2026-08-20

## Context

Glossary routes currently persist native glossaries directly and reject mutations for external glossaries. Crowdin glossaries are already discovered and mirrored into local glossary rows, but the local concept and term rows are not the source of truth for an external resource.

The API needs one glossary surface that supports native glossaries and live Crowdin resources without coupling route handlers to either storage model.

## Decision

Introduce a glossary-provider contract and factory. Route handlers will resolve a provider from the glossary source:

- Native glossaries use the existing database-backed implementation.
- Crowdin glossaries use a live Crowdin API implementation for list, detail, concept, and term reads and mutations.

Local external glossary rows remain organization-scoped identity and credential/project linkage records. Crowdin concepts and terms are not mirrored into local tables.

The API preserves Hyperlocalise response envelopes and fields. Crowdin concept groups are mapped into the existing concept model, and Crowdin identifiers are represented as stable string IDs suitable for subsequent route calls.

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

The route layer becomes provider-agnostic and can support additional glossary providers later. Live Crowdin operations add provider latency and availability dependence to external reads and writes. Local search and concept persistence remain available only for native glossaries unless a future provider implements a local synchronization strategy.

## Validation

Provider and route tests will mock Crowdin API calls, verify request payloads and identifier mapping, preserve native route behavior, and cover remote failure handling. The web app checks will run with `vp test` and `vp check --fix`.
