# Story 1.1: Bootstrap Liquid Parser Skeleton

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a Hyperlocalise maintainer,
I want the `github.com/osteele/liquid` dependency added and a `LiquidParser` struct that implements the existing parser interfaces,
so that the project compiles and the parser can be registered in the strategy dispatcher.

## Acceptance Criteria

1. Given the repo has an existing `go.mod`, when a dev agent runs `go get github.com/osteele/liquid@v1.6.0` and `go mod tidy`, then the dependency is pinned at `v1.6.0` and the build succeeds.
2. A new `internal/i18n/translationfileparser/liquid_parser.go` file exists containing a `LiquidParser` struct.
3. `LiquidParser` implements `Parse(content []byte) (map[string]string, error)` and `ParseWithContext(content []byte) (map[string]string, map[string]string, error)`.
4. `ParseWithContext` returns deterministic empty context behavior for this bootstrap story, using either `nil` or an empty `map[string]string` consistently. File-path and line-number enrichment are explicitly deferred to later stories because the current parser interface receives only `content []byte`.
5. The existing `internal/i18n/translationfileparser/strategy.go` `NewDefaultStrategy()` appends `.liquid` extension registration without breaking existing parsers.
6. The implementation is validated against `osteele/liquid` behavior so we know filter chains are represented consistently enough for later stories that inspect `t`, `escape`, `upcase`, and similar filters.

## Tasks / Subtasks

- [ ] Add the parser dependency and update module metadata (AC: 1)
  - [ ] Run `go get github.com/osteele/liquid@v1.6.0`.
  - [ ] Run `go mod tidy`.
- [ ] Add the skeleton parser implementation in `internal/i18n/translationfileparser/liquid_parser.go` (AC: 2, 3, 4)
  - [ ] Define `type LiquidParser struct{}` to match the repo's stateless parser pattern.
  - [ ] Implement `Parse` by delegating to `ParseWithContext` and returning only the values map.
  - [ ] Implement `ParseWithContext` as a compile-safe skeleton for now; do not attempt full extraction in this story.
  - [ ] Return deterministic empty maps / context behavior that makes the interface usable without inventing later-story logic.
- [ ] Register `.liquid` in the default strategy (AC: 5)
  - [ ] Append one `.liquid` registration line in `NewDefaultStrategy()`.
  - [ ] Preserve existing parser ordering and behavior for all current extensions.
- [ ] Add focused tests for the bootstrap slice (AC: 1, 3, 5, 6)
  - [ ] Add `internal/i18n/translationfileparser/liquid_parser_test.go`.
  - [ ] Add at least one compile-shape test covering `Parse` / `ParseWithContext`.
  - [ ] Add or extend strategy tests so `.liquid` resolves through `NewDefaultStrategy()` while existing parser cases remain unchanged.
  - [ ] Add a narrow capability test, or record a short documented probe result in the story completion notes, confirming the chosen `osteele/liquid` API can see filter chains needed by Story 1.2 and Story 1.4.
- [ ] Keep scope tight to Story 1.1 (AC: 2-6)
  - [ ] Do not implement dynamic-key diagnostics yet; that belongs to Story 1.6.
  - [ ] Do not implement panic-recovery or `LiquidParseError` yet unless required for compilation; that belongs to Story 1.7.
  - [ ] Do not add coverage reporting, `check_diagnostics.go`, or docs in this story; those land in later epics/stories.

## Dev Notes

- This is a brownfield CLI extension inside the existing Go parser package. The real interfaces already exist in `internal/i18n/translationfileparser/strategy.go`, and the story should follow the established parser shape instead of inventing a new abstraction. [Source: internal/i18n/translationfileparser/strategy.go:9-18]
- Existing parsers use a zero-value struct plus `Parse` delegating to `ParseWithContext`; `ARBParser` is the nearest local example to copy for method shape and return contracts. [Source: internal/i18n/translationfileparser/arb_parser.go:12-23]
- The strategy dispatcher already type-asserts `ContextParser` and wraps parse failures with the source path. Story 1.1 should integrate through that existing seam by adding only the `.liquid` registration line. Parser implementations themselves receive only `content []byte`, so this story must not promise file-path-aware entry context yet. [Source: internal/i18n/translationfileparser/strategy.go:25-42,74-99]
- Epic 1 is about parser extraction and diagnostics as a sequence. Story 1.1 is only the bootstrap foundation for later stories 1.2 through 1.7, so avoid pulling future behavior forward unless it is necessary to keep the code shape stable. [Source: _bmad-output/planning-artifacts/epics.md:293-314]
- Architecture explicitly pins `github.com/osteele/liquid` and treats this story as the first implementation priority, followed by parser file creation and `.liquid` registration. [Source: _bmad-output/planning-artifacts/architecture.md:94-108,662-670]
- The project context says Go formatting and linting are strict: `gofumpt`, `gci`, `golangci-lint`, `exhaustruct`, `gochecknoglobals`, and `errname` all apply. Keep the parser stateless and avoid package-level caches. [Source: _bmad-output/project-context.md:34-45]

### Technical Requirements

- Use `github.com/osteele/liquid@v1.6.0` for this story, even though newer module versions exist upstream. The planning artifacts and acceptance criteria intentionally pin `v1.6.0`; do not silently upgrade during implementation. [Source: _bmad-output/planning-artifacts/epics.md:305-307; _bmad-output/planning-artifacts/architecture.md:94-108]
- Keep `LiquidParser` as `struct{}` with no package-level state. Architecture calls out goroutine-safety and `gochecknoglobals` as non-negotiable. [Source: _bmad-output/planning-artifacts/architecture.md:45-50,112-116,567-570]
- Do not change the `Parser` or `ContextParser` signatures. They are fixed contracts used by the strategy dispatcher and downstream services. [Source: internal/i18n/translationfileparser/strategy.go:9-18; _bmad-output/planning-artifacts/architecture.md:45-47]
- Story 1.1 is allowed to keep `ParseWithContext` minimal. For this story, deterministic empty context is the target behavior. Full extraction logic belongs to Story 1.2, comment/raw skipping to Story 1.3, chained filters to Story 1.4, diagnostics to Story 1.6, and panic recovery to Story 1.7. [Source: _bmad-output/planning-artifacts/epics.md:314-395]

### Architecture Compliance

- Register `.liquid` via `NewDefaultStrategy()` using the existing `s.Register(".ext", Parser{})` pattern. Do not create a separate dispatcher or special-case logic. [Source: internal/i18n/translationfileparser/strategy.go:25-42]
- Preserve backward compatibility for all existing parsers. The architecture repeatedly calls out "one-line append" registration as the intended low-risk change. [Source: _bmad-output/planning-artifacts/architecture.md:136-141,441-443]
- Avoid introducing the optional `DiagnosticParser` interface in this story unless it is strictly necessary for scaffolding. That architectural decision is real, but its behavior belongs to later acceptance criteria. [Source: _bmad-output/planning-artifacts/architecture.md:136-137,162-163]

### Library / Framework Requirements

- Primary new library: `github.com/osteele/liquid`.
- Local research check:
  - The architecture document validates `v1.6.0` as the planned version for this feature. [Source: _bmad-output/planning-artifacts/architecture.md:94-108]
  - Current upstream package docs on pkg.go.dev show newer module releases exist, but this story must stay pinned to the plan-approved version rather than chasing latest. [Source: https://pkg.go.dev/github.com/osteele/liquid]
- Validate the library API with a minimal probe around engine/template parsing or parser exposure so later filter-chain stories are not blocked by bad assumptions. If the exact AST surface is inaccessible from public APIs, document the finding in the story's completion notes and keep Story 1.1 focused on compile-safe setup.

### File Structure Requirements

- New file expected in this story:
  - `internal/i18n/translationfileparser/liquid_parser.go`
  - `internal/i18n/translationfileparser/liquid_parser_test.go`
- Modified files expected in this story:
  - `internal/i18n/translationfileparser/strategy.go`
  - `go.mod`
  - `go.sum`
- Do not create `pkg/diagnostics/`, `check_diagnostics.go`, `baseline.txt`, or docs in Story 1.1 unless a compile dependency forces it. Those are planned later and would widen the review surface unnecessarily. [Source: _bmad-output/planning-artifacts/architecture.md:350-389,662-673]

### Testing Requirements

- Add parser-package unit tests colocated with the implementation file; do not create a separate `tests/` tree. [Source: _bmad-output/project-context.md:110-117; _bmad-output/planning-artifacts/architecture.md:326-327]
- Run the standard repo validation commands before closing the story work:
  - `make fmt`
  - `make lint`
  - `make test`
- If parser-specific iteration is faster during development, use targeted Go tests first, then finish with the repo-level commands above. [Source: AGENTS.md:15-26; CLAUDE.md:24-33]
- Add or update a strategy test proving `.liquid` is registered and dispatches without breaking existing parser cases. `strategy_test.go` already contains the local pattern to extend.
- If the `osteele/liquid` capability check cannot be expressed as a durable test yet, capture the concrete finding in the story completion notes so Story 1.2 does not re-discover the same API constraints. [Source: internal/i18n/translationfileparser/strategy_test.go:8-120]

### Project Structure Notes

- This story is entirely in the Go CLI/parser surface. No web app, Hono, Next.js, or database work is needed.
- The current repo already contains many parser implementations. Reuse their structure and testing style rather than creating a liquid-specific mini-framework.
- There is no prior story file in Epic 1, so there are no earlier dev notes or corrections to inherit yet.

### References

- Epic and story definition: [Source: _bmad-output/planning-artifacts/epics.md:293-314]
- PRD product and technical success constraints: [Source: _bmad-output/planning-artifacts/prd.md:98-110,132-144,816-852]
- Architecture decisions and implementation order: [Source: _bmad-output/planning-artifacts/architecture.md:94-108,136-141,162-164,346-389,441-443,662-673]
- Existing parser interfaces and registration pattern: [Source: internal/i18n/translationfileparser/strategy.go:9-18,25-42,74-99]
- Example parser implementation pattern: [Source: internal/i18n/translationfileparser/arb_parser.go:12-23]
- Existing strategy tests to extend: [Source: internal/i18n/translationfileparser/strategy_test.go:8-120]
- Project-wide coding and validation rules: [Source: _bmad-output/project-context.md:34-45,110-117; AGENTS.md:15-26]

## Dev Agent Record

### Agent Model Used

GPT-5

### Debug Log References

- Story created from sprint-selected backlog item `1-1-bootstrap-liquid-parser-skeleton`.
- No previous story artifact existed for Epic 1.

### Completion Notes List

- Story context created from `epics.md`, `prd.md`, `architecture.md`, `project-context.md`, and the live parser package structure.
- Scope intentionally constrained so Story 1.1 does not absorb Story 1.2, 1.6, or 1.7 behavior early.
- Validation pass applied: bootstrap story now explicitly defers file-path and line-number context enrichment until a later story with the necessary interface support.

### File List

- _bmad-output/implementation-artifacts/1-1-bootstrap-liquid-parser-skeleton.md
