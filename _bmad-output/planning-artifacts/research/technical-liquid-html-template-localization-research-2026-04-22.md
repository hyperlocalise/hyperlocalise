---
stepsCompleted: [1, 2, 3, 4, 5, 6]
inputDocuments: []
workflowType: 'research'
lastStep: 1
research_type: 'technical'
research_topic: 'Liquid HTML Template support for localization CLI (Hyperlocalise)'
research_goals: 'Understand how to implement Liquid template parsing, string extraction, and injection for localization in the Hyperlocalise CLI tool'
user_name: 'henry'
date: '2026-04-22'
web_research_enabled: true
source_verification: true
---

# Research Report: Technical

**Date:** 2026-04-22
**Author:** henry
**Research Type:** technical

---

## Research Overview

This document covers the full technical research for adding Liquid HTML template support to the Hyperlocalise localization CLI. Research spanned five phases: technology stack analysis (Go parser libraries, Liquid syntax, Shopify locale JSON format), integration patterns (how Liquid fits the existing parser strategy and runsvc pipeline), architectural patterns (AST vs regex, edge case handling, parser struct design), and implementation research (dependency management, testing strategy, concrete code skeleton).

**Key finding:** Liquid support requires one new file (`liquid_parser.go`) using `github.com/osteele/liquid` for AST-based key extraction, registered for `.liquid` in the existing strategy pattern. No pipeline changes are needed. The full executive summary and strategic recommendations appear in the Research Synthesis section below.

---

## Technical Research Scope Confirmation

**Research Topic:** Liquid HTML Template support for localization CLI (Hyperlocalise)
**Research Goals:** Understand how to implement Liquid template parsing, string extraction, and injection for localization in the Hyperlocalise CLI tool

**Technical Research Scope:**

- Architecture Analysis - design patterns, frameworks, system architecture
- Implementation Approaches - development methodologies, coding patterns
- Technology Stack - languages, frameworks, tools, platforms
- Integration Patterns - APIs, protocols, interoperability
- Performance Considerations - scalability, optimization, patterns

**Research Methodology:**

- Current web data with rigorous source verification
- Multi-source validation for critical technical claims
- Confidence level framework for uncertain information
- Comprehensive technical coverage with architecture-specific insights

**Scope Confirmed:** 2026-04-22

---

## Technology Stack Analysis

### Programming Languages

The Liquid template language was created by Shopify in Ruby and remains the canonical implementation. However, for Hyperlocalise (a Go CLI), a Go-native parser is the correct integration path.

_Go Libraries (primary target):_
- **`osteele/liquid`** — most mature pure-Go implementation, includes a `parser` package exposing an AST with `ASTBlock`, `ASTObject`, and `ASTRaw` node types. Originally built for Gojekyll. Best candidate for Hyperlocalise integration.
- **`Notifuse/liquidgo`** — aims for full feature parity with the Ruby Shopify engine; less adoption than osteele.
- **`karlseguin/liquid`** / **`acstech/liquid`** — older/dormant; not recommended.

_Reference implementations (for understanding behavior):_
- **Ruby `shopify/liquid`** — canonical source of truth for language behavior
- **`liquidjs`** (JavaScript) — widely used, good spec coverage, helpful for understanding edge cases

_Source: [github.com/osteele/liquid](https://github.com/osteele/liquid), [pkg.go.dev/github.com/osteele/liquid/parser](https://pkg.go.dev/github.com/osteele/liquid/parser), [github.com/Shopify/liquid](https://github.com/Shopify/liquid)_

### Liquid Syntax & Template Structure

Three markup types define the full Liquid syntax:

| Type | Syntax | Purpose |
|---|---|---|
| Objects | `{{ variable }}` | Output dynamic values |
| Tags | `{% tag %}` | Logic/control flow (no output) |
| Filters | `{{ val \| filter }}` | Transform output via pipe |
| Whitespace control | `{%- -%}` | Trim surrounding whitespace |

For localization specifically, the key surface is the `t` filter:
- `{{ 'locale.key' | t }}` — basic translation
- `{{ 'key' | t: count: items.size }}` — pluralization via `count` attribute
- `{{ 'key' | t: name: customer.name }}` — string interpolation
- `{{ 'key_html' | t }}` — suffix `_html` disables HTML escaping

_Source: [shopify.github.io/liquid/basics/introduction](https://shopify.github.io/liquid/basics/introduction/), [shopify.dev/docs/api/liquid/filters/translate](https://shopify.dev/docs/api/liquid/filters/translate)_

### Locale File Format (JSON Schema)

Shopify themes use two locale file types:

**Storefront locale files** (`locales/en.default.json`, `locales/fr.json`, etc.):
```json
{
  "products": {
    "product": {
      "add_to_cart": "Add to cart",
      "sold_out": "Sold out"
    }
  }
}
```
- Hierarchical dot-notation keys (max 3 levels: category → group → description)
- IETF language tags for filenames (`en`, `fr`, `es-MX`)
- Default locale designated as `*.default.json`
- Max 3400 translations per file; max 1000 chars per value

**Schema locale files** (`locales/en.default.schema.json`):
- Same JSON structure, but for theme editor settings/schema labels

_Source: [shopify.dev/docs/storefronts/themes/architecture/locales](https://shopify.dev/docs/storefronts/themes/architecture/locales)_

### AST Node Types (osteele/liquid parser)

The `osteele/liquid` parser package exposes these AST node types relevant to string extraction:

| Node Type | Represents | Localization relevance |
|---|---|---|
| `ASTObject` | `{{ expr }}` | High — contains `t` filter calls |
| `ASTBlock` | `{% tag %}…{% endtag %}` | Medium — `{% translate %}` blocks |
| `ASTRaw` | Raw text content | Low — plain text between tags |

Walking the AST to find `ASTObject` nodes where the filter chain includes `translate`/`t` is the core extraction mechanism.

_Source: [pkg.go.dev/github.com/osteele/liquid/parser](https://pkg.go.dev/github.com/osteele/liquid/parser)_

### String Extraction Tools & Prior Art

_Python Liquid Babel_ — most complete reference for extraction logic:
- `liquid_babel.messages.extract_from_templates()` yields `(lineno, funcname, message, comments)` tuples
- Handles pluralizable messages, translator comments (via preceding Liquid comment tags)
- Directly analogous to what Hyperlocalise needs in Go

_Liqp (Java/ANTLR)_ — grammar-level parser, useful for edge case understanding

_No Go-native extraction tool exists_ — this is a gap that Hyperlocalise would fill.

_Source: [jg-rp.github.io/liquid/babel/introduction](https://jg-rp.github.io/liquid/babel/introduction), [github.com/bkiers/Liqp](https://github.com/bkiers/Liqp)_

### Technology Adoption Trends

- Liquid template usage is growing beyond Shopify — used in Jekyll, some headless CMS platforms, and email templating tools
- The `t` filter pattern for localization is the de-facto standard in the Shopify ecosystem
- No standardized Go tooling exists for Liquid i18n extraction — this is a genuine gap in the ecosystem
- Python Liquid Babel demonstrates the pattern works well and is used in production

## Integration Patterns Analysis

### How Liquid Fits Into the Existing Hyperlocalise Pipeline

The Hyperlocalise CLI uses a **strategy pattern** for parsers, registered by file extension in `internal/i18n/translationfileparser/`. Adding Liquid support means implementing one new parser and registering it — no other pipeline changes required.

**Current parser interface** (`strategy.go`):
```go
type Parser interface {
    Parse(content []byte) (map[string]string, error)
}

type ContextParser interface {
    ParseWithContext(content []byte) (map[string]string, map[string]string, error)
}
```

The Liquid parser implements `Parser` (required) and optionally `ContextParser` to surface filter arguments as translation context. It registers for `.liquid` extension in `NewDefaultStrategy()`.

_Source: local codebase — `internal/i18n/translationfileparser/strategy.go`_

### Parser Integration: Key Extraction from Liquid Files

**What to extract:** Every occurrence of the `t`/`translate` filter in `{{ }}` objects:

| Liquid syntax | Extracted key | Notes |
|---|---|---|
| `{{ 'products.add' \| t }}` | `products.add` | Basic case |
| `{{ 'cart.items' \| t: count: items.size }}` | `cart.items` | Pluralization — extract key + note count arg |
| `{{ 'greeting' \| t: name: customer.name }}` | `greeting` | Interpolation — note named args |
| `{{ 'description_html' \| t }}` | `description_html` | HTML-safe variant — strip `_html` suffix or preserve |

**AST walk approach using `osteele/liquid`:**
1. Call `engine.ParseTemplate(content)` → returns compiled template
2. Access root via `GetRoot()` → walk all `ASTObject` nodes
3. For each `ASTObject`, check if filter chain contains `t` or `translate`
4. Extract the string literal (the locale key) from the object expression
5. Return `map[string]string{key: ""}` — values come from the locale JSON, not the template

_Source: [pkg.go.dev/github.com/osteele/liquid/parser](https://pkg.go.dev/github.com/osteele/liquid/parser)_

### Locale File Integration: Two-File Model

Shopify Liquid localization uses **two separate file types** that Hyperlocalise must handle:

| File type | Path pattern | Purpose |
|---|---|---|
| Storefront locale | `locales/en.default.json` | UI strings — what `{{ 'key' \| t }}` resolves to |
| Schema locale | `locales/en.default.schema.json` | Theme editor labels — not in Liquid templates |

**Integration strategy:**
- The `.liquid` parser extracts **keys** from template files
- The existing `json_parser.go` already handles the locale JSON files (key → value)
- `runsvc` correlates keys extracted from `.liquid` files against values in the locale JSON via the standard `ParseWithContext` flow — no new glue needed

_Source: [shopify.dev/docs/storefronts/themes/architecture/locales](https://shopify.dev/docs/storefronts/themes/architecture/locales)_

### Lockfile & Drift Detection Integration

The existing lockfile structure (`RunCheckpoint`) tracks per-entry state with:
- `EntryKey` — the locale key (e.g., `products.product.add_to_cart`)
- `SourcePath` / `TargetPath` — the `.liquid` file and locale JSON file
- `SourceHash` / `TaskHash` — for drift detection

Liquid entries slot directly into this model. Drift detection works naturally: if a `{{ 'key' | t }}` call is added/removed from a `.liquid` file, the source hash changes and triggers a re-run — same as any other format.

### TMS Storage Adapter Integration

Existing TMS adapters (Crowdin, Lokalise, Phrase, etc.) all exchange `Entry` structs normalized from the locale JSON. Since the Liquid parser extracts keys that map 1:1 to locale JSON keys, TMS push/pull flows are **unchanged** — the adapter never sees `.liquid` files directly.

**Data flow:**
```
.liquid files  →  LiquidParser  →  keys
locale JSON    →  JSONParser    →  key/value pairs
                                    ↓
                              runsvc correlates
                                    ↓
                         TMS adapter (push/pull)
```

### Shopify CLI Interoperability

The Shopify CLI manages theme files with `theme pull` / `theme push`. Hyperlocalise's role is **complementary** — it handles AI translation of the locale JSON files that Shopify CLI syncs. No direct Shopify CLI integration is needed; the workflow is:

1. `shopify theme pull` — sync theme files locally
2. `hyperlocalise run` — translate missing locale keys using LLM
3. `shopify theme push` — deploy updated locale files to store

### API Design Patterns

No new APIs are needed for Liquid support. The feature is **purely a new parser implementation** within the existing extension point. Configuration in `i18n.yml` would specify `.liquid` files as source inputs alongside locale JSON files.

_Source: local codebase — `apps/cli/internal/i18n/runsvc/service.go`, `internal/i18n/storage/types.go`_

## Architectural Patterns and Design

### System Architecture: Parser Design

**Pattern: Zero-value struct parser**, identical to `HTMLParser{}` and `JSONParser{}`:

```go
type LiquidParser struct{}

func (p LiquidParser) Parse(content []byte) (map[string]string, error)
func (p LiquidParser) ParseWithContext(content []byte) (map[string]string, map[string]string, error)
```

Registered in `NewDefaultStrategy()` for `.liquid` extension. No constructor needed — stateless parser.

**Two-phase extraction model:**

```
Phase 1 — Parse .liquid file:
  Input:  {{ 'products.add_to_cart' | t }}
  Output: map["products.add_to_cart"] = ""   ← value is empty, key is what matters

Phase 2 — Parse locale JSON (existing JSONParser):
  Input:  locales/en.default.json
  Output: map["products.add_to_cart"] = "Add to cart"

runsvc correlates Phase 1 keys against Phase 2 values → drives LLM translation
```

### Design Decision: AST vs Regex

**Verdict: AST-primary with regex fallback.**

| Approach | Pros | Cons |
|---|---|---|
| AST (osteele/liquid) | Handles `{% raw %}`, `{% comment %}`, nested blocks correctly; no false positives | Requires exported AST node fields; library coupling |
| Regex | Simple, zero dependencies | False positives inside `{% comment %}` and `{% raw %}` blocks; fragile with whitespace variants |

**AST walk approach** using `osteele/liquid/parser`:

```go
// ASTObject.Expr contains the expression; walk to find t/translate filter calls
// Node hierarchy: ASTSeq → []ASTNode → ASTObject{Token, Expr} | ASTBlock{Token, Body, Clauses}
```

Walk strategy:
1. `engine.ParseTemplate(content)` → compiled template
2. Recursive walk of all nodes
3. For `ASTObject` nodes: inspect `Expr` for filter chain containing `"t"` or `"translate"`
4. Extract the string literal (the locale key) — strip surrounding single/double quotes
5. Skip nodes inside `ASTBlock{Token: "raw"}` and `ASTBlock{Token: "comment"}`

**Regex fallback** (for resilience if AST walk is blocked by unexported fields):
```
{{\s*-?\s*['"]([^'"]+)['"]\s*\|\s*t\b
```
This covers `{{ 'key' | t }}`, `{{- 'key' | t }}`, `{{ "key" | t }}`.

_Source: [pkg.go.dev/github.com/osteele/liquid/parser](https://pkg.go.dev/github.com/osteele/liquid/parser), [zupzup.org/go-ast-traversal](https://www.zupzup.org/go-ast-traversal/index.html)_

### Design Principles and Edge Cases

**Edge cases to handle explicitly:**

| Case | Example | Handling |
|---|---|---|
| Whitespace control | `{{- 'key' \| t -}}` | Strip `-` — regex `\s*-?\s*` handles it |
| Pluralization | `{{ 'key' \| t: count: n }}` | Extract key; note `count` arg in context |
| Interpolation | `{{ 'key' \| t: name: val }}` | Extract key; note named args in context |
| HTML-safe suffix | `{{ 'key_html' \| t }}` | Extract `key_html` as-is — do not strip suffix |
| Comment block | `{% comment %}{{ 'key' \| t }}{% endcomment %}` | **Skip** — not a real extraction target |
| Raw block | `{% raw %}{{ 'key' \| t }}{% endraw %}` | **Skip** — treated as literal text |
| Dynamic keys | `{{ section.settings.key \| t }}` | **Skip** — not a string literal, cannot statically extract |
| Chained filters | `{{ 'key' \| t \| upcase }}` | Extract key — `t` presence is sufficient |

**Dynamic key detection:** If the expression before `| t` is not a string literal (e.g., a variable), skip with a warning rather than failing. Emit a diagnostic for the user.

### ContextParser Implementation

Implement `ParseWithContext` to return filter arguments as context, enabling richer LLM prompts:

```go
// context map value examples:
// "products.add_to_cart" → ""                          (no args)
// "cart.items_count"     → "pluralized by: count"      (count arg present)
// "greeting"             → "interpolated: name"         (named arg)
```

This matches the pattern established by `JSONParser` (FormatJS `description` field → context).

### Key Generation

Unlike `HTMLParser` (which SHA256-hashes extracted prose), **Liquid keys are already the canonical identifiers** — `'products.add_to_cart'` in the template is the key. No hashing needed.

Collision handling is unnecessary since Liquid locale keys are by definition unique within a locale file.

### Scalability and Performance Patterns

**Large Shopify themes** may have hundreds of `.liquid` files. The parser is stateless and allocation-light — suitable for concurrent processing via `runsvc`'s existing goroutine pool.

**Incremental extraction:** The lockfile's `SourceHash` tracks per-file content hashes. Unchanged `.liquid` files are skipped on re-runs — no re-parsing needed.

**Worst case:** A theme with ~500 `.liquid` files, each with ~20 `t` filter calls = ~10,000 key extractions. This is well within single-digit millisecond range for a Go AST walker.

### Deployment and Operations

No new binaries, services, or infrastructure. The Liquid parser ships as part of the existing `hyperlocalise` binary. Users opt in via `i18n.yml` config:

```yaml
sources:
  - path: "templates/**/*.liquid"
    locale_files: "locales/{locale}.json"
```

_Source: local codebase patterns, [github.com/glebm/i18n-tasks](https://github.com/glebm/i18n-tasks)_

## Implementation Approaches and Technology Adoption

### Dependency: osteele/liquid

`github.com/osteele/liquid` is **not yet in go.mod** — it must be added:

```bash
go get github.com/osteele/liquid
```

All AST fields needed for extraction are exported:
- `ASTObject.Expr` → `expressions.Expression` ✅ exported
- `ASTBlock.Body` → `[]ASTNode` ✅ exported
- `ASTBlock.Clauses` → `[]*ASTBlock` ✅ exported
- `Token.Source` → raw source string ✅ exported

**Fallback strategy if `expressions.Expression` filter names are not directly inspectable:** use `Token.Source` (the raw source string of the `{{ }}` expression) and apply the regex pattern on it. This gives a hybrid approach — AST for structural correctness (skipping `raw`/`comment` blocks), regex on the token source for filter name matching.

_Source: [pkg.go.dev/github.com/osteele/liquid/parser](https://pkg.go.dev/github.com/osteele/liquid/parser)_

### Concrete Implementation Skeleton

```go
// internal/i18n/translationfileparser/liquid_parser.go

package translationfileparser

import (
    "regexp"
    "github.com/osteele/liquid"
    "github.com/osteele/liquid/parser"
)

type LiquidParser struct{}

var liquidTFilterRe = regexp.MustCompile(`^\s*'([^']+)'\s*\|\s*t\b|^\s*"([^"]+)"\s*\|\s*t\b`)

func (p LiquidParser) Parse(content []byte) (map[string]string, error) {
    keys, _, err := p.ParseWithContext(content)
    return keys, err
}

func (p LiquidParser) ParseWithContext(content []byte) (map[string]string, map[string]string, error) {
    engine := liquid.NewEngine()
    tpl, err := engine.ParseTemplate(content)
    if err != nil {
        return nil, nil, fmt.Errorf("liquid: parse template: %w", err)
    }
    keys := map[string]string{}
    context := map[string]string{}
    walkLiquidAST(tpl.GetRoot(), keys, context, false)
    return keys, context, nil
}

func walkLiquidAST(node parser.ASTNode, keys, ctx map[string]string, skip bool) {
    switch n := node.(type) {
    case *parser.ASTSeq:
        for _, child := range n.Children {
            walkLiquidAST(child, keys, ctx, skip)
        }
    case *parser.ASTBlock:
        skipChildren := skip || n.Token.Name == "raw" || n.Token.Name == "comment"
        for _, child := range n.Body {
            walkLiquidAST(child, keys, ctx, skipChildren)
        }
    case *parser.ASTObject:
        if skip { return }
        extractTFilterKey(n.Token.Source, keys, ctx)
    }
}
```

### Testing Strategy

Follows the established pattern in `translationfileparser/` — fixture files + explicit assertions:

```
internal/i18n/translationfileparser/
  liquid_parser.go
  liquid_parser_test.go
  tests/liquid/
    basic.liquid          -- {{ 'key' | t }}
    pluralized.liquid     -- {{ 'items' | t: count: n }}
    interpolated.liquid   -- {{ 'greeting' | t: name: name }}
    html_safe.liquid      -- {{ 'desc_html' | t }}
    in_comment.liquid     -- {% comment %}{{ 'skip_me' | t }}{% endcomment %}
    in_raw.liquid         -- {% raw %}{{ 'skip_me' | t }}{% endraw %}
    dynamic_key.liquid    -- {{ section.settings.key | t }}  (no static key)
    chained.liquid        -- {{ 'key' | t | upcase }}
```

Test function naming: `TestLiquidParserBasic`, `TestLiquidParserSkipsComment`, `TestLiquidParserDynamicKeyIgnored`, etc.

**Critical test cases:**
- `{% comment %}` block → key must NOT appear in output
- `{% raw %}` block → key must NOT appear in output
- Dynamic key (`variable | t`) → no key extracted, no error
- `_html` suffix → extracted as-is, not stripped

### Development Workflow

1. `go get github.com/osteele/liquid` — add dependency
2. Implement `liquid_parser.go` in `internal/i18n/translationfileparser/`
3. Register in `strategy.go` `NewDefaultStrategy()` for `.liquid` extension
4. Add fixture files in `tests/liquid/`
5. `make test-workspace` to validate
6. `make lint` — check golangci-lint compliance (no unused imports, proper error wrapping)
7. `make precommit` before committing

### Risk Assessment

| Risk | Likelihood | Mitigation |
|---|---|---|
| `expressions.Expression` filter names not inspectable via public API | Medium | Use hybrid: AST structural walk + `Token.Source` regex on `ASTObject` nodes |
| osteele/liquid AST changes between versions | Low | Pin version in go.mod; parser package is stable |
| Missing edge case in `{% unless %}` / `{% case %}` blocks | Low | Recursive walk handles all `ASTBlock` types uniformly |
| Dynamic keys silently missed | Medium | Emit `slog.Warn` diagnostic per dynamic key occurrence |

### Success Metrics

- All `.liquid` fixture files parse correctly with zero false positives in `{% comment %}`/`{% raw %}` blocks
- `make test-workspace` passes with >90% coverage on `liquid_parser.go`
- No golangci-lint errors
- `hyperlocalise run` correctly translates missing locale keys for a real Shopify theme

_Source: local codebase patterns, [pkg.go.dev/github.com/osteele/liquid](https://pkg.go.dev/github.com/osteele/liquid), [github.com/leonelquinteros/gotext](https://github.com/leonelquinteros/gotext)_

## Research Synthesis

### Executive Summary

Liquid HTML template support in Hyperlocalise targets Shopify theme developers who need AI-assisted localization of their `.liquid` template files. The research confirms this is a **narrow, well-scoped addition** — one new parser, zero pipeline changes — that fills a genuine gap in the Go ecosystem where no Liquid i18n extraction tooling currently exists.

The central localization mechanism in Liquid is the `t` filter: `{{ 'locale.key' | t }}`. Every translatable string in a Shopify theme is referenced by a dot-notation key that maps 1:1 to a hierarchical JSON locale file (`locales/en.default.json`). Hyperlocalise already handles JSON locale files via `json_parser.go`; the new Liquid parser extracts the keys from templates so `runsvc` can correlate them and drive LLM translation of missing entries.

**Key Technical Findings:**
- `github.com/osteele/liquid` is the definitive Go Liquid parser with a usable exported AST (`ASTObject`, `ASTBlock`, `ASTSeq` with exported fields)
- AST-primary + `Token.Source` regex fallback is the correct extraction strategy — handles `{% comment %}` and `{% raw %}` blocks correctly, which pure regex cannot
- Liquid locale keys are canonical identifiers — no hashing needed, unlike the HTML parser
- Dynamic keys (`{{ variable | t }}`) must be silently skipped with a `slog.Warn` diagnostic, not an error
- `osteele/liquid` is not yet in `go.mod` — requires `go get github.com/osteele/liquid` as first step

**Technical Recommendations:**
1. Add `github.com/osteele/liquid` dependency and implement `LiquidParser{}` in `internal/i18n/translationfileparser/liquid_parser.go`
2. Register for `.liquid` extension in `NewDefaultStrategy()` — one line change
3. Implement `ParseWithContext` to surface pluralization (`count`) and interpolation args as translation context
4. Ship fixture-based tests covering all edge cases before merging: comment blocks, raw blocks, dynamic keys, `_html` suffix, chained filters
5. Document `i18n.yml` config pattern for Shopify theme projects in the CLI docs

### Table of Contents

1. Technical Research Scope Confirmation
2. Technology Stack Analysis
3. Integration Patterns Analysis
4. Architectural Patterns and Design
5. Implementation Approaches and Technology Adoption
6. Research Synthesis ← *you are here*

### Strategic Recommendations

#### Implementation Roadmap

| Step | Action | Effort |
|---|---|---|
| 1 | `go get github.com/osteele/liquid` | 5 min |
| 2 | Implement `liquid_parser.go` — `Parse` + `ParseWithContext` | 1–2 days |
| 3 | Write fixture tests covering all edge cases | 0.5 day |
| 4 | Register `.liquid` in `NewDefaultStrategy()` | 5 min |
| 5 | `make precommit` — fmt, lint, test, build | — |
| 6 | Update `i18n.yml` docs with Shopify theme example | 0.5 day |

**Total estimated effort: 2–3 days.**

#### Technology Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Parser library | `osteele/liquid` | Most mature Go implementation, exported AST |
| Extraction strategy | AST walk + Token.Source regex | Structural correctness + simplicity |
| Key format | Preserve as-is from template | Already canonical; no transformation needed |
| Dynamic key handling | Warn + skip | Non-fatal; common in Shopify themes |
| Context extraction | Filter args (`count`, named args) | Enriches LLM prompts for pluralization |

#### Competitive Advantage

No Go-native Liquid localization extraction tool exists. Hyperlocalise would be the first CLI to offer AI-assisted translation of Shopify Liquid themes end-to-end — a meaningful differentiator for the Shopify partner and agency market.

### Future Outlook

- **Schema locale files** (`*.schema.json`) are a natural follow-on — they use the same JSON format, already handled by `json_parser.go`, but need the schema-specific key structure documented
- **Liquid `{% translate %}` block tag** (if Shopify adopts it) would add `ASTBlock` extraction alongside `ASTObject` — the recursive walk already handles this without structural changes
- **Shopify CLI integration** (theme pull → hyperlocalise run → theme push) could be documented as a reference workflow for Shopify partners

### Source Verification

| Claim | Source | Confidence |
|---|---|---|
| osteele/liquid AST fields are exported | [pkg.go.dev/github.com/osteele/liquid/parser](https://pkg.go.dev/github.com/osteele/liquid/parser) | High |
| `t` filter is the Shopify localization standard | [shopify.dev/docs/api/liquid/filters/translate](https://shopify.dev/docs/api/liquid/filters/translate) | High |
| Locale files are hierarchical JSON, max 3400 keys | [shopify.dev/docs/storefronts/themes/architecture/locales](https://shopify.dev/docs/storefronts/themes/architecture/locales) | High |
| No Go Liquid i18n extraction tool exists | Web search + ecosystem survey | High |
| Python Liquid Babel is best prior art | [jg-rp.github.io/liquid/babel/introduction](https://jg-rp.github.io/liquid/babel/introduction) | High |
| osteele/liquid not in go.mod | Local codebase inspection | Verified |

---

**Research Completion Date:** 2026-04-22
**Document:** `_bmad-output/planning-artifacts/research/technical-liquid-html-template-localization-research-2026-04-22.md`
**Source Verification:** All technical claims cited with current sources
**Confidence Level:** High — based on multiple authoritative sources and direct codebase inspection
