---
stepsCompleted: [1, 2, 3, 4, 5, 6, 7, 8]
lastStep: 8
status: complete
completedAt: '2026-04-25'
workflowType: architecture
inputDocuments:
  - "_bmad-output/planning-artifacts/prd.md"
  - "_bmad-output/planning-artifacts/research/technical-liquid-html-template-localization-research-2026-04-22.md"
  - "_bmad-output/project-context.md"
  - "docs/adr/2026-04-12-dashboard-shell-design.md"
  - "docs/adr/2026-04-17-check-diff-stdin-design.md"
  - "docs/adr/2026-04-18-vercel-workflow-cutover-design.md"
  - "docs/adr/2026-04-18-workos-app-auth-session-threading-design.md"
  - "docs/adr/2026-04-19-hero-subtle-reveal-design.md"
  - "docs/adr/2026-04-20-cultural-atlas-hero-design.md"
workflowType: "architecture"
project_name: "hyperlocalise"
user_name: "henry"
date: "2026-04-25"
---

# Architecture Decision Document

_This document builds collaboratively through step-by-step discovery. Sections are appended as we work through each architectural decision together._

## Project Context Analysis

### Requirements Overview

**Functional Requirements:**
42 FRs across 6 categories. Core architectural drivers: FR1–FR7 (parser implementation), FR12–FR16 (check command integration with coverage and JSON report), FR19–FR21 (init auto-detection), FR24–FR25 (coverage reporting), FR30–FR32 (diagnostics emission). The parser must implement the existing `Parser` / `ContextParser` interfaces and register in `NewDefaultStrategy()`.

**Non-Functional Requirements:**
22 NFRs. Architecturally critical: NFR-P1 (sub-second parsing ceiling), NFR-P5 (CI benchmark regression gate), NFR-R1 (zero panics), NFR-R2 (backward compatibility), NFR-R3 (concurrency safety via `go test -race`), NFR-M1 (fixture coverage), NFR-M4 (lint compliance with `exhaustruct`/`gochecknoglobals`/`errname`), NFR-D1 (quickstart docs).

**Scale & Complexity:**

- Primary domain: CLI / backend (Go)
- Complexity level: Medium
- Estimated architectural components: ~5 (parser, registration, diagnostics sink, benchmark harness, test fixtures)

### Technical Constraints & Dependencies

- **Go 1.26** with `golangci-lint v2` — `exhaustruct`, `gochecknoglobals`, `errname` are enforced
- **osteele/liquid** — new external dependency, must pin version in go.mod
- **Parser interfaces** — fixed contract from `strategy.go`; cannot change signatures
- **Stateless struct requirement** — zero-value, no package-level vars per `gochecknoglobals`
- **runsvc goroutine pool** — parser must be safe for concurrent use without synchronization
- **Incremental atomic writes** — already handled by `runsvc` flush logic; no architecture change needed

### Cross-Cutting Concerns Identified

1. **Panic Recovery Boundary** — third-party AST library must not crash the CLI on malformed input (OQ-1)
2. **Diagnostics Side-Channel** — W001 warnings need a path from parser to `check` JSON report and TTY output (OQ-2)
3. **Performance Regression Gate** — benchmark baseline, measurement stability, CI runner variance (OQ-3, OQ-4)
4. **Structural Equivalence & Sort Order** — deterministic JSON output for CI diff and GitHub annotations (OQ-5, OQ-6)
5. **Test Fixture Completeness** — 8 edge cases must be covered before merge
6. **Backward Compatibility** — zero behavioral change for existing JSON/HTML/ARB parsers

### Party Mode Round 1 Insights (Winston, Amelia, John)

- **Registry contract evolution risk**: `Parse`/`ParseWithContext` return `map[string]string` with no position metadata. File:line for W001 diagnostics cannot use the interface return values — this is a structural constraint forcing a side-channel workaround (OQ-2).
- **`gochecknoglobals` impact**: Panic-recovery wrappers and any cached `liquid.Engine` or compiled regex at package scope will be rejected. Must use function-scoped locals or injected parameters.
- **OQ-2 is the only hard architectural decision**: Diagnostics sink shape is the single question requiring genuine design. OQ-1, 3, 5, 6 are coding patterns or process conventions.
- **OQ-4 (benchmark baseline) is strategic instrumentation**: Not just a performance measurement — it underpins the "second parser ≤50% effort" business success criterion. Engineering-hours tracking mechanism must be decided.
- **Forward-compatibility guard**: Phase 2 (schema locale, `{% translate %}` blocks) should not be blocked by a diagnostics sink that's `.liquid`-only.

### Party Mode Round 2 Insights (Paige, Mary, Sally)

- **Documentation architecture gap**: No decision on how architectural choices are communicated to downstream implementers. ADR format? Inline docs? Research code skeleton should be treated as input, not specification.
- **Vendor lock-in risk for osteele/liquid**: Dependency monitoring trigger should be documented — last commit date, fork/rewrite threshold.
- **Error/diagnostic catalog architecture**: W001 diagnostic copy ("these use variable expressions...") is part of the CLI's UI. Hardcoding in parser couples copy changes to recompiles. Suggest a structured diagnostic catalog (code → template, severity, action guidance).
- **TUI table component reuse**: TTY coverage table (FR24/FR25) should reuse existing BubbleTea components if available; avoid hand-rolled ASCII tables that drift from CLI design system.
- **Benchmark instrumentation as business metric**: Engineering-hours tracking for "second parser ≤50% effort" needs a decision on where data lives (Linear tickets, commit messages, dedicated artifact).

## Starter Template Evaluation

### Primary Technology Domain

CLI Tool (Go) — extending existing hyperlocalise CLI with a new parser module.

### Existing Foundation

| Component            | Version | Status         |
| -------------------- | ------- | -------------- |
| Go                   | 1.26    | Existing       |
| Cobra                | 1.10.2  | Existing       |
| BubbleTea / Lipgloss | v2.0.x  | Existing       |
| golangci-lint        | v2      | Existing       |
| openai-go            | v3.32.0 | Existing       |
| osteele/liquid       | v1.6.0  | New dependency |

### New Dependency: github.com/osteele/liquid

**Version verified:** v1.6.0 (latest stable tag).
**Maturity:** Mature pure-Go implementation, exported AST, no CGO.
**Integration:** Single `go get` command. Must pin in go.mod.

**gochecknoglobals constraint:** Cannot cache Engine or regex at package scope. Per-parse instantiation or parameter injection required.

### Foundation Decision

No starter template applicable — brownfield extension. The existing `internal/i18n/translationfileparser/` package is the foundation. New dependency is the only foundation change.

```bash
go get github.com/osteele/liquid@v1.6.0
```

### Party Mode Round 3 Insights (Winston, Amelia, Mary)

- **Panic wrapper abstraction**: Wrap the entire `ParseTemplate` call in a generic `recover()` boundary, not an osteele-specific one. If the library is ever swapped, the wrapper stays.
- **Goroutine-safety**: `liquid.Engine` is not goroutine-safe for template compilation. Every `runsvc` worker must instantiate its own `liquid.Engine{}`. Cheap allocation per file.
- **Golden tests over AST-structure tests**: Unit tests should assert on parser output (key sets), not `osteele/liquid` AST types. Decouples tests from library internals.
- **Per-call regex compilation**: `gochecknoglobals` forbids package-scope compiled regex. Compile inside `ParseWithContext` per call — overhead is negligible vs `ParseTemplate`.
- **Vendor monitoring CI**: Weekly capability test against `osteele/liquid@latest` (not pinned) to detect breaking changes before Dependabot proposes a bump.
- **`osteele/liquid` forward-compat risk**: Unknown block tags (e.g. future `{% translate %}`) are treated as errors by default. If Shopify adopts it before the library does, our parser fails. Architecture should note this as a known decommissioning-path risk.
- **Error message architecture**: Panic boundary must return a typed error that the CLI's existing BubbleTea error renderer can format consistently. Error copy is part of the CLI UI and must be user-trust-preserving.

### Party Mode Round 4 Insights (Paige, Sally, John)

- **ADR format needed**: Each Open Question should get a numbered ADR in the architecture document (`ADR-001`, `ADR-002`, etc.). Research code skeleton is input, not specification.
- **Dependency decommissioning path**: If `osteele/liquid` goes unmaintained, the correct product decision is "drop Liquid support" rather than maintain a fork. Architecture should make removal cost one file + one registration line.
- **Structured diagnostic catalog**: W001 diagnostic copy should not be hardcoded in parser. Propose a code → template mapping that allows copy changes without recompilation.
- **TUI table component reuse**: TTY coverage table (FR24/FR25) must reuse existing BubbleTea table components if available; avoid hand-rolled ASCII that drifts from CLI design system.
- **Effort measurement clock**: "Second parser ≤50% effort" baseline clock starts at architecture approval, not first line of code. Avoid over-engineering the dependency decision.

## Core Architectural Decisions

### Decision Priority Analysis

**Critical Decisions (Block Implementation):**

| ADR     | Decision                 | Selected Option                                                                                                                                                                                 | Rationale                                                                                                                                                                                                                     |
| ------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ADR-001 | Panic Recovery Boundary  | `defer recover()` inside `ParseWithContext`, returning typed `LiquidParseError` with `panicValue` and file path                                                                                 | Keeps boundary closest to failure source; typed error enables `errors.As` downstream in `runsvc` and `check` for differentiated handling (skip vs. fatal).                                                                    |
| ADR-002 | Diagnostics Side-Channel | Optional `DiagnosticParser` interface: `ParseWithDiagnostics(content []byte, diags *[]Diagnostic) (map[string]string, map[string]string, error)`                                                | Solves goroutine-concurrency context.Value discard problem; `*[]Diagnostic` append pattern is minimal and Go-idiomatic for callee-populated slices. `strategy.go` checks via type assertion; existing parsers are unaffected. |
| ADR-003 | Equivalence Method       | `reflect.DeepEqual` on `map[string]struct{}` key-set                                                                                                                                            | Maps have no order; set equality is exactly what's needed for key comparison. No custom sorting needed.                                                                                                                       |
| ADR-004 | Benchmark Baseline       | GitHub Actions `ubuntu-latest`, 10 iterations, drop slowest + fastest, median of remaining 8. Fail if median > 500ms. Baseline committed in `internal/i18n/translationfileparser/baseline.txt`. | Cheapest reproducible infrastructure. Statistical smoothing handles shared-runner CPU throttling.                                                                                                                             |
| ADR-005 | TTY Sort Order           | `sort.Strings` on file path ascending (deterministic for CI diff). TTY human view may sort by key-count descending as secondary UX enhancement.                                                 | Simple, matches `find` output, unambiguous for machine consumers.                                                                                                                                                             |
| ADR-006 | Registry Sync            | `append` in `NewDefaultStrategy()` for `.liquid` — one line, existing pattern.                                                                                                                  | Zero friction, matches how JSON and HTML parsers are registered.                                                                                                                                                              |

**Important Decisions (Shape Architecture):**

| ADR     | Decision             | Selected Option                                                                                                                                                                                                                 | Rationale                                                                               |
| ------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| ADR-007 | Diagnostic Catalog   | `pkg/diagnostics/` package with `func Diagnostic(code string, locale string) string` returning template. Codes mapped in a function-scoped map initialized at call time (not package-level var, to satisfy `gochecknoglobals`). | Copy changes don't require recompilation; supports future localization of CLI messages. |
| ADR-008 | TUI Table Component  | Inspect existing BubbleTea table components in CLI (`cmd/` or `pkg/tui/`). Reuse if present; if absent, implement with `charmbracelet/lipgloss` table primitives and extract to shared package for future commands.             | Avoids hand-rolled ASCII drift from CLI design system.                                  |
| ADR-009 | Vendor Monitoring    | Weekly CI capability test against `github.com/osteele/liquid@latest` (not pinned) + Dependabot for actual bumps.                                                                                                                | Early warning before Dependabot proposes a version that breaks AST field access.        |
| ADR-010 | Decommissioning Path | Removal cost = delete `liquid_parser.go` + one registration line. No build tags or feature flags for v1.                                                                                                                        | Go is statically linked; no runtime cost. Simplicity over configurability.              |

**Deferred Decisions (Post-MVP):**

| ADR     | Decision                                | Rationale                                                                                                                                                                            |
| ------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| ADR-011 | `{% translate %}` block tag support     | Depends on Shopify adoption; unknown block tags currently error in `osteele/liquid`.                                                                                                 |
| ADR-012 | Schema locale files (`*.schema.json`)   | Same JSON format already handled by `json_parser.go`; needs schema-specific key structure documentation only.                                                                        |
| ADR-013 | Second parser effort tracking mechanism | Clock starts at architecture approval; `LIQUID_BASELINE.md` in `_bmad-output/` records engineering-hours from approval to merge. Will be created when second parser enters planning. |

### Cascading Implications

1. **ADR-002 (DiagnosticParser)** → `runsvc` and `check` must type-assert parser to `DiagnosticParser` before calling. If assertion fails, fall back to `ParseWithContext` (no diagnostics). `check` accumulates `[]Diagnostic` across all source files, then serializes to JSON report under `findings` array with code `W001-liquid-dynamic-key`.
2. **ADR-001 (Panic boundary)** → `LiquidParseError` must implement `Unwrap() error` returning `nil` (it's a synthetic error, not a wrapper), and expose `IsPanic() bool` so `runsvc` can classify it as non-fatal (skip file, continue processing others). `check` classifies it as an `error`-level finding with file path.
3. **ADR-004 (Benchmark)** → `baseline.txt` format: `median_ns: <value>\niterations: 10\ndropped: 2\ndate: <ISO>`. CI job reads this file, runs benchmark, compares medians. If parser code changes, the developer updates `baseline.txt` in the same PR; CI still validates against the committed value.
4. **ADR-007 (Diagnostic catalog)** → W001 copy: "Liquid dynamic key detected at {{file}}:{{line}} — variable expression `{{expr}}` cannot be statically extracted. Review manually if needed." Rendered via `pkg/diagnostics/`; `{{expr}}` is the raw token source.
5. **ADR-008 (TUI table)** → `check` coverage table columns: `File`, `Keys Extracted`, `Dynamic (W001)`. If BubbleTea table component exists, reuse its column-width algorithm. If not, use `lipgloss` `Style` for consistent padding/borders with existing CLI output.

### Party Mode Round 1 Summary (Winston, Amelia, John)

- Interface lock-in (`map[string]string` with no position metadata) forces side-channel diagnostics (ADR-002).
- `gochecknoglobals` forbids package-scope Engine or regex caching.
- OQ-2 (diagnostics) is the only hard architectural decision; others are patterns or process.
- Benchmark baseline is strategic instrumentation for business success criterion #2.
- Forward-compatibility: diagnostics sink must be generic, not `.liquid`-only.

### Party Mode Round 2 Summary (Winston, Amelia, Mary)

- `context.Value` goroutine-safety flaw identified: `context.WithValue` returns child context that caller discards in concurrent `runsvc` workers.
- `DiagnosticParser` optional interface solves this cleanly — type assertion in `strategy.go`, no existing parser breakage.
- `errors.As(err, &LiquidParseError{})` contract must be documented for downstream `runsvc`/`check` callers.
- `*[]Diagnostic` append pattern defended as Go-idiomatic for callee-populated slices.
- Interface proliferation risk accepted as standard Go pattern (`io.Reader`, `io.ReaderAt`); document convention: optional parser interfaces live in `strategy.go`, checked at dispatch.
- `LIQUID_BASELINE.md` proposed for effort tracking; deferred until second parser planning.
- Error copy must be trust-preserving: "skipped, other files processed normally" rather than "parse failed."

## Implementation Patterns & Consistency Rules

### Pattern Categories Defined

**Critical Conflict Points Identified:** 5 areas where AI agents could make divergent choices

### Naming Patterns

**Go Code Naming:**

- Exported types: `PascalCase` (e.g., `LiquidParser`, `LiquidParseError`, `DiagnosticParser`)
- Unexported functions: `camelCase` (e.g., `walkLiquidAST`, `extractTFilterKey`)
- Files: `snake_case.go` (e.g., `liquid_parser.go`, `liquid_parser_test.go`)
- Error types: **must** end in `Error` (e.g., `LiquidParseError`, `ParseDiagnosticError`) — enforced by `errname` linter
- Interface names: `PascalCase` ending in `er` (e.g., `DiagnosticParser`)
- Diagnostic codes: `{severity}{number}-{domain}-{specific}` (e.g., `W001-liquid-dynamic-key`, `E001-liquid-parse-failed`)

**Test Naming:**

- Test functions: `Test{Type}{Scenario}` (e.g., `TestLiquidParserBasic`, `TestLiquidParserSkipsComment`)
- Table tests: `TestLiquidParserCases` with `tt := []struct{ name string; input string; want map[string]string; wantCtx map[string]string; wantErr error }`
- **Rule:** `wantErr: nil` must be explicit in every table entry to satisfy `exhaustruct`
- Benchmarks: `BenchmarkLiquidParser{Scenario}` (e.g., `BenchmarkLiquidParserLargeTheme`)

### Structure Patterns

**File Organization:**

```
internal/i18n/translationfileparser/
  strategy.go              # existing — add .liquid registration (one line)
  liquid_parser.go         # new — ADR-001 panic boundary, ADR-002 DiagnosticParser
  liquid_parser_test.go    # co-located with source (not tests/ subdirectory)
  testdata/
    liquid/
      basic.liquid
      pluralized.liquid
      interpolated.liquid
      html_safe.liquid
      in_comment.liquid
      in_raw.liquid
      dynamic_key.liquid
      chained.liquid
  baseline.txt             # ADR-004 committed benchmark reference
```

**Diagnostic Type Location:**

- `internal/i18n/translationfileparser/diagnostic.go` — canonical `Diagnostic` struct
- Fields: `Code`, `Severity`, `File`, `Line`, `Message`, `Suggestion`
- `pkg/diagnostics/catalog.go` imports and provides `func Diagnostic(code, locale string) string`
- **Rule:** All parser-related types (Parser, ContextParser, DiagnosticParser, Diagnostic) live in `internal/i18n/translationfileparser/`. `pkg/diagnostics/` imports and provides catalog functions only.

**Fixture Directory Rule:**

- `testdata/` under the package directory (Go standard — `go test` embeds automatically)
- **Never** use a separate `tests/liquid/` tree. Research document path was aspirational; canonical path is `testdata/liquid/`.

### Format Patterns

**JSON Report (`check --json-report`):**

- Coverage array: additive, path-ascending sort (ADR-005)
- Findings array: `{ "code": "W001-liquid-dynamic-key", "severity": "warning", "file": "...", "line": 42, "message": "...", "suggestion": "..." }`
- **Do not mix with web API error shape** (`{ "error": "snake_case_code" }` is Hono web pattern; CLI JSON report is a different schema)

**Baseline.txt Format (ADR-004):**

```
median_ns: 450000000
iterations: 10
dropped: 2
date: 2026-04-25
```

- Nanoseconds as integer, no commas, no units in value
- ISO 8601 date (YYYY-MM-DD)
- Updated only when median increases (regression) or parser implementation changes
- If benchmark improves: no update needed — committed value is the ceiling, not the floor

### Process Patterns

**Error Handling:**

- `runsvc`: `errors.As(err, &LiquidParseError{})` → skip file, `slog.Warn`, continue processing others
- `check`: `errors.As(err, &LiquidParseError{})` → emit as `error`-level finding in JSON report, non-zero exit
- All other errors: fatal for `runsvc` (stop), error finding for `check`

**Go Error Wrapping:**

- Always `fmt.Errorf("...: %w", err)` for error chains
- Panic-recovery error: `LiquidParseError{File: path, PanicValue: r, Err: fmt.Errorf("liquid: parse panic: %v", r)}`
- `Unwrap() error` returns `nil` — synthetic error, not a wrapper
- Expose `IsPanic() bool` for downstream classification

**gochecknoglobals Compliance:**

- No `var` at package scope
- Regex: compile inside function (`re := regexp.MustCompile(...)`) or accept as parameter
- `liquid.Engine`: instantiate per call inside `ParseWithDiagnostics`
- Diagnostic catalog: build map inside function, return from function

**exhaustruct Compliance:**

- All struct fields explicitly initialized, even zero values
- `LiquidParseError{File: path, PanicValue: r, Err: err}` — no omitted fields

### Communication Patterns

**Diagnostics Accumulation (ADR-002):**

```go
// strategy.go dispatch
var diags []Diagnostic
if dp, ok := parser.(DiagnosticParser); ok {
    keys, ctx, err = dp.ParseWithDiagnostics(content, &diags)
} else {
    keys, ctx, err = parser.ParseWithContext(content)
}
// diags now contains W001 entries; serialize to JSON report
```

**Parser Interface Convention:**

- Optional interfaces (`DiagnosticParser`) live in `strategy.go`
- `NewDefaultStrategy()` checks at dispatch via type assertion
- Document: "Parsers with side-channel diagnostics implement `DiagnosticParser`. Parsers without diagnostics ignore the interface."

### Enforcement Guidelines

**All AI Agents MUST:**

- Run `make fmt` before committing (gofumpt + gci)
- Run `make lint` before committing (golangci-lint v2)
- Run `make test-workspace` before committing (>90% coverage on new files)
- Use `go test -race` for parser and runsvc integration tests
- Co-locate test files; no `tests/` subdirectories for unit tests
- Wrap errors with `%w`; never drop underlying error
- Name error types with `Error` suffix
- Define `Diagnostic` struct in `internal/i18n/translationfileparser/diagnostic.go` only
- Use `testdata/liquid/` for fixtures, not `tests/liquid/`
- Include `wantErr: nil` explicitly in every table test entry
- Test panic recovery by passing malformed input to `ParseWithDiagnostics`, asserting `LiquidParseError` with `IsPanic() == true` — never test `recover()` directly

**Pattern Verification:**

- `golangci-lint` enforces `exhaustruct`, `gochecknoglobals`, `errname` automatically
- CI fails on any lint violation
- `make precommit` runs fmt → lint → test → build in sequence

### Party Mode Round 1 Insights (Amelia, Paige, Winston)

- **Fixture directory conflict:** Research doc suggested `tests/liquid/`; Go standard is `testdata/liquid/` under package. Rule: always `testdata/`
- **`Diagnostic` struct location conflict:** Must be in `internal/i18n/translationfileparser/diagnostic.go`, not `pkg/diagnostics/` (import boundary: `internal/` cannot be imported by `pkg/`)
- **Table test `exhaustruct` compliance:** `wantErr: nil` required in every entry of anonymous struct slices
- **Panic recovery test approach:** Test through public `ParseWithDiagnostics` interface, not direct `recover()`
- **Baseline.txt precision:** Nanoseconds as integer, ISO 8601 date, no units in value field
- **Baseline update semantics:** Updated on regression or implementation change; improvement does not require update (ceiling model)
- **Documentation drift:** Every diagnostic code requires three artifacts: (1) struct emission in parser, (2) template in `pkg/diagnostics/catalog.go`, (3) user-facing documentation in PRD/epic AC

## Project Structure & Boundaries

### Complete Project Directory Structure (New / Modified Files)

**New files:**

```
pkg/diagnostics/
  diagnostic.go                 # type Diagnostic struct — cross-cutting, imported by parsers
  catalog.go                    # ADR-007 — func Diagnostic(code, locale string) string

internal/i18n/translationfileparser/
  liquid_parser.go              # ADR-001 panic boundary, ADR-002 DiagnosticParser
  liquid_parser_test.go         # >90% coverage, table-driven, benchmarks, race test
  testdata/
    liquid/
      basic.liquid              # {{ 'key' | t }}
      pluralized.liquid         # {{ 'key' | t: count: n }}
      interpolated.liquid       # {{ 'key' | t: name: val }}
      html_safe.liquid          # {{ 'key_html' | t }}
      in_comment.liquid         # {% comment %}{{ 'skip' | t }}{% endcomment %}
      in_raw.liquid             # {% raw %}{{ 'skip' | t }}{% endraw %}
      dynamic_key.liquid        # {{ variable | t }} — W001 source
      chained.liquid            # {{ 'key' | t | upcase }}
      empty.liquid              # no keys — tests graceful no-op
      invalid.liquid             # malformed syntax — tests panic boundary
      non_t.liquid              # valid Liquid, no | t — tests irrelevant files
  baseline.txt                  # ADR-004 committed benchmark reference

.github/workflows/
  liquid-capability.yml         # ADR-009 — weekly canary against @latest

docs/
  liquid-parser.md              # NFR-D1 — supported tags, W001 meaning, i18n.yml example
```

**Modified files:**

```
internal/i18n/translationfileparser/
  strategy.go                   # + append .liquid registration in NewDefaultStrategy()

go.mod                          # + require github.com/osteele/liquid v1.6.0
go.sum                          # updated by go get

apps/cli/cmd/
  check.go                      # imports check_diagnostics.go, calls collectDiagnostics()
  check_diagnostics.go          # NEW within cmd/ — always extracted, never inlined
```

### Architectural Boundaries

**Parser Boundary (`internal/i18n/translationfileparser/`):**

- `LiquidParser` implements `Parser`, `ContextParser`, and `DiagnosticParser`
- Imports `pkg/diagnostics.Diagnostic` for side-channel emission
- `testdata/liquid/` embedded by `go test`; fixtures are package-local
- External dependency: `github.com/osteele/liquid` only

**Diagnostics Boundary (`pkg/diagnostics/`):**

- `diagnostic.go` defines canonical `Diagnostic` struct (Code, Severity, File, Line, Message, Suggestion)
- `catalog.go` provides `func Diagnostic(code, locale string) string`
- No `internal/` imports — can be consumed by any parser package

**Command Boundary (`apps/cli/cmd/`):**

- `check.go` iterates sources, dispatches via `strategy.go`, delegates diagnostic serialization to `check_diagnostics.go`
- `check_diagnostics.go` contains `collectDiagnostics()` and `diagnosticsToJSON()` — parser-agnostic, reusable for future `DiagnosticParser` implementations
- No changes to flag surface or command registration

**Service Boundary (`apps/cli/internal/i18n/runsvc/`):**

- `runsvc` already dispatches parsing via strategy; type-asserts to `DiagnosticParser` for W001 emission
- Panic recovery: `errors.As(err, &LiquidParseError{})` → skip file, `slog.Warn`, continue
- `flushOutputs` atomic per file — no changes needed

**CI Boundary (`.github/workflows/`):**

- `liquid-capability.yml` is a **canary job** — runs weekly against `@latest`, never blocks PRs or main CI
- On failure: visible in Actions tab, signals upstream AST break before Dependabot proposes a broken bump
- Trigger: `schedule: cron: '0 0 * * 0'` + `workflow_dispatch`

### Requirements to Structure Mapping

| FR Category                | File(s)                                                                  | Notes                                                       |
| -------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------- |
| FR1–FR7 Parser Core        | `liquid_parser.go`, `pkg/diagnostics/diagnostic.go`                      | Implements all three interfaces                             |
| FR8–FR11 Error & Context   | `liquid_parser.go` (panic boundary), `diagnostic.go`                     | `LiquidParseError`, `Diagnostic`                            |
| FR12–FR16 Check Command    | `check.go` (modified), `check_diagnostics.go` (new)                      | JSON findings array, coverage table                         |
| FR17–FR18 Init Auto-detect | `strategy.go` (modified)                                                 | `.liquid` registration enables auto-detection               |
| FR19–FR21 Init Config      | `docs/liquid-parser.md`                                                  | `i18n.yml` example in docs                                  |
| FR24–FR25 Coverage Report  | `check.go`, `check_diagnostics.go`                                       | Coverage array + TTY table                                  |
| FR30–FR32 Diagnostics      | `liquid_parser.go`, `check_diagnostics.go`, `pkg/diagnostics/catalog.go` | W001 emission + catalog                                     |
| NFR-P1 Performance         | `liquid_parser.go`, `baseline.txt`                                       | Benchmark in `liquid_parser_test.go`                        |
| NFR-R1 Zero Panics         | `liquid_parser.go`                                                       | `defer recover()` in `ParseWithDiagnostics`                 |
| NFR-R2 Backward Compat     | `strategy.go` (one line append)                                          | Existing parsers untouched                                  |
| NFR-R3 Concurrency         | `liquid_parser_test.go`                                                  | `TestLiquidParserConcurrent` — 100 goroutines, same fixture |
| NFR-M1 Fixture Coverage    | `testdata/liquid/` (11 fixtures)                                         | Happy paths + edge cases + error cases                      |
| NFR-M4 Lint Compliance     | All `.go` files                                                          | `exhaustruct`, `gochecknoglobals`, `errname`                |
| NFR-D1 Quickstart Docs     | `docs/liquid-parser.md`                                                  | Supported tags, W001 meaning, config example                |
| ADR-009 Vendor Monitor     | `.github/workflows/liquid-capability.yml`                                | Weekly canary against `@latest`                             |

### Integration Points

**Data Flow (`.liquid` → locale JSON):**

```
.liquid file  →  strategy.go (dispatches by ext)  →  LiquidParser.ParseWithDiagnostics()
                                                       ↓
                                                 keys + diags (W001)
                                                       ↓
                                              runsvc correlates with JSONParser output
                                                       ↓
                                              LLM translation of missing keys
                                                       ↓
                                              Atomic flush to locales/{locale}.json
```

**Diagnostic Flow (W001 → JSON report):**

```
LiquidParser.ParseWithDiagnostics()  →  []Diagnostic  →  check_diagnostics.go collects
                                                              ↓
                                                        JSON report findings[]
                                                              ↓
                                                        GitHub Action annotations
```

**Error Flow (panic → skip → slog):**

```
ParseTemplate() panics  →  defer recover()  →  LiquidParseError  →  runsvc errors.As()
                                                              ↓
                                                        slog.Warn("skipped file")
                                                              ↓
                                                        Continue next file
```

**Canary Flow (weekly vendor check):**

```
liquid-capability.yml  →  go get @latest  →  go test ./...  →  pass (silent) or fail (alert)
```

### Party Mode Round 1 Insights (Amelia, Winston, Paige)

- `Diagnostic` type must be cross-cutting → lives in `pkg/diagnostics/diagnostic.go`, imported by `internal/`
- `check.go` size unknown → adaptive rule: always extract to `check_diagnostics.go` in `cmd/`, never inline
- Missing fixtures: `empty.liquid`, `invalid.liquid`, `non_t.liquid` for edge-case coverage
- `go.sum` must be committed alongside `go.mod`
- `.github/workflows/liquid-capability.yml` needed for ADR-009 weekly canary

### Party Mode Round 2 Insights (Amelia, Winston, Mary)

- `check_findings.go` renamed to `check_diagnostics.go` — clearer intent
- `TestLiquidParserConcurrent` added for `go test -race` coverage
- `docs/liquid-parser.md` added for NFR-D1 quickstart
- No Makefile target for baseline — command documented in architecture, self-documenting in test file

### Party Mode Round 3 Insights (Amelia, Winston)

- `check_diagnostics.go` always extracted — rule is unconditional, not adaptive
- `liquid-capability.yml` is canary only (non-blocking), `workflow_dispatch` enabled for manual trigger
- Benchmark generation: `go test -bench=BenchmarkLiquidParser -count=10 ./internal/i18n/translationfileparser/`, developer copies median to `baseline.txt`

## Architecture Validation Results

### Coherence Validation ✅

**Decision Compatibility:**

- `osteele/liquid@v1.6.0` pure-Go with exported AST — compatible with Go 1.26, no CGO conflicts
- `DiagnosticParser` optional interface is standard Go pattern — no contradiction with existing interfaces
- Panic boundary in `ParseWithDiagnostics` with nil-safe fallback via `ParseWithContext` wrapper — single recovery point
- `gochecknoglobals` satisfied by per-call `liquid.Engine` and function-scoped diagnostic catalog
- `exhaustruct` satisfied by explicit struct initialization everywhere

**Pattern Consistency:**

- Naming conventions align with existing codebase and `errname` linter
- `Diagnostic` type in `pkg/diagnostics/` imported by `internal/` — import direction correct, no cycles
- `testdata/liquid/` co-located — matches Go standard
- JSON report schema distinct from web API error shape — no collision

**Structure Alignment:**

- All ADRs map to specific files (see Requirements to Structure Mapping above)
- `check_diagnostics.go` is parser-agnostic — supports future `DiagnosticParser` implementations
- `go.mod` + `go.sum` modification captured as explicit pre-implementation step

### Requirements Coverage Validation ✅

All 42 FRs and 22 NFRs are architecturally supported. See detailed mapping in Project Structure & Boundaries section. Key coverage:

- FR1–FR7: `liquid_parser.go` + `Diagnostic` + `DiagnosticParser`
- FR12–FR16: `check.go` + `check_diagnostics.go`
- FR30–FR32: `DiagnosticParser` + `pkg/diagnostics/catalog.go`
- NFR-P1/P5: `baseline.txt` + PR benchmark gate in CI
- NFR-R1: `defer recover()` in `ParseWithDiagnostics`
- NFR-R2: `strategy.go` one-line append
- NFR-R3: `TestLiquidParserConcurrent` + `go test -race`
- NFR-M1: 11 fixtures (8 happy + 3 edge/error)
- NFR-M4: All patterns enforce `exhaustruct`, `gochecknoglobals`, `errname`
- NFR-D1: `docs/liquid-parser.md` required artifact

### Implementation Readiness Validation ✅

**Decision Completeness:**

- All 6 Critical ADRs (001–006) have file assignments and signatures
- All 4 Important ADRs (007–010) have implementation paths
- All 3 Deferred ADRs (011–013) have activation triggers

**Structure Completeness:**

- 11 new files, 4 modified files, 1 new workflow explicitly listed
- Import graph verified: no cycles

**Pattern Completeness:**

- `LiquidParser` is `struct{}` (stateless, zero-value)
- `ParseWithContext` delegates to `ParseWithDiagnostics(content, nil)` — single panic boundary
- `diags` nil-safe: `if diags != nil { *diags = append(*diags, d) }`
- `Severity` typed with consts
- Error wrapping uses `%w`; `LiquidParseError.Unwrap()` returns `nil`

### Gap Analysis Results

**Critical Gaps (All Resolved in Party Mode):**
| Gap | Resolution |
|---|---|
| `context.Value` goroutine-safety flaw | `DiagnosticParser` optional interface with `*[]Diagnostic` |
| `Diagnostic` type location ambiguity | `pkg/diagnostics/diagnostic.go` (cross-cutting) |
| `check.go` inline vs extracted | Always `check_diagnostics.go` in `cmd/`, unconditional |
| `LiquidParseError` location unspecified | `liquid_parser.go`, bottom of file |
| `Severity` type undefined | `type Severity string` with consts in `pkg/diagnostics/` |
| `check_diagnostics.go` signatures missing | `collectDiagnostics()` + `diagnosticsToReport()` specified |
| AST API guidance absent | One-line reference to `ast.FilterNode` with `.Name == "t"` |
| Panic boundary interface mismatch | `ParseWithContext` delegates to `ParseWithDiagnostics(content, nil)` |
| Equivalence logic unplaced | Inline `reflect.DeepEqual`, no helper package |
| `init` auto-detect assumption | Documented as risk; deferred to epic AC if hardcoded |
| PR benchmark gate missing | Modify existing CI workflow, add benchmark job |
| Baseline clock not started | `_bmad-output/LIQUID_BASELINE.md` created with `start_date: 2026-04-25` |
| `go.mod` commit timing | `go get github.com/osteele/liquid@v1.6.0` is Step 1 of implementation |
| `go mod tidy` after `go get` | Added to enforcement guidelines |
| Unknown block tag behavior | Handled by ADR-001 panic boundary — file skipped, not fatal |

### Architecture Completeness Checklist

**✅ Requirements Analysis**

- [x] Project context thoroughly analyzed
- [x] Scale and complexity assessed
- [x] Technical constraints identified
- [x] Cross-cutting concerns mapped

**✅ Architectural Decisions**

- [x] Critical decisions documented with versions
- [x] Technology stack fully specified
- [x] Integration patterns defined
- [x] Performance considerations addressed

**✅ Implementation Patterns**

- [x] Naming conventions established
- [x] Structure patterns defined
- [x] Communication patterns specified
- [x] Process patterns documented

**✅ Project Structure**

- [x] Complete directory structure defined
- [x] Component boundaries established
- [x] Integration points mapped
- [x] Requirements to structure mapping complete

**✅ Validation**

- [x] Coherence validated
- [x] Requirements coverage verified
- [x] Implementation readiness confirmed
- [x] All gaps identified and resolved

### Architecture Readiness Assessment

**Overall Status:** READY FOR IMPLEMENTATION

**Confidence Level:** HIGH

**Key Strengths:**

- Single panic boundary with typed error — robust and testable
- Optional `DiagnosticParser` interface — backward compatible, future-proof
- `pkg/diagnostics/` catalog — copy changes without recompilation
- 11 test fixtures for >90% coverage target
- Weekly canary against `@latest` — early warning on upstream breakage
- Decommissioning cost: delete one file + one registration line

**Areas for Future Enhancement:**

- `{% translate %}` block tag support (ADR-011, deferred to Phase 2)
- Schema locale files (ADR-012, deferred — same JSON format)
- Second parser effort tracking (ADR-013, deferred — `LIQUID_BASELINE.md` started)
- `init` auto-detect extension scanning verification (risk if hardcoded list)

### Implementation Handoff

**AI Agent Guidelines:**

- Follow all architectural decisions exactly as documented
- Use implementation patterns consistently across all components
- Respect project structure and boundaries
- Refer to this document for all architectural questions

**First Implementation Priority:**

1. `go get github.com/osteele/liquid@v1.6.0` (updates `go.mod` + `go.sum`)
2. `go mod tidy`
3. `pkg/diagnostics/diagnostic.go` + `catalog.go`
4. `internal/i18n/translationfileparser/diagnostic.go` (types)
5. `internal/i18n/translationfileparser/liquid_parser.go` + `liquid_parser_test.go`
6. `internal/i18n/translationfileparser/baseline.txt` (after benchmark run)
7. `internal/i18n/translationfileparser/strategy.go` (one-line registration)
8. `apps/cli/cmd/check_diagnostics.go`
9. `.github/workflows/liquid-capability.yml`
10. `docs/liquid-parser.md`
