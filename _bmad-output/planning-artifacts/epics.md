---
stepsCompleted: [1, 2, 3, 4]
status: complete
inputDocuments:
  - "_bmad-output/planning-artifacts/prd.md"
  - "_bmad-output/planning-artifacts/architecture.md"
---

# hyperlocalise - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for the Hyperlocalise Liquid Parser feature, decomposing requirements from the PRD and Architecture into implementable stories.

## Requirements Inventory

### Functional Requirements

**FR1:** The Hyperlocalise CLI can parse `.liquid` files using a `LiquidParser` that implements the existing `Parser` interface (`Parse` + `ParseWithContext`).

**FR2:** A developer can extract every static translation key from `{{ 'key.path' | t }}` calls across a `.liquid` file with zero false negatives on the canonical Liquid test corpus.

**FR3:** The parser can correctly skip translation-filter calls inside `{% comment %}` blocks, `{% raw %}` blocks, and Liquid string literals, emitting no findings for those occurrences.

**FR4:** The parser can correctly handle chained Liquid filters where `t` appears in any filter position (e.g., `{{ 'k' | upcase | t }}` and `{{ 'k' | t | escape }}`).

**FR5:** The parser can correctly handle `html_safe` filter compositions and `t`-filter calls inside `{% capture %}` blocks.

**FR6:** The parser can detect dynamic translation-filter calls (e.g., `{{ variable | t }}`, `{{ section.settings.label | t }}`) and emit a `W001-liquid-dynamic-key` diagnostic for each occurrence.

**FR7:** A `W001-liquid-dynamic-key` diagnostic record can carry a stable diagnostic code, source file path, line number, and a human-readable resolution hint.

**FR7b:** `W001-liquid-dynamic-key` findings and parse-error findings emitted by the Liquid parser reach the caller with their full payload intact, are rendered into both TTY output and `--json-report` JSON output, and do not flow through the `Parser` / `ContextParser` return values (side-channel mechanism).

**FR8:** The CLI can continue past individual `.liquid` files that fail to parse, emitting a parse-error finding for each failed file rather than aborting the entire run.

**FR9:** A developer can run `hyperlocalise init` in a Shopify theme directory and have the CLI auto-detect the theme layout.

**FR10:** The auto-detection in `init` can produce an `i18n.yml` with `parser: liquid`, Shopify-flavored `sources:` glob, and `locale_files:` glob using sensible defaults without user prompts.

**FR11:** A developer can override auto-detected paths by editing `i18n.yml` (e.g., `theme/config/locales/` instead of `locales/`) and have the CLI honor those overrides.

**FR12:** A monorepo developer can register `parser: liquid` in a root-level or per-package `i18n.yml` alongside `parser: json` / `parser: arb` / `parser: html` registrations without configuration collisions.

**FR13:** The CLI can run with `parser: liquid` registered without altering any observable behavior of the existing JSON, ARB, or HTML parsers in the same project.

**FR14:** A developer can configure target locales for a Liquid project via the existing `locales:` mechanism in `i18n.yml`.

**FR15:** A developer can run `hyperlocalise run --config <path> --locale <list>` against a `.liquid` source set and produce translated locale files for all requested locales.

**FR16:** A developer can pass multiple locales (e.g., `--locale fr,de,it,es,nl,sv`) in a single `run` invocation and have all locales translated.

**FR17:** A developer can re-run `hyperlocalise run` after an interrupted or rate-limited execution and have the CLI skip translations already persisted to locale files (idempotent re-run).

**FR17b:** When `hyperlocalise run` is interrupted mid-execution, the CLI can preserve all per-locale translations completed before the interruption, with each locale file written atomically.

**FR18:** A developer can run `hyperlocalise run --dry-run` against a `.liquid` source set to preview planned translation work without invoking the LLM provider or writing locale files.

**FR19:** A developer can run `hyperlocalise check` against a `.liquid` project offline (without LLM provider credentials) and receive a complete set of findings.

**FR20:** The `check` command can report missing translation keys (present in source `.liquid` files but absent in target locale files) per target locale.

**FR21:** The `check` command can report orphan translation keys (present in target locale files but absent in source `.liquid` files) per target locale.

**FR22:** The `check` command can emit `W001-liquid-dynamic-key` findings alongside missing/orphan key findings in a unified report.

**FR23:** A developer can run `hyperlocalise check --json-report <path>` and produce a machine-consumable JSON report consumable by CI annotations, GitHub Apps, and ticketing systems.

**FR24:** The `check` JSON report can carry a top-level `coverage[]` array with per-file entries containing file path, parser identifier, total keys, extracted keys, dynamic keys, and parse-error count when `.liquid` files are present.

**FR25:** The `check` TTY output can render a per-file coverage table for `.liquid` files when Liquid sources are present in `i18n.yml`, in addition to the existing aggregated counts.

**FR26:** A developer can run `hyperlocalise check --no-fail` to receive findings in the report without the CLI returning a non-zero exit code.

**FR27:** A developer can rely on grouped end-of-run diagnostic summaries (not interleaved with progress lines) when `run` or `check` emits multiple findings.

**FR28:** A platform engineer can use `hyperlocalise/action@v1` in a GitHub workflow with the existing `action.yml` inputs without modification when the project contains `.liquid` files.

**FR29:** The action can fail a CI run with a non-zero exit code when `inputs.severity-threshold: error` is set and the `check` report contains error-level findings.

**FR30:** The action can emit inline GitHub workflow annotations from `check --json-report` output when `inputs.github-annotations: 'true'`, surfacing each finding at its source file and line.

**FR31:** A platform engineer can schedule `hyperlocalise/action@v1` with `inputs.check: drift` to detect drift on `.liquid` projects on a recurring schedule.

**FR32:** A platform engineer can consume `check --json-report` JSON output downstream (Linear, Slack, custom GitHub Apps) using a stable schema that does not break across Hyperlocalise minor versions.

**FR33:** The CLI can guarantee that `check --json-report` JSON schema receives only additive changes within a major version (no field removals, renames, or type changes).

**FR34:** The CLI can be upgraded across a minor version (e.g., 1.2.x → 1.3.x adding Liquid) without altering the JSON output of `check --json-report` for projects that contain only `.json`, `.arb`, or `.html` source files.

**FR35:** A studio operator can pin a Hyperlocalise version in CI and run before/after diffs of `check --json-report` output across heterogeneous projects to verify upgrade safety.

**FR36:** A developer can read a Shopify-themes quickstart at `hyperlocalise.dev/workflows/shopify-themes` covering `init` → `run` → `check` end-to-end with copy-pasteable commands.

**FR37:** A developer can read a versioned diagnostic-code registry at `docs/diagnostics.md` listing every emittable code (initially `W001-liquid-dynamic-key`) with stable identifier, resolution hint, and version-added marker.

**FR38:** A developer can find Shopify-specific GitHub Action YAML examples in the `hyperlocalise/action@v1` documentation, using only the input names declared in the canonical `action.yml`.

**FR39:** The CLI can read LLM API credentials only from environment variables or a developer-local `.env.local` file; it cannot read credentials from any committed file (including `i18n.yml`).

**FR40:** A developer can run `hyperlocalise check` and `hyperlocalise drift` to completion without any LLM provider credentials configured.

**FR41:** A maintainer can publish license attribution for `osteele/liquid` (MIT) and any other third-party dependencies in a project-level `THIRD_PARTY_LICENSES.md` (or equivalent) shipped with each release.

### Non-Functional Requirements

**NFR-P1 (Performance - gated):** On a GitHub Actions `ubuntu-latest` runner, `hyperlocalise run` against a small Shopify theme (≤500 keys, ≤50 `.liquid` files) completes parsing and static key extraction in **<10 seconds**, excluding LLM wall-clock time.

**NFR-P2 (Performance - gated):** On the same runner, `hyperlocalise run` against a large Shopify theme (≤5,000 keys, ≤500 `.liquid` files) completes parsing and static key extraction in **<60 seconds**, excluding LLM wall-clock time.

**NFR-P3 (Performance - gated):** On the same runner, `hyperlocalise check` against the large theme profile completes in **<20 seconds**.

**NFR-P4 (Performance - DX target):** On a reference developer laptop (Apple M1 Pro / equivalent), small / large / `check` workloads target **<5 s / <30 s / <10 s** respectively.

**NFR-P5 (Performance - regression gate):** Go benchmarks run on every PR. A PR fails if >20% slower than the rolling median of the last 10 main-branch benchmark runs.

**NFR-R1 (Reliability):** `hyperlocalise run` writes every target locale file atomically (write-to-temp + rename).

**NFR-R2 (Reliability):** `hyperlocalise run` flushes completed translations to disk incrementally, preserving all translations completed before any mid-run interruption.

**NFR-R3 (Reliability):** `run` and `check` are idempotent against an unchanged source set.

**NFR-R4 (Reliability):** For any mixed source set containing valid and malformed `.liquid` files, `hyperlocalise run` must translate every valid file, emit exactly one parse-error finding per malformed file, never abort mid-run, and return exit code 0 unless severity threshold dictates otherwise.

**NFR-R5 (Reliability):** The Liquid parser wraps every call into `github.com/osteele/liquid` in a `defer recover()` boundary. Recovered panics convert to parse-error findings without propagating up.

**NFR-S1 (Security):** LLM API credentials are read only from environment variables or `.env.local`. Any attempt to read from `i18n.yml` fails at config-load time.

**NFR-S2 (Security):** Zero telemetry. `check` and `drift` make zero outbound network requests; `run` makes outbound requests only to the configured LLM provider.

**NFR-S3 (Security):** Credential values never appear in stdout, stderr, `check --json-report` output, progress UI, or artifact uploads.

**NFR-C1 (Stability):** `check --json-report` carries a top-level `schemaVersion` field (value `1`, introduced with Liquid release). Additive-only changes within a `schemaVersion`.

**NFR-C2 (Stability):** Diagnostic codes are permanent identifiers. Once published, never renumbered, repurposed, or deleted.

**NFR-C3 (Stability):** Adding a new parser registration must not alter `check --json-report` output for projects with only pre-existing parsers (structural equivalence).

**NFR-C4 (Stability):** Action input surface freeze within `hyperlocalise/action@v1` series. New inputs only with backward-compatible defaults.

**NFR-C5 (Stability):** Minimum Go version pinned in `go.mod`. Bumping requires minor-version release and changelog entry.

**NFR-O1 (Observability):** Diagnostic codes follow pattern `[WE]\d{3}-[a-z0-9-]+`. A finding without a code is a regression.

**NFR-O2 (Observability):** Exit codes are stable: `0` = success, `1` = runtime error, `2` = findings at/above severity threshold.

**NFR-O3 (Observability):** Progress lines during `run` and `check` are grouped (not interleaved) with findings in TTY output.

**NFR-O4 (Observability):** `check --json-report` per-file entries are sorted lexicographically by source path. Deterministic across runs.

**NFR-M1 (Maintainability):** Liquid test corpus at `internal/i18n/translationfileparser/testdata/liquid/` covering: 3 representative Shopify themes, W001 trigger patterns, skip cases, chained-filter cases, malformed-file matrix.

**NFR-M2 (Maintainability):** Golden-file regression tests run on every PR. Updating requires explicit `-update` flag + changelog entry.

**NFR-M3 (Maintainability):** Diagnostic-code registry at `docs/diagnostics.md` kept in sync with Go source via unit test. Emitting an unregistered code fails build.

**NFR-M4 (Maintainability):** Parser benchmarks run in CI and surface per-commit numbers.

**NFR-DX1 (Developer Experience):** Every error/warning finding includes (a) source file path, (b) 1-indexed line number, (c) one-to-two-sentence remediation hint.

**NFR-L1 (Licensing):** Attribution for `osteele/liquid` (MIT) present in `THIRD_PARTY_LICENSES.md` in every release artifact from the release introducing the dependency onward.

**NFR-L2 (Licensing):** Dependency upgrades and additions are license-scanned in CI. Non-permissive licenses block merge.

### Additional Requirements

**Starter Template:** None — brownfield project extending existing hyperlocalise CLI.

**Infrastructure:**

- Add `github.com/osteele/liquid@v1.6.0` to `go.mod` + `go.sum` via `go get`
- `go mod tidy` after dependency addition
- Pin dependency version in `go.mod`

**Integration Requirements:**

- `LiquidParser` must implement existing `Parser` interface (`Parse(content []byte) (map[string]string, error)`)
- `LiquidParser` must optionally implement `ContextParser` interface (`ParseWithContext(content []byte) (map[string]string, map[string]string, error)`)
- `LiquidParser` must optionally implement `DiagnosticParser` interface (`ParseWithDiagnostics(content []byte, diags *[]Diagnostic) (map[string]string, map[string]string, error)`)
- Register `.liquid` extension in `internal/i18n/translationfileparser/strategy.go` `NewDefaultStrategy()` — one-line append
- `check` command must consume `DiagnosticParser` findings without modification to existing `check.go` command logic (extracted to `check_diagnostics.go`)

**API/Compatibility:**

- All public interfaces unchanged (`Parser`, `ContextParser`)
- `DiagnosticParser` is optional — existing parsers unaffected
- `check --json-report` schema additive-only (new `coverage[]` array, `schemaVersion: 1`, `warnings_count`)
- No field removals, renames, or type changes within major version

**Security/Compliance:**

- `gochecknoglobals` linter: no package-level `var` for cached `liquid.Engine` or compiled regex
- `exhaustruct` linter: all struct fields explicitly initialized
- `errname` linter: error types end with `Error`
- Panic boundary (`defer recover()`) at `ParseWithDiagnostics` entry point
- `LiquidParseError` typed error with `Unwrap() error` returning `nil`

**Monitoring/Logging:**

- W001 dynamic-key diagnostics emitted via `slog.Warn` (or equivalent structured logging)
- Grouped end-of-run diagnostic summary (not interleaved with progress lines)
- Parse-error findings per malformed file (continue past, don't abort)

### UX Design Requirements

Not applicable — CLI-only backend feature. All user-facing output uses existing BubbleTea / Lipgloss TUI design system. TTY rendering specifications are covered in FR24–FR27 and NFR-O3.

### FR Coverage Map

| FR    | Epic   | Description                                                  |
| ----- | ------ | ------------------------------------------------------------ |
| FR1   | Epic 1 | LiquidParser implements Parser + ParseWithContext            |
| FR2   | Epic 1 | Static key extraction with zero false negatives              |
| FR3   | Epic 1 | Skip comment/raw/string-literal occurrences                  |
| FR4   | Epic 1 | Chained filter handling (t in any position)                  |
| FR5   | Epic 1 | html_safe and capture-block handling                         |
| FR6   | Epic 1 | W001 dynamic-key detection                                   |
| FR7   | Epic 1 | W001 diagnostic record (code, file, line, hint)              |
| FR7b  | Epic 1 | Side-channel diagnostics emission (not via Parser return)    |
| FR8   | Epic 1 | Continue past malformed files (parse-error finding)          |
| FR9   | Epic 2 | `init` auto-detects Shopify theme layout                     |
| FR10  | Epic 2 | Generates Shopify-flavored `i18n.yml` with sensible defaults |
| FR11  | Epic 2 | Path overrides honored in `i18n.yml`                         |
| FR12  | Epic 2 | Monorepo multi-parser coexistence                            |
| FR13  | Epic 2 | No behavior change to existing JSON/ARB/HTML parsers         |
| FR14  | Epic 2 | Target locales via existing `locales:` mechanism             |
| FR15  | Epic 3 | `run` against .liquid sources produces locale files          |
| FR16  | Epic 3 | Multi-locale single invocation                               |
| FR17  | Epic 3 | Idempotent re-run after interruption                         |
| FR17b | Epic 3 | Atomic flush preserves completed translations                |
| FR18  | Epic 3 | `--dry-run` preview mode                                     |
| FR19  | Epic 4 | `check` runs offline (no LLM credentials)                    |
| FR20  | Epic 4 | Missing-key reporting per locale                             |
| FR21  | Epic 4 | Orphan-key reporting per locale                              |
| FR22  | Epic 4 | W001 findings in unified `check` report                      |
| FR23  | Epic 4 | `--json-report` machine-consumable output                    |
| FR24  | Epic 4 | `coverage[]` array in JSON report                            |
| FR25  | Epic 4 | Per-file Liquid coverage TTY table                           |
| FR26  | Epic 4 | `--no-fail` suppresses non-zero exit                         |
| FR27  | Epic 4 | Grouped (not interleaved) diagnostic summaries               |
| FR28  | Epic 5 | GitHub Action compatibility with existing inputs             |
| FR29  | Epic 5 | Non-zero exit on threshold + findings                        |
| FR30  | Epic 5 | Inline PR annotations from JSON report                       |
| FR31  | Epic 5 | Scheduled `drift` detection                                  |
| FR32  | Epic 5 | Stable JSON schema across minor versions                     |
| FR33  | Epic 5 | Schema additive-only within major version                    |
| FR34  | Epic 5 | Minor upgrade no change for non-Liquid projects              |
| FR35  | Epic 5 | Pin-and-verify upgrade diff workflow                         |
| FR36  | Epic 6 | Shopify quickstart docs                                      |
| FR37  | Epic 6 | Versioned diagnostic-code registry                           |
| FR38  | Epic 6 | Action YAML examples in docs                                 |
| FR39  | Epic 6 | Credentials from env/.env.local only                         |
| FR40  | Epic 6 | Offline check/drift without API key                          |
| FR41  | Epic 6 | License attribution in release artifacts                     |

## Epic List

### Epic 1: Liquid Parser — Static Key Extraction & Diagnostic Emission

A developer can parse `.liquid` template files and extract every static translation key (`{{ 'key' | t }}`) with structured diagnostics for dynamic keys (`W001-liquid-dynamic-key`), while the parser gracefully handles malformed files without aborting the run.
**FRs covered:** FR1, FR2, FR3, FR4, FR5, FR6, FR7, FR7b, FR8
**NFRs addressed:** NFR-R4 (malformed file handling), NFR-R5 (panic-recovery boundary), NFR-P1–P5 (performance), NFR-M1 (test corpus), NFR-DX1 (error quality)

### Epic 2: Shopify Theme Auto-Configuration

A developer can run `hyperlocalise init` in any Shopify theme directory and receive a working `i18n.yml` with auto-detected `.liquid` sources and locale paths, while multi-parser monorepo setups coexist without collisions.
**FRs covered:** FR9, FR10, FR11, FR12, FR13, FR14

### Epic 3: Translation Execution & Recovery

A developer can translate a Shopify theme into multiple target locales in a single command, preview the work before committing LLM calls, and resume safely after rate-limit or network interruptions without losing completed translations.
**FRs covered:** FR15, FR16, FR17, FR17b, FR18
**NFRs addressed:** NFR-R1 (atomic writes), NFR-R2 (incremental flush), NFR-R3 (idempotency)

### Epic 4: Offline Validation & Coverage Reporting

A developer can validate translation completeness offline (no LLM costs), receiving missing-key and orphan-key reports alongside W001 diagnostics, with both a per-file TTY coverage table and a machine-consumable JSON report that downstream CI tools can consume.
**FRs covered:** FR19, FR20, FR21, FR22, FR23, FR24, FR25, FR26, FR27
**NFRs addressed:** NFR-C1 (schemaVersion), NFR-C2 (diagnostic permanence), NFR-O1–O4 (observability), NFR-M2 (golden files)

### Epic 5: CI Integration & Upgrade Safety

A platform engineer can gate pull requests on translation quality using the existing GitHub Action, with inline annotations on missing keys and scheduled drift detection, while trusting that Hyperlocalise minor-version upgrades never break existing non-Liquid projects.
**FRs covered:** FR28, FR29, FR30, FR31, FR32, FR33, FR34, FR35
**NFRs addressed:** NFR-C3 (structural parity), NFR-C4 (input-surface freeze)

### Epic 6: Documentation, Diagnostic Registry & Compliance

Developers can self-serve setup from a Shopify quickstart page, reference a versioned diagnostic-code registry, and verify that the CLI never reads secrets from committed files while maintaining proper third-party license attribution in every release.
**FRs covered:** FR36, FR37, FR38, FR39, FR40, FR41
**NFRs addressed:** NFR-S1–S3 (security), NFR-L1–L2 (licensing), NFR-M3 (registry sync)

## Epic 1: Liquid Parser — Static Key Extraction & Diagnostic Emission

A developer can parse `.liquid` template files and extract every static translation key (`{{ 'key' | t }}`) with structured diagnostics for dynamic keys (`W001-liquid-dynamic-key`), while the parser gracefully handles malformed files without aborting the run.

### Story 1.1: Bootstrap Liquid Parser Skeleton

As a Hyperlocalise maintainer,
I want the `github.com/osteele/liquid` dependency added and a `LiquidParser` struct that implements the existing `Parser` interface,
So that the project compiles and the parser can be registered in the strategy dispatcher.

**Acceptance Criteria:**

**Given** the repo has an existing `go.mod`
**When** a dev agent runs `go get github.com/osteele/liquid@v1.6.0` and `go mod tidy`
**Then** the dependency is pinned at `v1.6.0` and the build succeeds
**And** a new `internal/i18n/translationfileparser/liquid_parser.go` file exists containing a `LiquidParser` struct
**And** `LiquidParser` implements `Parse(content []byte) (map[string]string, error)` and `ParseWithContext(content []byte) (map[string]string, map[string]string, error)`
**And** `ParseWithContext` returns a map of key→context where context contains the source file path and line number of the `t` filter call, or delegates to `Parse()` with empty context strings pending future enrichment
**And** the existing `strategy.go` `NewDefaultStrategy()` appends `.liquid` extension registration without breaking existing parsers
**And** the dev agent validates that `osteele/liquid` AST exposes filter chains uniformly for core filters (`escape`, `upcase`) and user-defined filters

### Story 1.2: Extract Static Translation Keys

As a Shopify theme developer,
I want `LiquidParser` to find every `{{ 'key.path' | t }}` expression in a `.liquid` file and return the key strings,
So that I know nothing was missed during localization.

**Acceptance Criteria:**

**Given** a `.liquid` file containing `{{ 'header.nav.home' | t }}` and `{{ 'footer.copyright' | t }}`
**When** `LiquidParser.Parse()` is called with the file content
**Then** the returned map contains exactly `"header.nav.home"` and `"footer.copyright"` as keys
**And** no other strings are included in the map

### Story 1.3: Skip Non-Translatable Regions

As a developer,
I want the parser to ignore `{{ ... | t }}` inside `{% comment %}` blocks, `{% raw %}` blocks, and Liquid string literals,
So that commented-out or raw template code doesn't create false positives.

**Acceptance Criteria:**

**Given** a `.liquid` file with `{% comment %}{{ 'ignored' | t }}{% endcomment %}` and `{% raw %}{{ 'also_ignored' | t }}{% endraw %}`
**When** `LiquidParser.Parse()` is called
**Then** neither `'ignored'` nor `'also_ignored'` appears in the output map
**And** a regular (non-comment, non-raw) `{{ 'included' | t }}` is still extracted

### Story 1.4: Handle Chained Liquid Filters

As a developer,
I want the parser to correctly extract keys when `t` appears in any filter chain position,
So that real-world filter usage doesn't break extraction.

**Acceptance Criteria:**

**Given** a `.liquid` file containing `{{ 'k' | upcase | t }}` and `{{ 'k' | t | escape }}`
**When** `LiquidParser.Parse()` is called
**Then** `'k'` is extracted from both expressions
**And** a chain with no `t` filter (`{{ 'k' | upcase }}`) produces nothing

### Story 1.5: Handle `html_safe` and `capture` Blocks

As a developer,
I want the parser to support `html_safe` compositions and `t`-filter calls inside `{% capture %}` blocks,
So that advanced Liquid patterns are covered.

**Acceptance Criteria:**

**Given** a `.liquid` file with `{% capture myvar %}{{ 'key' | t }}{% endcapture %}` and `{{ 'key2' | html_safe | t }}`
**When** `LiquidParser.Parse()` is called
**Then** both `'key'` and `'key2'` are extracted

### Story 1.6: Detect Dynamic Keys and Emit W001 Diagnostics

As a developer,
I want dynamic `t`-filter calls (e.g., `{{ variable | t }}`) to be detected and emitted as `W001-liquid-dynamic-key` diagnostics,
So that I can triage untranslatable strings.

**Acceptance Criteria:**

**Given** a `.liquid` file containing `{{ product.title | t }}` and `{{ 'static.key' | t }}`
**When** `LiquidParser.ParseWithDiagnostics()` is called (via the `DiagnosticParser` interface)
**Then** `'static.key'` is in the returned map
**And** a diagnostic with `code: "W001-liquid-dynamic-key"` is emitted for the `product.title` occurrence
**And** the diagnostic includes `file_path`, `line_number`, and `hint` populated via `DefaultDiagnosticHint("W001-liquid-dynamic-key")` to ensure single source of truth between code and registry
**And** diagnostics are emitted via a side-channel `[]Diagnostic` pointer, not in the return map

### Story 1.7: Recover from Malformed Files

As a developer,
I want the parser to catch panics from `osteele/liquid` on adversarial input and convert them to parse-error findings,
So that one malformed file doesn't abort the entire run.

**Acceptance Criteria:**

**Given** a `.liquid` file with unbalanced tags (`{% if %}...`) that would cause the third-party parser to panic
**When** `LiquidParser.Parse()` is called
**Then** the panic is recovered via `defer recover()`
**And** a typed `LiquidParseError` is returned with `Unwrap() error` returning `nil`
**And** the error message contains the file path and a description of the parse failure
**And** given `Parse()` returns a non-panicking error for a malformed file, the error is logged, the file is skipped, and processing continues for remaining files

### Story 1.8: Canonical Test Corpus and Golden Files

As a maintainer,
I want a comprehensive test corpus covering all edge cases,
So that every PR is validated against known-good extraction behavior.

**Acceptance Criteria:**

**Given** a `testdata/liquid/` directory with fixtures for: basic key, comment-block, raw-block, dynamic key, chained filter, malformed file, `capture` block, `html_safe`
**When** tests run with `-update` flag
**Then** golden files are generated for expected output maps and diagnostic lists
**And** subsequent test runs (without `-update`) pass only if actual output matches golden files exactly
**And** CI fails if golden files are out of sync
**And** given the canonical corpus of 500 keys across 50 `.liquid` files totaling <1MB, `LiquidParser.Parse()` benchmark median completes in <10s on an `ubuntu-latest` GitHub Actions runner

### Story 1.9: Benchmark CI Gate

As a maintainer,
I want CI to fail if Liquid parser benchmarks exceed the 10-second baseline,
So that the NFR-P1 performance guarantee is enforced on every PR.

**Acceptance Criteria:**

**Given** a PR modifies `liquid_parser.go`
**When** CI runs
**Then** `go test -bench=. ./internal/i18n/translationfileparser/...` executes
**And** the build fails if Liquid parser benchmark median exceeds 10s baseline

## Epic 2: Shopify Theme Auto-Configuration

A developer can run `hyperlocalise init` in any Shopify theme directory and receive a working `i18n.yml` with auto-detected `.liquid` sources and locale paths, while multi-parser monorepo setups coexist without collisions.

### Story 2.1: Auto-Detect Shopify Theme Directory Layout

As a developer,
I want `hyperlocalise init` to detect when it's run inside a Shopify theme directory,
So that it can automatically suggest `.liquid` source paths and locale directories.

**Acceptance Criteria:**

**Given** a directory containing `locales/en.default.json` and `sections/header.liquid`
**When** `hyperlocalise init` is run
**Then** the CLI auto-detects Shopify theme layout and writes `.liquid` source paths without interactive prompts (non-interactive by default; `--interactive` flag optionally shows a preview before writing)
**And** detected source paths include `snippets/**/*.liquid`, `sections/**/*.liquid`, `templates/**/*.liquid`
**And** the generated `i18n.yml` contains a commented link to `hyperlocalise.dev/workflows/shopify-themes`

### Story 2.2: Generate Shopify-Flavored `i18n.yml`

As a developer,
I want the generated `i18n.yml` to contain sensible Shopify defaults,
So that I don't have to manually configure paths.

**Acceptance Criteria:**

**Given** `hyperlocalise init` in a Shopify theme directory
**When** the generated `i18n.yml` is written
**Then** it contains `parsers: [liquid]` plus `json` only if `**/*.json` files matching translation patterns are detected in the source tree
**And** `sources: [snippets/**/*.liquid, sections/**/*.liquid, templates/**/*.liquid]`
**And** `output_dir: locales/` and `source_locale: en.default`
**And** the CLI prints the quickstart URL `hyperlocalise.dev/workflows/shopify-themes` after `init` completes

### Story 2.3: Honor Path Overrides in `i18n.yml`

As a developer in a custom theme structure,
I want path overrides in `i18n.yml` to take precedence over auto-detected defaults,
So that non-standard project layouts are supported.

**Acceptance Criteria:**

**Given** an `i18n.yml` with explicit `sources: [custom/**/*.liquid]` and `output_dir: translations/`
**When** `hyperlocalise run` is executed
**Then** only `custom/**/*.liquid` files are parsed
**And** output is written to `translations/` rather than `locales/`

### Story 2.4: Monorepo Multi-Parser Coexistence

As a monorepo developer,
I want to configure multiple parsers in the same `i18n.yml` with per-parser source patterns,
So that a single Hyperlocalise instance handles all translation files without collisions.

**Acceptance Criteria:**

**Given** an `i18n.yml` with `parsers: [json, liquid]` and per-parser `sources` blocks
**When** `hyperlocalise run` is executed
**Then** JSON files are parsed by the JSON parser and `.liquid` files by the Liquid parser
**And** each parser only processes files matching its assigned glob patterns

### Story 2.5: Zero Regression for Existing Parsers

As an existing Hyperlocalise user,
I want my existing JSON, ARB, and HTML parsers to behave identically after the Liquid parser is added,
So that upgrading is safe for non-Shopify projects.

**Acceptance Criteria:**

**Given** a project using only JSON/ARB parsers with existing `i18n.yml`
**When** Hyperlocalise is upgraded to the version containing the Liquid parser
**Then** `hyperlocalise run` and `hyperlocalise check` produce identical output and exit codes
**And** no `.liquid` files are scanned unless explicitly configured

### Story 2.6: Target Locales via Existing `locales:` Mechanism

As a developer,
I want target locales for Liquid translations to use the same `locales:` configuration key,
So that I don't need new syntax.

**Acceptance Criteria:**

**Given** an `i18n.yml` with `locales: [de, fr, ja]` and `parsers: [liquid]`
**When** `hyperlocalise run` is executed
**Then** German, French, and Japanese locale files are generated for `.liquid` sources
**And** the same `locales:` key works identically for JSON, ARB, and Liquid parsers
**And** locales are resolved via the existing `pkg/i18nconfig` package, consistent with JSON/ARB parser behavior

## Epic 3: Translation Execution & Recovery

A developer can translate a Shopify theme into multiple target locales in a single command, preview the work before committing LLM calls, and resume safely after rate-limit or network interruptions without losing completed translations.

### Story 3.1: `run` Produces Locale Files from `.liquid` Sources

As a developer,
I want `hyperlocalise run` to parse `.liquid` source files, extract all static keys, translate them via LLM, and write `.json` locale files,
So that my Shopify theme has translated locale files.

**Acceptance Criteria:**

**Given** an `i18n.yml` with `parsers: [liquid]`, `sources: [snippets/**/*.liquid]`, `locales: [de]`, and `output_dir: locales/`
**When** `hyperlocalise run` is executed with valid LLM credentials
**Then** the CLI parses all matching `.liquid` files
**And** extracts static keys and translates them to German
**And** writes `locales/de.json` containing all translated key/value pairs
**And** the output matches the existing JSON locale file format
**And** progress is rendered via the existing BubbleTea TUI, showing files scanned, keys extracted, and translations completed per locale
**And** malformed `.liquid` files produce a logged warning, are excluded from translation, and do not abort the command
**And** locales are resolved via the existing `pkg/i18nconfig` package, consistent with JSON/ARB parser behavior

### Story 3.2: Multi-Locale Single Invocation

As a developer,
I want to translate into multiple target locales in a single `hyperlocalise run` command,
So that I don't need to re-parse and re-extract keys for each locale separately.

**Acceptance Criteria:**

**Given** an `i18n.yml` with `locales: [de, fr, ja]`
**When** `hyperlocalise run` is executed
**Then** the `.liquid` sources are parsed exactly once
**And** three locale files are produced: `locales/de.json`, `locales/fr.json`, `locales/ja.json`
**And** each file contains keys translated into the respective locale
**And** malformed `.liquid` files produce a logged warning, are excluded from translation for all target locales, and do not abort the command
**And** locales are resolved via the existing `pkg/i18nconfig` package, consistent with JSON/ARB parser behavior

### Story 3.3: `--dry-run` Preview Mode

As a developer,
I want a `--dry-run` flag that shows me which files would be parsed and how many keys would be extracted without making any LLM calls or writing files,
So that I can preview the work before committing API costs.

**Acceptance Criteria:**

**Given** an `i18n.yml` with `parsers: [liquid]` and `locales: [de]`
**When** `hyperlocalise run --dry-run` is executed
**Then** the CLI parses `.liquid` files and counts extracted keys
**And** prints a preview summary (files scanned, keys found, locales targeted, estimated cost)
**And** makes zero LLM API calls
**And** writes zero locale files

### Story 3.4: Idempotent Re-Run After Interruption

As a developer,
I want `hyperlocalise run` to be safely resumable after a network failure, rate-limit, or Ctrl-C interruption,
So that completed translations are preserved and only missing/incomplete keys are re-translated.

**Acceptance Criteria:**

**Given** a previous `hyperlocalise run` that translated 50 of 100 keys to `locales/de.json` before interruption
**When** `hyperlocalise run` is executed again
**Then** the existing `locales/de.json` is read to determine which keys are already present
**And** only the remaining 50 untranslated keys are sent to the LLM
**And** the existing 50 translated keys are not overwritten
**And** the final `locales/de.json` contains all 100 keys
**And** this behavior works for all configured target locales independently

## Epic 4: Offline Validation & Coverage Reporting

A developer can validate translation completeness offline (no LLM costs), receiving missing-key and orphan-key reports alongside W001 diagnostics, with both a per-file TTY coverage table and a machine-consumable JSON report that downstream CI tools can consume.

### Story 4.1: `check` Runs Offline (No LLM)

As a developer,
I want `hyperlocalise check` to validate translation completeness without requiring LLM API credentials,
So that I can gate quality locally and in CI without API costs.

**Acceptance Criteria:**

**Given** an `i18n.yml` with `parsers: [liquid]` and a `.liquid` source with keys that have no corresponding locale files
**When** `hyperlocalise check` is run with no `OPENAI_API_KEY` or equivalent env var set
**Then** the command succeeds without making any LLM API calls
**And** reports missing keys as findings
**And** malformed `.liquid` files produce a logged warning, are excluded from validation, and do not abort the command

### Story 4.2: Missing-Key Reporting per Locale

As a developer,
I want `check` to report which translation keys exist in source `.liquid` files but are missing from each target locale file,
So that I can identify gaps before shipping.

**Acceptance Criteria:**

**Given** a `.liquid` file with keys `a.b` and `c.d`, and `locales/de.json` containing only `a.b`
**When** `hyperlocalise check` is run with `locales: [de, fr]`
**Then** it reports `c.d` as missing in `de`
**And** it reports both `a.b` and `c.d` as missing in `fr`
**And** findings include file path, line number, key name, and severity
**And** malformed `.liquid` files produce a logged warning, are excluded from validation, and do not abort the command

### Story 4.3: Orphan-Key Reporting per Locale

As a developer,
I want `check` to report which keys exist in locale files but are no longer present in any source `.liquid` file,
So that I can clean up stale translations.

**Acceptance Criteria:**

**Given** `locales/de.json` with keys `a.b`, `c.d`, `orphan.x` and a `.liquid` source containing only `a.b` and `c.d`
**When** `hyperlocalise check` is run
**Then** it reports `orphan.x` as an orphan key in `locales/de.json`
**And** the finding includes the locale file path, key name, and a hint that the key can be removed

### Story 4.10: Extract Diagnostic Consumption to `check_diagnostics.go`

As a Hyperlocalise maintainer,
I want the `check` command to consume `DiagnosticParser` findings without modifying the existing `check.go` command logic,
So that the `check` command remains parser-agnostic and new parsers can be added without touching core check logic.

**Acceptance Criteria:**

**Given** `check` command executes against a project with `parsers: [liquid]`
**When** the parser emits W001 diagnostics via `DiagnosticParser`
**Then** `check.go` delegates diagnostic collection to `check_diagnostics.go` without importing Liquid-specific types
**And** existing `check` behavior for JSON/ARB projects is unchanged

### Story 4.4: W001 Findings in Unified `check` Report

As a developer,
I want dynamic-key `W001-liquid-dynamic-key` diagnostics from the Liquid parser to appear alongside missing-key and orphan-key findings in the unified `check` output,
So that I see all issues in one place.

**Acceptance Criteria:**

**Given** a `.liquid` file with `{{ product.title | t }}` (dynamic key) and `{{ 'static.key' | t }}` (static key), where `static.key` is missing from `locales/de.json`
**When** `hyperlocalise check` is run
**Then** the output contains a `W001` finding for `product.title` with file and line
**And** a missing-key finding for `static.key`
**And** both findings appear in a single, grouped diagnostic summary (not interleaved with progress bars)
**And** W001 findings are collected via the `check_diagnostics.go` delegation layer without modifying `check.go`

### Story 4.5: `--json-report` Machine-Consumable Output

As a CI engineer,
I want `hyperlocalise check --json-report` to write a structured JSON file that downstream tools can parse,
So that I can integrate findings into dashboards, PR annotations, and alerts.

**Acceptance Criteria:**

**Given** `check` finds missing keys, orphans, and W001 diagnostics
**When** `hyperlocalise check --json-report=report.json` is run
**Then** `report.json` is written with `schemaVersion: 1`, `summary`, and `findings[]` array
**And** each finding has `type`, `severity`, `file`, `line`, `key`, `message`, `locale` (where applicable)
**And** the schema is stable and documented

### Story 4.6: `coverage[]` Array in JSON Report

As a platform engineer,
I want a `coverage[]` array in the JSON report showing per-file statistics,
So that I can build coverage dashboards.

**Acceptance Criteria:**

**Given** `check` processes multiple `.liquid` and locale files
**When** `--json-report` is used
**Then** the JSON contains a `coverage[]` array
**And** each entry has `file`, `total_keys`, `translated`, `missing`, `orphans`, `percentage`
**And** totals are aggregated across all files in the `summary` object

### Story 4.7: Per-File Liquid Coverage TTY Table

As a developer running `check` interactively,
I want a per-file coverage table in the terminal showing Liquid file names, key counts, and missing/orphan counts,
So that I can quickly see which files need attention.

**Acceptance Criteria:**

**Given** multiple `.liquid` files with varying translation coverage
**When** `hyperlocalise check` is run in a TTY
**Then** a table is rendered with columns: File, Total Keys, Translated, Missing, Orphans, Coverage %
**And** the table uses the existing BubbleTea / Lipgloss TUI design system
**And** files with 100% coverage are visually distinct from files with gaps

### Story 4.8: `--no-fail` Suppresses Non-Zero Exit

As a CI engineer,
I want a `--no-fail` flag that causes `check` to exit 0 even when findings exist,
So that I can run the tool in informational mode without failing builds.

**Acceptance Criteria:**

**Given** `check` detects missing keys
**When** `hyperlocalise check --no-fail` is run
**Then** findings are still printed / written to JSON report
**And** the process exits with code 0
**And** without `--no-fail`, the same findings cause a non-zero exit code

### Story 4.9: Grouped (Not Interleaved) Diagnostic Summaries

As a developer,
I want all diagnostics (missing keys, orphans, W001) to be printed as a grouped summary at the end of the run, not interleaved with per-file progress output,
So that the report is easy to read.

**Acceptance Criteria:**

**Given** `check` processes 50 `.liquid` files with various findings
**When** the command runs
**Then** per-file progress lines appear during scanning
**And** after all files are processed, a grouped summary section lists all findings by category (Missing, Orphan, W001)
**And** no diagnostic messages appear mixed with progress lines

## Epic 5: CI Integration & Upgrade Safety

A platform engineer can gate pull requests on translation quality using the existing GitHub Action, with inline annotations on missing keys and scheduled drift detection, while trusting that Hyperlocalise minor-version upgrades never break existing non-Liquid projects.

### Story 5.1: GitHub Action Compatibility with Existing Inputs

As a platform engineer,
I want the Hyperlocalise GitHub Action to accept the same input schema after Liquid support is added,
So that existing CI workflows don't break.

**Acceptance Criteria:**

**Given** an existing `.github/workflows/localize.yml` using `hyperlocalise/actions/check@v1` with inputs `api-key`, `config-path`, `locales`
**When** the action runs on a project containing `.liquid` files
**Then** the action executes without syntax errors or validation failures
**And** `.liquid` files are parsed when the project `i18n.yml` includes `parsers: [liquid]`
**And** the action's input schema is unchanged (no new required inputs)

### Story 5.2: Non-Zero Exit on Threshold + Findings

As a platform engineer,
I want the GitHub Action to fail the CI check when missing-key/orphan/W001 findings exceed a configurable severity threshold,
So that translation quality gates are enforced.

**Acceptance Criteria:**

**Given** a `.github/workflows/localize.yml` with `fail-on-severity: warning` and a `.liquid` file containing a `W001` dynamic-key warning
**When** the action runs
**Then** the workflow step exits with non-zero status
**And** the failure is annotated in the PR with the specific finding details

### Story 5.3: Inline PR Annotations from JSON Report

As a platform engineer,
I want the GitHub Action to create PR review annotations for each finding reported in the JSON output,
So that developers see issues directly in the PR diff view.

**Acceptance Criteria:**

**Given** `hyperlocalise check --json-report` produces a report with findings containing `file`, `line`, `message`, and `severity`
**When** the GitHub Action processes the report
**Then** for each finding, a PR annotation is created at the specified file and line
**And** annotations are grouped by severity (error annotations block merge; warning annotations are informational)
**And** the annotation format uses GitHub Checks API compatible `title`, `message`, and `path` fields

### Story 5.4: Scheduled Drift Detection

As a platform engineer,
I want a `drift` workflow mode that runs on a schedule and detects when source `.liquid` files have new untranslated keys or orphaned translations that weren't caught in PRs,
So that drift is surfaced asynchronously.

**Acceptance Criteria:**

**Given** a scheduled GitHub Actions workflow using `hyperlocalise/actions/drift@v1`
**When** the workflow runs (e.g., daily at 02:00 UTC)
**Then** `hyperlocalise check` is executed against the default branch
**And** findings are compared against a baseline (previous run's `--json-report` or a committed baseline file)
**And** new findings (not present in baseline) are reported as drift alerts
**And** drift can be "acknowledged" by updating the baseline file in a PR

### Story 5.5: Stable JSON Schema Across Minor Versions

As a CI engineer,
I want the `--json-report` schema to remain backward-compatible within a major version,
So that my parsing scripts don't break on patch or minor upgrades.

**Acceptance Criteria:**

**Given** a parsing script that reads `report.json` and expects top-level keys `schemaVersion`, `summary`, `findings`, `coverage`
**When** Hyperlocalise is upgraded from v1.2.0 to v1.3.0
**Then** the script continues to work without modification
**And** any new fields are additive (new keys in objects, new array elements) — no renames, removals, or type changes
**And** `schemaVersion` remains `1` throughout the v1.x lifecycle

### Story 5.6: Schema Additive-Only Within Major Version

As a maintainer,
I want any changes to the JSON report schema in a minor release to be purely additive,
So that consumers are never broken by upgrade.

**Acceptance Criteria:**

**Given** a PR that introduces a new diagnostic type or coverage metric
**When** the PR is merged and released as a minor version bump
**Then** the JSON schema diff (compared to previous minor version) contains only additions
**And** no existing keys are renamed, removed, or have their types changed
**And** this is enforced by a CI check that diffs golden JSON reports against the previous release

### Story 5.7: Minor Upgrade No Change for Non-Liquid Projects

As an existing Hyperlocalise user on a React/JSON-only project,
I want upgrading to a minor version that adds Liquid support to produce identical behavior for my project,
So that I can upgrade safely.

**Acceptance Criteria:**

**Given** a project using `parsers: [json]` with existing `hyperlocalise check` golden files
**When** Hyperlocalise is upgraded to a version containing the Liquid parser
**Then** `hyperlocalise check` produces identical output (same findings, same exit code, same JSON report structure)
**And** no `.liquid` files are scanned (since not in `parsers` list)
**And** no new diagnostics are emitted for non-Liquid projects

### Story 5.8: Pin-and-Verify Upgrade Diff Workflow

As a studio operator,
I want a documented upgrade workflow that shows me exactly what changed in `hyperlocalise check` output before I deploy a new version to my CI fleet,
So that I can approve or reject the upgrade based on concrete diffs.

**Acceptance Criteria:**

**Given** a release candidate version of Hyperlocalise
**When** the operator runs the documented `upgrade-diff` command (e.g., `hyperlocalise check --baseline=previous-report.json --json-report=new-report.json`)
**Then** a side-by-side diff of findings is produced, highlighting added/removed/changed findings
**And** the diff focuses only on findings (not progress bars, timestamps, or run metadata)
**And** the workflow is documented in `docs/upgrade-guide.md` with examples for GitHub Actions integration

## Epic 6: Documentation, Diagnostic Registry & Compliance

Developers can self-serve setup from a Shopify quickstart page, reference a versioned diagnostic-code registry, and verify that the CLI never reads secrets from committed files while maintaining proper third-party license attribution in every release.

### Story 6.1: Shopify Quickstart Documentation

As a Shopify theme developer,
I want a quickstart guide at `hyperlocalise.dev/workflows/shopify-themes` that walks me through installing Hyperlocalise, running `init`, and translating my first theme,
So that I can get started without reading the full reference docs.

**Acceptance Criteria:**

**Given** a new Shopify theme developer
**When** they visit `hyperlocalise.dev/workflows/shopify-themes`
**Then** the page contains: installation command, `hyperlocalise init` walkthrough with expected output, example `i18n.yml` for a standard Shopify theme, `hyperlocalise run` example, and `hyperlocalise check` example
**And** the page includes a screenshot or ASCII diagram of the TTY coverage table
**And** repo `docs/` holds source-of-truth markdown (diagnostics registry, upgrade guide, CI examples) that is rendered into `hyperlocalise.dev` during the web build pipeline

### Story 6.2: Versioned Diagnostic-Code Registry

As a developer,
I want a stable, versioned registry of all diagnostic codes in `docs/diagnostics.md` with meaning, severity, and resolution guidance,
So that I can self-diagnose findings without searching source code.

**Acceptance Criteria:**

**Given** `docs/diagnostics.md` exists in the repo
**When** it is read by a developer or CI
**Then** it contains a table with columns: Code, Severity, Meaning, Resolution Hint, Introduced In (version)
**And** `W001-liquid-dynamic-key` is documented with: severity `warning`, meaning "Dynamic translation key — variable passed to `t` filter", resolution hint populated via `DefaultDiagnosticHint("W001-liquid-dynamic-key")` to ensure single source of truth with the parser code
**And** the document header contains `registry_version: 1`

### Story 6.3: GitHub Action YAML Examples in Docs

As a platform engineer,
I want copy-pasteable GitHub Actions workflow examples in the documentation that demonstrate `check` on PRs and scheduled `drift` detection,
So that I can set up CI gates without reverse-engineering the action inputs.

**Acceptance Criteria:**

**Given** the documentation site or `docs/ci-integration.md`
**When** a platform engineer visits the CI integration page
**Then** they find at least two examples: (1) PR check workflow with `fail-on-severity: warning` and `--json-report` artifact upload; (2) scheduled nightly drift detection workflow with baseline comparison
**And** each example is valid YAML that passes `actionlint` or similar validation
**And** examples reference `hyperlocalise/actions/check@v1` and `hyperlocalise/actions/drift@v1`

### Story 6.4: Credentials from Environment / `.env.local` Only

As a security-conscious developer,
I want Hyperlocalise to read API credentials exclusively from environment variables or a local `.env.local` file that is gitignored by default,
So that I never accidentally commit secrets.

**Acceptance Criteria:**

**Given** a project with `.env.local` containing `OPENAI_API_KEY=sk-...`
**When** `hyperlocalise run` or `hyperlocalise check` executes
**Then** the CLI reads the key from the environment or `.env.local`
**And** `.env.local` is listed in `.gitignore` (or documentation instructs the user to add it)
**And** the CLI fails with a clear error if no credential source is found
**And** the CLI never reads credentials from `i18n.yml` or any other committed file

### Story 6.5: Offline `check` / `drift` Without API Key

As a developer,
I want `hyperlocalise check` and `hyperlocalise drift` to function fully when no API key is configured,
So that validation and drift detection are zero-cost operations.

**Acceptance Criteria:**

**Given** no `OPENAI_API_KEY` is set and no `.env.local` exists
**When** `hyperlocalise check` is run against a project with `.liquid` files
**Then** the command completes successfully, reports missing keys / orphans / W001 findings
**And** makes zero LLM API calls
**And** `hyperlocalise drift` (baseline comparison) also completes without credentials
**And** documentation explicitly states that `check` and `drift` are offline operations

### Story 6.6: Third-Party License Attribution in Release Artifacts

As a distributor,
I want all third-party dependencies to be listed with their licenses in every release artifact,
So that I can comply with open-source license obligations.

**Acceptance Criteria:**

**Given** a Hyperlocalise release build
**When** the release artifact is produced
**Then** it includes a `THIRD_PARTY_LICENSES` file or directory
**And** `github.com/osteele/liquid` is listed with its MIT license text or SPDX identifier
**And** the file is automatically generated from `go.mod` dependencies during the release build
**And** the release CI fails if any dependency lacks a recognized license

---

## Sprint Planning Notes

Derived from Party Mode Round 4 (PM + BA review against PRD scope boundaries and risk mitigations).

### MVP Sprint (Sprint 1) — Core Translation Pipeline

These 8 stories deliver the smallest slice that validates the core assumption: _a Shopify developer can install Hyperlocalise, run `init`, and translate their theme._

| Story | Epic                  | Rationale                                                                         |
| ----- | --------------------- | --------------------------------------------------------------------------------- |
| 1.1   | Liquid Parser         | Unblocks all parser-dependent stories                                             |
| 1.2   | Liquid Parser         | Core value prop: static key extraction                                            |
| 1.3   | Liquid Parser         | Prevents false positives (commented-out code)                                     |
| 1.4   | Liquid Parser         | Bumped to MVP per PRD Risk R-2 (false negatives); real themes use chained filters |
| 1.7   | Liquid Parser         | Bumped to MVP per PRD Risk R-3 (parser panics crash CLI)                          |
| 2.1   | Shopify Config        | Reduces onboarding friction                                                       |
| 2.2   | Shopify Config        | Makes `init` produce a working config                                             |
| 3.1   | Translation Execution | The outcome: translated locale files                                              |

**MVP-Adjacent (Sprint 1 overflow or Sprint 2 start):**

- **4.1** (`check` offline) + **4.2** (missing-key reporting): Low implementation cost, high support-burden prevention. Developer can see gaps without LLM costs.
- **6.1** (Shopify quickstart): Should start in parallel with Epic 2 (Story 2.2 outputs the quickstart URL). Validated against actual `init` output, not written post-facto.

### Post-MVP — Medium Priority (Sprint 2)

| Story   | Epic                  | Rationale                                                               |
| ------- | --------------------- | ----------------------------------------------------------------------- |
| 1.5     | Liquid Parser         | Advanced pattern (`html_safe`, `capture`) — rare in basic themes        |
| 1.6     | Liquid Parser         | Diagnostics valuable but not blocking translation                       |
| 1.8     | Liquid Parser         | Quality gate; can be backfilled after first manual validation           |
| 1.9     | Liquid Parser         | Performance enforcement; needed before scale but not for MVP validation |
| 2.3     | Shopify Config        | Custom theme structures are edge cases                                  |
| 2.4     | Shopify Config        | Monorepo support is advanced usage                                      |
| 2.5     | Shopify Config        | Regression safety for existing users                                    |
| 2.6     | Shopify Config        | `locales:` mechanism already works; story validates Liquid uses it      |
| 3.2     | Translation Execution | Convenience; developer can run `run` three times as workaround          |
| 3.3     | Translation Execution | Cost-saving preview; not value-enabling                                 |
| 3.4     | Translation Execution | Resilience; API failures rare in small themes                           |
| 4.3     | Validation            | Orphan detection is cleanup, not blocking                               |
| 4.4     | Validation            | W001 in `check` requires 1.6 first                                      |
| 4.5–4.9 | Validation            | JSON reports, TTY tables, `--no-fail` — quality of life for power users |
| 4.10    | Validation            | Architectural boundary enforcement; can coexist with 4.4 implementation |

### Post-MVP — Low Priority / Future Sprints

| Story   | Epic              | Rationale                                                        |
| ------- | ----------------- | ---------------------------------------------------------------- |
| 5.1–5.8 | CI & Upgrade      | Only relevant after team adoption and scale                      |
| 6.2–6.6 | Docs & Compliance | Registry, CI examples, license attribution — operational hygiene |

### Cross-Cutting Dependencies

- **1.1 → everything**: Parser skeleton must exist before any extraction, translation, or validation story can execute.
- **2.2 → 3.1**: `i18n.yml` must be valid before `run` can execute.
- **1.6 → 4.4, 4.10**: W001 diagnostics require dynamic-key detection before they can be consumed in `check`.
- **6.1 → parallel with 2.2**: Quickstart should be drafted as `init` behavior stabilizes, not after all epics complete.
