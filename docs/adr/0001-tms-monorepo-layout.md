# ADR 0001: TMS Monorepo Layout

## Status

Accepted

## Context

Hyperlocalise started as a single Go-module CLI. The TMS expansion adds:

- a public API for integrations
- internal service boundaries
- a frontend application
- shared build orchestration with Bazel

## Decision

We keep the current root Go module for shared/domain code and introduce:

- `go.work` for workspace stitching
- `apps/` for deployable entrypoints
- `services/` for internal service runtimes
- `api/openapi` and `api/proto` as contract sources of truth
- `pkg/api` and `pkg/client` for generated artifacts and reusable clients
- `domains/` for business logic extracted from transport layers over time

## Consequences

- CLI delivery stays stable while TMS layers are introduced.
- Service module boundaries can be introduced without a full codebase split.
- Bazel can become the top-level build system incrementally instead of through a flag day migration.
