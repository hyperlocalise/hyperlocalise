# Launch Readiness

This document defines launch scope and behavior guarantees for `hyperlocalise`.

## Scope

GA scope is sync-first:

- `sync pull` and `sync push` across local files and remote TMS adapters
- provenance sidecar preservation (`*.meta.json`)
- operational visibility via `status`

Out of scope:

- full in-product orchestration of LLM generation
- automatic provenance sidecar creation by external generators

## Known Limitations

- LLM generation is external; if provenance metadata is missing, conflict handling is conservative.
- Local JSON store currently resolves one file mapping pattern for sync operations; multi-bucket/multi-file projects should validate path strategy before rollout.
- Invariant checks are hard safety gates; malformed ICU/placeholders are blocked even with force mode.

## Conflict Policy

### Pull

- `--apply-curated-over-draft=true` (default): curated remote can replace local `llm/draft`
- `--apply-curated-over-draft=false`: curated-vs-draft mismatch is kept as conflict
- curated local mismatches are conflicts
- missing provenance mismatches are conflicts

### Push

- missing remote entries are created
- safe mismatches are queued as updates
- draft-vs-curated and missing-provenance mismatches are conflicts by default
- `--force-conflicts` allows overwrite for mismatch conflicts (not invariant violations)

## Verification Matrix

- Pull: draft replacement enabled path
- Pull: `apply-curated-over-draft=false` conflict path
- Push: default draft-vs-curated conflict
- Push: safe mismatch update path
- Push: `--force-conflicts` override path
- Status: bucket filter from localstore namespace
- Adapters: POEditor and Lokalise adapter pull/push tests

## Launch Gate

- `go test ./...` passes
- CI `make precommit` passes
- README command/flag docs match CLI behavior
- known limitations are explicitly documented
