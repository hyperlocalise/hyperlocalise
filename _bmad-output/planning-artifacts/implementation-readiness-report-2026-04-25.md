---
stepsCompleted: [1]
documentsFound:
  prd: "_bmad-output/planning-artifacts/prd.md"
  architecture: "_bmad-output/planning-artifacts/architecture.md"
  epics: null
  ux: null
date: "2026-04-25"
project: "hyperlocalise"
---

# Implementation Readiness Assessment Report

**Date:** 2026-04-25
**Project:** hyperlocalise

## Document Discovery

### PRD Documents

**Whole Documents:**

- `prd.md` (whole)

**Sharded Documents:**

- None

### Architecture Documents

**Whole Documents:**

- `architecture.md` (whole)

**Sharded Documents:**

- None

### Epics & Stories Documents

**Whole Documents:**

- None

**Sharded Documents:**

- None

### UX Design Documents

**Whole Documents:**

- None

**Sharded Documents:**

- None

## Issues Found

- **Epics & Stories:** Missing — will impact implementation planning assessment
- **UX Design:** Missing — will impact user experience coverage assessment

## Documents Selected for Assessment

- PRD: `prd.md`
- Architecture: `architecture.md`

---

## PRD Analysis

### Functional Requirements Extracted

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

**Total FRs: 41**

### Non-Functional Requirements Extracted

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

**Total NFRs: 28**

### Additional Requirements & Constraints

**Constraints:**

- Brownfield project — extending existing hyperlocalise CLI
- No telemetry by design
- Secrets never enter `i18n.yml`
- `check` runs offline (no LLM provider initialization)
- `run` idempotent re-run after rate-limit (existing behavior, verified in `runsvc`)
- Forward-looking items excluded from v1: `--liquid-coverage` flag, `--fail-on missing-keys,new-warnings` policy, `--resume` flag, IDE/editor integration

**Technical Commitments from Journeys:**

- Diagnostic-code registry with stable identifiers, resolution hints, version-added markers
- `check --json-report` schema stability with additive-only changes within major version
- Golden-file regression suite enforces schema stability

### PRD Completeness Assessment

**Status:** COMPLETE — The PRD contains:

- 41 binding Functional Requirements with explicit acceptance criteria
- 28 Non-Functional Requirements across 8 categories
- 4 end-to-end user journeys covering all customer segments
- 7 capability clusters with traceability to success criteria
- Explicit scoping (MVP / Phase 2 / Phase 3) with trigger criteria
- Forward-looking items clearly identified and excluded from v1
- Verification ledger confirming existing CLI surface vs. aspirational flags

**Confidence:** HIGH — The PRD is implementation-ready with bounded surface and clear acceptance criteria.

---

## Epic Coverage Validation

### Epic Document Status

**Epics document:** NOT FOUND

No epics and stories document exists in `_bmad-output/planning-artifacts/`. Searched patterns: `*epic*.md` (whole) and `*epic*/index.md` (sharded). Result: 0 files.

### FR Coverage Analysis

Without an epics document, **zero of the 41 PRD FRs have traceable epic coverage**. This is a critical readiness gap.

| Status                | Count   | FRs Affected |
| --------------------- | ------- | ------------ |
| Covered in epics      | 0 / 41  | N/A          |
| Missing epic coverage | 41 / 41 | FR1–FR41     |

### Missing Requirements

### Critical Missing Coverage

**All 41 FRs require epic/story decomposition before implementation.**

Key FR clusters needing epic assignment:

- **FR1–FR8 (Parsing & Extraction):** `LiquidParser` implementation, `Parse`/`ParseWithContext`, `DiagnosticParser`, W001 emission, panic boundary
- **FR9–FR14 (Configuration):** `init` auto-detection, `i18n.yml` generation, monorepo registration, backward compatibility
- **FR15–FR18 (Translation Execution):** `run` with `.liquid`, multi-locale, idempotent re-run, `--dry-run`
- **FR19–FR27 (Validation & Diagnostics):** `check` offline, missing/orphan keys, `coverage[]` array, TTY table, `--no-fail`, grouped summaries
- **FR28–FR32 (CI Integration):** GitHub Action compatibility, non-zero exit on errors, inline annotations, `drift` schedule, stable JSON schema
- **FR33–FR35 (Backward Compatibility):** Schema additivity, minor-version safety, pin-and-verify
- **FR36–FR41 (Docs & Hygiene):** Quickstart docs, diagnostic registry, Action examples, secret management, license attribution

### Recommendation

Run `bmad-create-epics-and-stories` workflow to decompose FRs into implementable epics and user stories. This is the **next pending task** on the project TODO list.

### Coverage Statistics

- Total PRD FRs: 41
- FRs covered in epics: 0
- Coverage percentage: 0%
- **Blocking:** Yes — implementation cannot proceed without epic decomposition

---

## UX Alignment Assessment

### UX Document Status

**UX Design document:** NOT FOUND

Searched patterns: `*ux*.md` (whole) and `*ux*/index.md` (sharded). Result: 0 files.

### Is UX Implied?

**Assessment:** No — This feature does not require a separate UX design document.

**Rationale:**

- The Liquid Parser is a **CLI-backend feature** with no new graphical user interface
- All user-facing output uses the **existing CLI TTY surface** (progress lines, diagnostic summaries, coverage tables) already designed in the Hyperlocalise CLI
- The PRD explicitly lists **"web UI changes" as out of scope** for v1
- TTY rendering specifications (grouped summaries, per-file coverage tables) are defined as Functional Requirements (FR24–FR27) and are implemented within the existing BubbleTea / Lipgloss design system
- No new components, screens, or interaction patterns are introduced

### Alignment with Architecture

The architecture document (`architecture.md`) correctly reflects this CLI-only scope:

- **ADR-008** (TUI Rendering): References existing BubbleTea components for coverage tables
- **ADR-007** (Diagnostic Catalog): Structured findings flow through existing CLI output pipeline
- **ADR-010** (JSON Report Schema): Machine-readable output for CI integrations, not human UI

### Warnings

- **None.** No UX alignment gaps identified. The CLI output patterns are adequately specified in FRs and supported by architecture decisions.
- **Note:** If a future phase adds IDE/editor integration (LSP, CodeLens) or a web dashboard for Liquid diagnostics, a dedicated UX document will become required. Trigger criteria are specified in PRD Phase 3 deferred items.

---

## Epic Quality Review

### Epic Document Status

**Epics document:** NOT FOUND

No epics and stories document exists to validate.

### Quality Review Result

**Skipped — no epics to review.**

The `bmad-create-epics-and-stories` workflow defines these best practices for when epics are created:

**Epic Structure Standards (to be enforced when epics are written):**

- [ ] Epic delivers user value (not technical milestones like "Setup Database")
- [ ] Epic can function independently (Epic N cannot require Epic N+1)
- [ ] Stories appropriately sized (clear user value, independently completable)
- [ ] No forward dependencies within stories
- [ ] Database tables created only when first needed (not all upfront)
- [ ] Clear acceptance criteria in Given/When/Then format
- [ ] Traceability to FRs maintained

**Red Flags to Watch For (when epics are created):**

- Technical epics without user value: "API Development", "Infrastructure Setup"
- Forward dependencies: "Story 2.1 depends on Story 2.4"
- Epic-sized stories: "Setup all models"
- Vague ACs: "user can login" without error conditions or measurability

### Brownfield Project Indicators

When epics are created, they should reflect the brownfield context:

- Integration points with existing `Parser` / `ContextParser` interfaces
- Backward compatibility / migration stories (existing JSON/ARB/HTML parsers unchanged)
- `strategy.go` registration as integration boundary
- No "initial project setup" story needed (existing Go CLI, Cobra, BubbleTea already in place)

### Recommendation

Run `bmad-create-epics-and-stories` workflow. The PRD provides all necessary FR decomposition clusters:

1. Parsing & Extraction Epic (FR1–FR8)
2. Configuration & Auto-detection Epic (FR9–FR14)
3. Translation Execution Epic (FR15–FR18)
4. Validation & Diagnostics Epic (FR19–FR27)
5. CI Integration Epic (FR28–FR32)
6. Backward Compatibility & Stability Epic (FR33–FR35)
7. Documentation & Diagnostic Registry Epic (FR36–FR41)

---

## Final Readiness Assessment

### Overall Readiness Status

**NOT READY — BLOCKING GAPS IDENTIFIED**

The PRD and Architecture documents are complete, validated, and of high quality. However, **epics and stories are missing**, which blocks implementation start per the `bmad-check-implementation-readiness` workflow criteria.

### Artifact Maturity Summary

| Artifact                         | Status             | Quality | Blocking |
| -------------------------------- | ------------------ | ------- | -------- |
| PRD (`prd.md`)                   | ✅ Complete        | HIGH    | No       |
| Architecture (`architecture.md`) | ✅ Complete        | HIGH    | No       |
| Epics & Stories                  | ❌ Missing         | N/A     | **Yes**  |
| UX Design                        | N/A (not required) | N/A     | No       |

### Critical Issues Requiring Immediate Action

**1. Missing Epics & Stories (BLOCKING)**

- **Impact:** 41 Functional Requirements have no traceable implementation path. AI agents cannot begin implementation without story decomposition.
- **Evidence:** Zero epic files found in `_bmad-output/planning-artifacts/`. Zero of 41 FRs have epic coverage.
- **Remediation:** Run `bmad-create-epics-and-stories` workflow. The PRD already provides natural decomposition clusters (Parsing, Configuration, Translation Execution, Validation & Diagnostics, CI Integration, Backward Compatibility, Documentation).

### Recommended Next Steps

1. **Run `bmad-create-epics-and-stories` workflow** — Decompose the 41 FRs into 6–7 user-value epics with independently completable stories. Use the PRD capability clusters as epic boundaries.

2. **Re-run `bmad-check-implementation-readiness`** — After epics are created, re-validate epic coverage (Step 3) and epic quality (Step 5) to confirm all FRs are traceable and stories meet independence/AC standards.

3. **Create `_bmad-output/LIQUID_BASELINE.md`** — Record start date (`2026-04-25`) to begin tracking the "second parser ≤50% effort" business success criterion. This is a 2-minute task that can be done in parallel with epic creation.

### Non-Blocking Observations

- **PRD completeness:** Excellent. 41 FRs, 28 NFRs, 4 journeys, 7 capability clusters, explicit MVP/Phase 2/Phase 3 scoping with trigger criteria.
- **Architecture completeness:** Excellent. 13 ADRs, validated coherence, full requirements coverage, implementation handoff with priority-ordered file list.
- **UX scope:** Correctly assessed as not applicable. CLI-only feature reuses existing TUI design system.
- **Brownfield discipline:** Architecture correctly identifies integration boundaries (`strategy.go`, `Parser`/`ContextParser` interfaces, `check_diagnostics.go`) and avoids "setup project" stories.

### Final Note

This assessment identified **1 blocking issue** across **4 validation categories** (Document Discovery, PRD Analysis, Epic Coverage, UX Alignment, Epic Quality). The PRD and Architecture are the strongest artifacts and are ready for epic decomposition. Address the missing epics before proceeding to implementation. These findings confirm the project is well-planned but needs the final planning layer (epics/stories) before AI agents can execute.
