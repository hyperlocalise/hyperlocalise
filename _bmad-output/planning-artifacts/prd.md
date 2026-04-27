---
stepsCompleted:
  [
    "step-01-init",
    "step-02-discovery",
    "step-02b-vision",
    "step-02c-executive-summary",
    "step-03-success",
    "step-04-journeys",
    "step-05-domain",
    "step-06-innovation",
    "step-07-project-type",
    "step-08-scoping",
    "step-09-functional",
    "step-10-nonfunctional",
    "step-11-polish",
  ]
inputDocuments:
  - "_bmad-output/planning-artifacts/research/technical-liquid-html-template-localization-research-2026-04-22.md"
  - "_bmad-output/project-context.md"
  - "docs/adr/2026-04-12-dashboard-shell-design.md"
  - "docs/adr/2026-04-17-check-diff-stdin-design.md"
  - "docs/adr/2026-04-18-vercel-workflow-cutover-design.md"
  - "docs/adr/2026-04-18-workos-app-auth-session-threading-design.md"
  - "docs/adr/2026-04-19-hero-subtle-reveal-design.md"
  - "docs/adr/2026-04-20-cultural-atlas-hero-design.md"
workflowType: "prd"
briefCount: 0
researchCount: 1
brainstormingCount: 0
projectDocsCount: 7
classification:
  projectType: "cli_tool + saas_b2b"
  domain: "developer tooling / localization infrastructure"
  complexity: "medium"
  projectContext: "brownfield"
  targetUser: "Shopify theme developers"
  primaryFocus: "Liquid template parser support for Shopify locale files"
  v1Scope: "liquid_parser.go, strategy.go registration, i18n.yml config, test fixtures, Shopify usage docs"
  outOfScope: "schema blocks (V2), web UI changes, pipeline changes, TMS adapter changes"
---

# Product Requirements Document - hyperlocalise

**Author:** henry
**Date:** 2026-04-22

## Executive Summary

Shopify theme developers have no automated path to localize their themes. Translatable strings live in `.liquid` template files, referenced by named text labels that map to locale JSON files (`locales/en.default.json`). Today, finding those labels requires manual grep, custom scripts, or expensive TMS tooling — a process that takes hours, misses strings, and breaks down under deadline pressure. The failure mode is silent: missed strings ship as broken UI in every locale but the default.

Hyperlocalise solves this by adding Liquid template parsing to its existing localization pipeline. Developers point the CLI at a Shopify theme, and it extracts every `{{ 'key' | t }}` call (Liquid's built-in translation syntax) from `.liquid` files, correlates them against locale JSON, and uses an LLM to translate every missing entry. A small-theme localization (≤50 `.liquid` files, ~500 keys, single locale) completes in under two minutes of wall-clock time — parsing is sub-second; LLM wall-clock dominates. Large themes scale proportionally (see _Success Criteria_ and _Non-Functional Requirements › Performance_ for exact targets).

The primary target users are **solo Shopify theme developers and small agencies** building themes for clients or the Shopify Theme Store. These developers encounter this localization problem on every project and have no existing tooling that handles it end-to-end.

### What Makes This Special

No Go-native CLI for Shopify Liquid localization exists. Shopify's own tooling (Theme Check, Shopify CLI) performs zero translation extraction. Hyperlocalise fills the gap with a workflow that fits directly into how Shopify developers already work:

```
shopify theme pull → hyperlocalise run → shopify theme push
```

The core technical insight is that Liquid's `t` filter makes static key extraction exact: because keys are explicit string literals in the code, extraction is deterministic — nothing is guessed. Keys map 1:1 to locale JSON entries. The product's differentiator is not speed alone — it is **confidence**: developers know nothing was missed.

**V1 scope boundary:** `.liquid` template files only. Schema locale blocks in section JSON files, metafield translations, and app embed blocks are explicitly out of scope for this release.

## Project Classification

| Attribute           | Value                                                                                               |
| ------------------- | --------------------------------------------------------------------------------------------------- |
| Project Type        | CLI Tool (primary) + SaaS B2B web platform (existing)                                               |
| Domain              | Developer tooling / localization infrastructure                                                     |
| Complexity          | Medium                                                                                              |
| Project Context     | Brownfield — extending existing hyperlocalise CLI                                                   |
| Primary Deliverable | `liquid_parser.go` + strategy registration + `i18n.yml` config + test fixtures + Shopify usage docs |

## Success Criteria

### User Success

A Shopify theme developer feels the product wins when three things land together: speed, coverage, and workflow fit.

- **Speed** — Translating a Shopify theme into a new locale finishes in under 2 minutes for a small theme (≤50 `.liquid` files, ~500 keys) and under 15 minutes for a large theme (~500 files, ~10,000 keys). Single-locale benchmark. The dominant feeling is relief: what used to take an afternoon takes less than a coffee break.

- **Coverage** — Every translatable string referenced by `{{ 'key' | t }}` in every `.liquid` file shows up in the locale JSON diff. Zero strings are silently skipped. Dynamic keys (`{{ variable | t }}`) are explicitly surfaced as `slog.Warn` diagnostics, never swallowed. The dominant feeling is trust: developers can ship without spot-checking every file themselves.

- **Workflow fit** — First-time setup is under 5 minutes from install. `hyperlocalise init` auto-detects a Shopify theme directory, generates a sensible `i18n.yml`, and `hyperlocalise run` produces a translated locale file — with only an LLM API key required from the user. Power users keep leverage via documented `i18n.yml` overrides (source globs, locale targets, exclusions). Convention over configuration, following the BMad-style defaults model. The dominant feeling is native fit: this just slots into `theme pull → hyperlocalise run → theme push` with nothing new to learn.

### Business Success

Two complementary business outcomes define success at the six-month mark.

- **Audience expansion** — Within 6 months of launch, at least 3 unsolicited public testimonials, blog posts, or case studies from Shopify theme developers using Hyperlocalise for real theme localization work. Qualitative over vanity: authentic user voices telling other users this works is a stronger signal than install counts or GitHub stars, and it's the only metric defensible when a local-first CLI intentionally ships no telemetry.

- **Strategic credibility** — The next template-language parser added after Liquid (whichever of Jekyll, MJML, Handlebars, or Twig ships first) completes in ≤50% of Liquid's effort _and_ requires zero changes to the parser strategy interface. Falsifiable: Liquid's engineering-hours baseline is recorded from `go get github.com/osteele/liquid` to merge; time-to-ship the second parser is measured against it. Interface diff is observable via `git log -p internal/i18n/translationfileparser/strategy.go`.

### Technical Success

Engineering contract that holds the Liquid parser to the same quality bar as the rest of the CLI.

- **No panics on any input** — Malformed `.liquid` files return structured errors via the `Parser` / `ContextParser` interface; the parser never panics. Verified by a fuzz test added to the fixture suite.

- **Backward compatibility** — Adding the Liquid parser changes zero observable behavior of existing parsers (`JSONParser`, `HTMLParser`, ARB). No public surface in `internal/i18n/translationfileparser/` shifts. Existing users see no behavioral diff in `run`, `check`, or `sync`.

- **Concurrency safety** — `LiquidParser` is safe for use across `runsvc`'s goroutine pool: stateless, zero-value struct, allocation-local during extraction. Verified by `go test -race` on parser tests and `runsvc` integration.

- **Performance ceiling** — Worst-case extraction (~500 `.liquid` files, ~10,000 keys) completes in under 500ms wall-clock on an M1-tier machine. Scope: parsing + AST walk only, excluding disk I/O, measured on warm filesystem cache. Captured as a benchmark test in CI that fails on regression.

- **Test and lint baseline** — `make test-workspace` passes with >90% coverage on `liquid_parser.go`. `make lint` is clean against the existing `golangci-lint v2` ruleset (`exhaustruct`, `gochecknoglobals`, `errname`). Fixture suite covers every documented edge case: basic, pluralized, interpolated, html_safe, in-comment, in-raw, dynamic-key, chained-filter.

### Measurable Outcomes

| Outcome                               | Target                                                                                | Horizon                  | How measured                                                              |
| ------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------ | ------------------------------------------------------------------------- |
| Small-theme translation time          | <2 min, single locale                                                                 | Ship                     | Benchmark on fixture theme (≤50 files / ~500 keys)                        |
| Large-theme translation time          | <15 min, single locale                                                                | Ship                     | Benchmark on fixture theme (~500 files / ~10k keys)                       |
| Fixture-corpus extraction accuracy    | 100% extraction, 0% false positives                                                   | Ship                     | Assertions in `liquid_parser_test.go`                                     |
| Dawn parity                           | All `.liquid`-originating keys present in `locales/en.default.json`                   | Release gate             | Pre-tag CI job against Shopify Dawn                                       |
| First-time setup friction             | <5 min, LLM API key only                                                              | Ship                     | Manual walkthrough documented in quickstart                               |
| User-facing verification              | `check --json-report` `coverage[]` array + TTY per-file table (Option A; see Scoping) | Ship (MVP)               | Additive JSON field + TTY rendering when `parser: liquid` sources present |
| Structured CI diagnostics             | Dynamic-key warnings in `check --json-report` output                                  | Ship (MVP)               | JSON findings schema includes code `W001-liquid-dynamic-key`              |
| Concurrency safety                    | No data races under `go test -race`                                                   | Ship                     | `-race` flag on parser tests + runsvc integration                         |
| No-panic safety                       | Zero panics on any input                                                              | Ship                     | Fuzz test in suite                                                        |
| Performance ceiling                   | <500ms worst case, parsing only, warm cache                                           | Ship                     | Benchmark test in CI                                                      |
| Test coverage on `liquid_parser.go`   | >90%                                                                                  | Ship                     | `make test-workspace` coverage report                                     |
| Public testimonials from Shopify devs | 3+ unsolicited                                                                        | 6 months post-launch     | Qualitative tracking                                                      |
| Second template parser effort         | ≤50% of Liquid baseline (engineering-hours logged), interface unchanged               | When second parser ships | Engineering-hours log + `git diff` on strategy.go                         |

## Product Scope

### MVP — Minimum Viable Product

Everything required for a Shopify theme developer to productively translate a real theme end-to-end, and for us to call the "nothing missed" and "workflow fit" promises truthful at v1.

- `LiquidParser{}` implementing `Parse` and `ParseWithContext` via `github.com/osteele/liquid`
- Registered for `.liquid` in `NewDefaultStrategy()` (`internal/i18n/translationfileparser/strategy.go`)
- Fixture suite covering every documented edge case: basic, pluralized, interpolated, html_safe, in-comment, in-raw, dynamic-key, chained-filter
- `i18n.yml` documented pattern for Shopify theme projects with a copy-paste-ready example
- Zero-config auto-detection when invoked in a Shopify theme directory (auto `.liquid` + `locales/*.json` discovery; user supplies LLM API key only)
- Per-file `.liquid` coverage surfaced by `hyperlocalise check` (Option A; see Scoping): additive `coverage[]` array in `check --json-report` output plus a TTY per-file coverage table rendered when `parser: liquid` sources are present in `i18n.yml`
- Dynamic-key diagnostics surfaced in `hyperlocalise check --json-report` findings output under code `W001-liquid-dynamic-key`
- Shopify quickstart docs page on `hyperlocalise.dev` at `/workflows/shopify-themes`, walking the full `shopify theme pull → hyperlocalise run → shopify theme push` loop
- `make precommit` clean: format, lint, test, build

### Growth Features (Post-MVP)

Features that sharpen the v1 promises and build the foundation for audience expansion.

- Dawn parity release-acceptance gate in pre-tag CI (runs against Shopify's reference theme)
- Fuzz test + performance benchmark test in CI
- GitHub Action docs updated with Shopify `drift` and `check` examples (using the existing action at `action.yml`)

### Vision (Future)

Deferred explicitly to post-v1 and tracked separately.

- Schema locale files (`*.schema.json`) — theme editor strings; V2
- `{% translate %}` block-tag support if Shopify adopts it (AST walk already handles `ASTBlock` recursively)
- Metafield translations
- App embed block translations
- Shopify Partner directory listing for `hyperlocalise`
- Second template-language parser (Jekyll, MJML, Handlebars, or Twig) — completes the strategic-credibility architecture claim

## User Journeys

Four narrative journeys cover the primary user-type matrix for the Liquid feature: solo developer (success path), agency engineer (edge case), platform engineer (operations), and existing Hyperlocalise user (expansion). In each journey's capability table, ⭐ marks capabilities the user **actively invokes or reads**; unmarked rows are background infrastructure that benefits the user without being explicitly engaged. When prioritizing implementation order in Step 9, favor actively-touched capabilities.

### Maya Chen — solo Shopify theme developer (primary success path)

**Persona.** Solo freelance Shopify theme developer; listed in Shopify Partners directory. Mid-career, 5 years in the Shopify ecosystem. Just closed a contract with a Montreal-based client who needs their custom theme live in English and French for a Canadian holiday-season launch. Client also wants Spanish "if time allows." Deadline: 9 working days. Scarred from the previous project, where her hand-rolled Python script missed 8 strings in `sections/header.liquid` — shipped broken French UI for three days before the client noticed.

#### Opening Scene — Tuesday morning, 8:47 AM

Maya is on her second espresso when she opens the Linear ticket from her Montreal client: "FR + ES by next Thursday." Nine working days. She opens `sections/header.liquid` and watches ~60 `{{ 'header.nav.home' | t }}` references scroll past. Her stomach tightens. Last project she built a Python script that missed eight strings in exactly this file — the client noticed, she had to ship a 1 AM hotfix, and she still thinks about it when she writes templates.

She types "shopify liquid localization cli" into Google for the third time this month. This time the top result is a page titled _Hyperlocalise for Shopify themes_ at `hyperlocalise.dev/workflows/shopify-themes`.

#### Rising Action — 9:02 AM

The quickstart reads like it was built for her. `brew install hyperlocalise`. In her already-cloned theme directory, `hyperlocalise init`. The CLI scans and without being asked reports: _"Detected Shopify theme. Found 127 `.liquid` files and 3 locale JSON files. Writing `i18n.yml` with Shopify defaults."_ No wizard, no questions. She opens the generated `i18n.yml` out of paranoia — it's twelve lines, all obvious.

She drops `OPENAI_API_KEY` into `.env.local` (the quickstart told her exactly where) and runs `hyperlocalise run --locale fr,es`. The CLI prints a progress line per file, then pauses with a grouped summary:

```
Extracted 1,642 keys from 127 .liquid files
Matched 1,642 keys against locales/en.default.json
Translating fr: 1,642 keys → gpt-4o-mini
Translating es: 1,642 keys → gpt-4o-mini

Diagnostics:
  W001-liquid-dynamic-key (3): sections/featured-product.liquid:42, 58;
                               snippets/price-tag.liquid:11
  Resolution: these use variable expressions (e.g., {{ section.settings.key | t }})
              which can't be statically extracted. Review manually if needed.
```

Maya reads the W001 warnings. She recognizes them — those _are_ dynamic section settings in her theme. She nods, doesn't panic, moves on.

#### Briefly, Tuesday afternoon — attempt 2

Maya's first `hyperlocalise run` actually failed at 9:04 AM. OpenAI rate-limited her new API key at the 200th concurrent call. The CLI printed:

```
Error: OpenAI rate limit hit (429).
Partial translations preserved in locales/fr.json and locales/es.json
(200 keys persisted per locale; atomic write).
Re-run the same command to resume — completed keys will be skipped.
```

She re-ran the same `hyperlocalise run --locale fr,es`. It skipped the 200 keys already in the locale files, finished the remaining 1,442 per locale, and wrote out cleanly in another 73 seconds. She added a line to her client-onboarding doc: _"hyperlocalise handles rate limits gracefully — the locale files themselves are the checkpoint. Just re-run."_

#### Climax — 9:06 AM, four minutes in (counting from the resumed run)

The progress bar finishes. `locales/fr.json` and `locales/es.json` exist. She runs `hyperlocalise check` and reads the per-file Liquid coverage table rendered at the end of the TTY output (shown automatically because `parser: liquid` sources are present in `i18n.yml`):

```
Coverage (parser: liquid)
  sections/header.liquid            24 keys extracted, 0 dynamic
  sections/footer.liquid            18 keys extracted, 0 dynamic
  sections/featured-product.liquid  12 keys extracted, 2 dynamic (W001)
  ... (89 more files)

Total: 1,642 keys across 127 files
Dynamic keys (W001, not statically extractable): 3
Locale JSON coverage:
  en.default.json: 1,642/1,642 keys referenced by .liquid (100%)
  Unmatched keys in locale JSON: 0
```

(The same per-file data is also available machine-readably via `check --json-report <path>` under the top-level `coverage[]` array — see FR24 / FR25.)

Zero unmatched. Every static `{{ ... | t }}` accounted for. The scar tissue from the last project loosens. She runs `git diff locales/fr.json`, spot-checks `header.nav.home` → "Accueil" and `cart.empty_message` → "Votre panier est vide." Idiomatic, punctuated correctly, no weird LLM artifacts. She pushes to the client's dev store via `shopify theme push --store client.myshopify.com`.

#### Resolution — Friday afternoon, 4 days before deadline

Maya emails the client: "French and Spanish are live on the dev store, please review." She closes her laptop at 4:00 PM. The `i18n.yml` sits in the repo — next time the client asks for a copy tweak, she edits `locales/en.default.json` and re-runs `hyperlocalise run`, another 90 seconds. Her next sales conversation starts with "I have a tool for this now, it'll cost you a third of what the last theme did."

#### Capabilities Maya's journey requires

| Capability                                                   | Moment that validates it                                      |
| ------------------------------------------------------------ | ------------------------------------------------------------- |
| ⭐ Zero-config auto-detection in a Shopify theme dir         | "Detected Shopify theme" output from `init`                   |
| ⭐ Sensible generated `i18n.yml`                             | "Twelve lines, all obvious" — paranoia check passes           |
| ⭐ Multi-locale in a single run (`--locale fr,es`)           | Single invocation translates both                             |
| ⭐ Grouped W001 dynamic-key diagnostic                       | End-of-run summary with file:line and resolution guidance     |
| ⭐ Per-file Liquid coverage in `check` TTY + `--json-report` | Restores confidence after past scar                           |
| Locale-JSON unmatched-keys report                            | "Unmatched keys: 0" line — read but unprompted                |
| ⭐ Idempotent re-run after rate-limit failure                | Same command resumes; partial locale files are the checkpoint |
| Clean handoff to `shopify theme push`                        | Output fits Shopify CLI workflow untouched                    |
| ⭐ Docs page at `/workflows/shopify-themes`                  | First-search-result effect at 8:47 AM                         |
| Sub-5-minute first run                                       | Background timing — emerges from above                        |

### Jordan Okafor — Shopify agency engineer (primary edge case)

**Persona.** Senior Shopify Plus engineer at a 25-person Brooklyn-based commerce agency. Leading a theme rebuild for a fashion brand launching into 6 new EU markets ahead of Paris Fashion Week, 3 weeks out. The theme was started by a previous contractor — messy Liquid, ~380 files, lots of `{% comment %}` blocks, 40+ dynamic `t`-filter calls via section settings, and ~30% of keys already exist in `locales/en.default.json` from an abandoned prior attempt.

#### Opening Scene — Wednesday, 10:14 AM

Jordan gets the repo handoff from the previous contractor on Monday. It's Wednesday now. He opens `sections/` and sees `{% comment %} TODO translate this later {% endcomment %}` sprinkled across fourteen files. `theme/config/locales/en.default.json` is 40% complete — someone tried, someone gave up. His project plan says localization kickoff today; the PM Slacked him an hour ago: _"6 locales, launch is Paris Fashion Week."_ He drafts a reply: _"Spending today evaluating tooling before committing to a plan."_

#### Rising Action — 11:30 AM

Jordan's agency already runs Hyperlocalise on three other client projects for JSON and ARB localization — he knows the config shape. He writes a fifteen-line `i18n.yml` in twelve minutes: overrides `sources:` to the agency's `theme/` root, points `locale_files:` at `theme/config/locales/`, sets the six target locales. Runs `hyperlocalise check` first as a dry-run:

```
Parsed 382 .liquid files (0 errors)
Extracted 5,243 unique translation keys
Locale coverage (theme/config/locales/en.default.json):
  Keys referenced by .liquid but missing from JSON: 3,614 (69%)
  Keys in JSON but unreferenced by .liquid: 47 (orphan)

Diagnostics:
  W001-liquid-dynamic-key (43): 18 files
  Resolution: variable expressions cannot be statically extracted
```

He notices the JSON coverage line shows 30% pre-existing translations. He opens `theme/config/locales/fr.json` from the prior contractor's attempt and spot-checks six entries. Three are wrong: `cart.empty_state` translated as "Votre état vide" — literal, wrong register. He makes a call: regenerate, don't reconcile. Files a Linear sub-ticket: _"Previous contractor translations unreliable; regenerating from scratch."_ Tags Priya, the brand's in-house localization reviewer.

Forty-three dynamic keys — not silent skips, a structured list with line numbers. He exports `hyperlocalise check --json-report findings.json`, attaches it to the same Linear thread, and writes a one-paragraph explainer of what W001 means.

#### Meanwhile, Thursday morning — Priya, brand's in-house localization reviewer, Lisbon

Priya opens the Linear ticket Jordan tagged her on at 9 AM. The JSON attachment has 43 findings, each with file, line, and suggested context. She spends two hours walking through them, grouping into three buckets: 39 theme-editor-settings (legit), 4 accidents (fix), 0 genuinely untranslatable. She writes her verdict into the ticket. Then she does something she hasn't done in six months of Shopify localization work: she leaves a compliment. _"Actually usable findings. First time I haven't had to grep the source myself."_ Jordan sees it at 2:40 PM. He screenshots it for the agency's internal #wins channel.

#### Climax — Thursday, 2:40 PM

Jordan fixes the four accidental dynamic-key uses in `.liquid`, re-runs `hyperlocalise check` — W001 count drops to 39. He logs a follow-up ticket with Priya's sign-off for the remaining 39.

Now the real run: `hyperlocalise run --locale fr,de,it,es,nl,sv`. The CLI reports _"Translating 3,614 missing keys × 6 locales = 21,684 LLM calls."_ Eleven minutes fifty-eight seconds later, six fresh locale JSON files sit in `theme/config/locales/`. He opens `fr.json` — 2,340 keys, idiomatic French; the footer legal copy reads as a French lawyer would write it, not as Google Translate does.

He commits on a branch and opens the PR. CI runs the agency's existing pipeline: `make lint` passes, the three other clients' `hyperlocalise check` runs pass unchanged. The new Liquid check runs; `check --json-report` output feeds the agency's custom GitHub App, which drops inline annotations on 39 lines across 18 files. Reviewer (another agency engineer): _"All of these look like section settings?"_ Jordan: _"Priya signed off; 39 are legit, 4 were accidents, already fixed."_ Approved. Merge.

#### Resolution — Paris Fashion Week, 4 days to go

Priya sees her audit trail preserved: every dynamic key surfaced, every decision logged, every untranslated-on-purpose string tagged with W001 in version control. _No Auto-Translate garbage_ — every key was either statically translated by a modern LLM or explicitly flagged for human review. She tells her boss the agency "did it right." The fashion brand signs a follow-on contract with Jordan's agency for their headless storefront project.

On the project's retro doc, Jordan writes: _"Hyperlocalise cut the localization phase from two weeks to two days. The killer feature wasn't speed — it was the W001 diagnostic pipeline. It made triage tractable and gave the brand's reviewer something to sign off on."_

#### Capabilities Jordan's journey requires

| Capability                                                   | Moment that validates it                                             |
| ------------------------------------------------------------ | -------------------------------------------------------------------- |
| ⭐ `i18n.yml` overrides for non-default locale paths         | Custom `sources:` and `locale_files:` for `theme/config/locales/`    |
| ⭐ Dry-run (`check` without LLM calls)                       | "Runs check first to see what he's walking into"                     |
| ⭐ Missing-keys + orphan-keys reporting                      | "3,614 missing" and "47 orphan" lines                                |
| ⭐ `check --json-report <path>` structured output            | Exported to Linear, consumed by agency GitHub App                    |
| ⭐ W001 diagnostics: stable code, file-precise, line-precise | Grounds triage ticket; resurfaces as PR inline comments              |
| ⭐ Multi-locale concurrent run (6 locales in one invocation) | Single `run` translates fr/de/it/es/nl/sv                            |
| Backward compat across other clients in the monorepo         | Three other clients' check runs pass unchanged                       |
| Large-theme performance                                      | ~382 files, ~5,200 keys, under 12 min wall-clock (incl. LLM latency) |
| Parse safety on messy / partially-translated themes          | 382 files parsed with 0 errors despite contractor mess               |
| ⭐ Re-runnable after fixes                                   | Four fixes → re-run → W001 count drops 43→39                         |

### Alex Torres — platform / CI engineer (operations)

**Persona.** Platform / DevOps engineer at a D2C beauty brand with ~40-person engineering org and a 3-person in-house theme team. Owns the CI pipeline. The theme team has been shipping EN-only features that quietly land in non-English storefronts; the previous CI gate (a hand-rolled grep script) generated false positives, the translation contractor — Helena — stopped trusting alerts, and Alex turned the gate off four months ago.

#### Opening Scene — Monday, 11:32 AM, four months ago (flashback)

Alex is on a Zoom with the VP of Customer Experience. Slack is open in another window, pinned to #customer-ops: a screenshot from a Spanish-storefront shopper showing `"products.notify_me_cta"` — the raw translation key, visible in the product page because the EN-only feature shipped Friday evening and no one updated `locales/es.json`. _"Alex, why doesn't our CI catch this?"_ Alex explains that it does — there's a `grep -r "| t"` step in the pipeline — but it false-positives on `{% comment %} the price filter uses a t-filter pattern {% endcomment %}` in `sections/collection-filters.liquid`, which Helena (the translation contractor) has been getting paged about for six weeks. _"She's stopped responding to CI alerts,"_ Alex admits. _"I think she filters them to spam."_ Alex turns the step off that afternoon. Dreads every EN-only deploy since.

#### Rising Action — Tuesday, 9:45 AM (present day)

Alex is rebuilding the localization gate. He pulls up `hyperlocalise.dev/workflows/shopify-themes` because the content editor on the theme team mentioned using it on a personal project. He reads the CI section. The GitHub Action at `action.yml` already exists — the Liquid support is new, but the check / drift surface is the one he'd already have built against for JSON if he'd had the time.

He writes `.github/workflows/localization-gate.yml`:

```yaml
on:
  { pull_request: { paths: ["theme/**/*.liquid", "theme/**/locales/*.json"] } }
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: hyperlocalise/action@v1
        with:
          check: check
          severity-threshold: error
          fail-on-findings: "true"
          github-annotations: "true"
```

No API key needed — `check` is offline. Commits. Opens a throwaway PR that edits `sections/header.liquid` to add a new `{{ 'header.account_menu.wishlist' | t }}` reference without touching the locale JSON. Watches the Action run in the CI tab.

Twenty seconds later: red X on the PR. Inline annotation on the line he just added: _"Missing key in `locales/en.default.json`: `header.account_menu.wishlist`. This key is referenced in `.liquid` but not defined."_ No annotations anywhere on the `{% comment %}` blocks that used to trip the grep script. Alex smiles the first honest smile he's had about this pipeline in four months.

By Tuesday afternoon Helena replies on Slack: _"Ok, I'll give it a week before I filter these again. Don't let me down."_ Alex saves the message to his "things that matter" folder.

#### Climax — Tuesday, 2:15 PM

Alex adds the scheduled drift workflow — runs every Monday at 6 AM, scans `main`, opens Linear tickets on anything stale:

```yaml
on: { schedule: [{ cron: "0 6 * * 1" }] }
jobs:
  drift:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: hyperlocalise/action@v1
        with:
          check: drift
          upload-artifact: "true"
      - uses: agency/linear-action@v2
        if: failure()
        with: { team: localization, title-prefix: "[Drift]" }
```

Merges both workflows to `main`. Messages Helena: _"Turned the CI gate back on. New system from `hyperlocalise.dev`. Tested it against the patterns that used to false-positive on you; those are gone. Please let me know if you get a false alarm this week."_

Wednesday morning: the theme team opens a PR adding three new hero-banner strings. Action runs, fails, annotates the three missing keys. Theme engineer adds them to `en.default.json`, pushes a fixup commit; Helena gets a Linear ticket with the three English strings and a 48-hour SLA. Ships Thursday with ES, FR, DE complete. No #customer-ops escalation.

#### Resolution — one quarter later

Alex presents at the platform team's quarterly review: _"EN-only shipment incidents: 7 last quarter, 0 this quarter."_ Helena's response time on Linear tickets has dropped from 8 days to 2 because she trusts them now — every ticket has real missing keys, no comment-block ghosts. The content editor on the theme team has been using `hyperlocalise run` locally to pre-translate PRs before they even reach Helena, shrinking the loop further. Alex rolls the same workflow into two other Shopify themes his org maintains — the `.github/workflows/` file is copy-paste-identical across repos.

On the platform team's internal runbook, Alex writes: _"The old gate was fast but wrong. The new gate is slightly slower on check-time and massively trustable. Trust is the feature."_

#### Capabilities Alex's journey requires

| Capability                                                                   | Moment that validates it                                              |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| ⭐ GitHub Action `check: check` on `.liquid`                                 | Workflow works without custom scripting                               |
| ⭐ Action `check: drift` on scheduled runs                                   | Monday 6 AM scheduled workflow                                        |
| `check` is offline — no LLM API key needed in CI                             | No `OPENAI_API_KEY` in workflow secrets                               |
| ⭐ Non-zero exit on `severity-threshold: error` + `fail-on-findings: 'true'` | Red X on PR fails the check run correctly                             |
| ⭐ Inline PR annotations via `github-annotations: 'true'`                    | Annotation appears on the exact line of the missing key               |
| No false positives on `{% comment %}` / `{% raw %}` blocks                   | Zero annotations on patterns that used to trip grep                   |
| ⭐ `drift` JSON artifact consumed by downstream action                       | Linear-ticket action fed by the uploaded artifact                     |
| Consistent behavior across repos                                             | Same workflow YAML works across three internal themes                 |
| ⭐ `hyperlocalise run` works locally for content editors                     | Pre-translates before contractor review                               |
| Stable command surface `.liquid` composes onto                               | `check`/`drift`/`run` unchanged — Liquid is just a new file extension |

### Sam Reyes — existing Hyperlocalise user, expansion path

**Persona.** Tech lead at a 40-person commerce studio in Lisbon that builds both Shopify themes and Next.js/Remix frontends. Champions internal tooling; has run Hyperlocalise on Next.js (JSON) and Flutter (ARB) projects for ~18 months. The "localization person" at her shop. At the monthly tooling review, Diogo (Shopify team lead) asks if Hyperlocalise handles Liquid yet. Sam volunteers to pilot 1.3.0.

#### Opening Scene — First Thursday of the month, 4:15 PM

Sam is running the studio's monthly tooling review. Today's agenda item is localization. Diogo complains about Google Sheets + bash for the third month in a row. _"You keep saying Hyperlocalise is good on Next.js,"_ he says, half-teasing. _"Does it handle Liquid yet, or do I need to keep begging?"_ Sam checks her laptop: `hyperlocalise.dev/changelog`. Version 1.3.0 shipped two weeks ago. Liquid support under `.liquid`. Shopify workflow page in the docs.

She thinks: _the 18 months I've spent advocating for this tool are about to get tested across a file format I've never run it on._ She volunteers to pilot it. Picks the least-risky active Shopify project — a brand refresh for a Portuguese wine producer, three target locales.

#### Rising Action — Friday, 10:00 AM

Sam doesn't start with the new project. She starts with the twelve existing ones. She pins the studio's shared `i18n.yml` tooling image to `hyperlocalise:1.3.0`. Then she checks out each repo locally and runs:

```bash
for repo in ~/studio/*; do
  cd $repo
  hyperlocalise check --json-report /tmp/after-$(basename $repo).json
done
```

Then downgrades to the previous pinned version, re-runs into `/tmp/before-*.json`. Diffs every pair.

Eleven of the twelve diffs are empty. The twelfth — a Next.js publisher site — shows a one-line delta: a new `warnings_count: 0` field appearing in `check --json-report` output that wasn't there before. Her pulse spikes. She checks the 1.3.0 release notes: _"Added `warnings_count` summary field; existing fields unchanged."_ Additive only. She validates by running the same check against the studio's GitHub App that consumes the JSON — annotations render identically. Pulse drops. She updates her internal notes: _"Additive JSON schema change; compatible."_

The backward-compat commitment in the release notes wasn't aspirational. She updates the studio's pinned image across all twelve CI workflows in a single branch; the PR passes every CI check on first run.

#### Climax — Friday, 3:30 PM

Now the Shopify project. Sam clones the wine-producer theme, runs `hyperlocalise init` in the theme root. The CLI auto-detects, writes a Shopify-flavored `i18n.yml`, reports 84 `.liquid` files and 1 locale JSON file. She reads the generated `i18n.yml` — identical shape to her Next.js configs. Same key names, same structure, just different `sources:` glob and `parser: liquid` registration. _She didn't have to learn anything new._

Runs `hyperlocalise run --locale pt,es,fr`. 73 seconds. Three fresh locale files. She opens `pt.json` — the Portuguese is better than she expected (her own Portuguese). She spot-checks `footer.legal.privacy_policy`, `cart.shipping_estimate`, `product.add_to_cart`. All idiomatic.

Commits, opens PR, the studio's standard CI gate runs `hyperlocalise check --json-report` — passes. The GitHub App annotations render identically to her Next.js repos. Diogo merges Monday morning.

#### Resolution — Following Thursday, tooling review

Sam opens the monthly review with a five-slide update:

1. **12 existing projects:** zero behavior change, zero CI updates required
2. **Wine-producer Shopify theme:** three locales shipped, 73-second run, existing review process
3. **Other Shopify team's theme (Diogo offered to try next):** mid-pilot, on track
4. **Proposal:** retire the four internal Frankenstein scripts, standardize on Hyperlocalise 1.3.x
5. **RFC:** _One tool for localization across web, mobile, and Shopify — draft attached_

The RFC passes with two rounds of small comments. Within a month both Shopify teams have migrated off spreadsheets; the studio's tooling doc collapses four localization sections into one.

Sam posts on dev.to two weeks later: _"How our studio unified localization across Next.js, Flutter, and Shopify."_ The post gets 400 views from the Shopify Partners Slack and ends up quoted in Hyperlocalise's community channels. That's testimonial #1.

#### Capabilities Sam's journey requires

| Capability                                                                         | Moment that validates it                                                           |
| ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| ⭐ Adding `.liquid` parser doesn't alter behavior of existing JSON/ARB parsers     | 12-project before/after diff: zero meaningful changes                              |
| ⭐ `check --json-report` schema additive-only across minor versions                | Single delta is an additive `warnings_count` field; release notes confirm          |
| ⭐ `hyperlocalise init` generates Shopify config consistent with existing patterns | Same shape, same key names, just different `sources:` + `parser:`                  |
| Multi-project fleet compatibility                                                  | One pinned image works across heterogeneous file formats                           |
| ⭐ Semver discipline                                                               | 1.2.x → 1.3.x minor bump adds Liquid without schema-breaking drift                 |
| ⭐ Pin-and-verify upgrade ergonomics                                               | Standard `image:` pinning in CI; before/after diffability                          |
| `.liquid` and `.json`/`.arb` coexist without config collision                      | Heterogeneous configs across 13 projects, all work                                 |
| ⭐ Docs changelog clarity                                                          | Sam identifies Liquid support from changelog alone; evaluates risk before piloting |
| Community / social-proof vector                                                    | Dev.to post → testimonial #1 for the 6-month business-success target               |

### Journey Requirements Summary

The four journeys consolidate into seven capability clusters.

#### Cluster A — Parsing & extraction

- `LiquidParser{}` implementing `Parse` + `ParseWithContext` via `osteele/liquid` (Maya, Jordan, Alex, Sam)
- Zero errors on messy, partially-translated, or contractor-abandoned themes (Jordan)
- Correct handling of `{% comment %}` / `{% raw %}` / chained filters / html_safe (Alex's cry-wolf fix)
- Static extraction of `{{ 'key' | t }}` with zero false negatives (Maya)
- Dynamic keys (`{{ variable | t }}`) surfaced via W001, never silently skipped (Maya, Jordan)

#### Cluster B — Configuration & auto-detection

- Zero-config auto-detection in Shopify theme directories (Maya)
- `i18n.yml` overrides for non-default locale paths like `theme/config/locales/` (Jordan)
- Root-level `i18n.yml` with per-package registrations coexisting with Shopify per-project configs (Sam)
- `parser: liquid` registration via `NewDefaultStrategy()` without disturbing existing `.json`/`.arb` parsers (Sam)
- `hyperlocalise init` generates Shopify-flavored `i18n.yml` (Maya, Sam)

#### Cluster C — CLI commands & output

- `hyperlocalise run --locale <list>` — multi-locale concurrent translation (Maya, Jordan)
- Idempotent re-run recovery after rate-limit / transient failures via incremental atomic writes to locale files (Maya; FR17 + NFR-R2)
- Per-file Liquid coverage via `hyperlocalise check` TTY table + `check --json-report` `coverage[]` array (Maya; Option A — FR24 / FR25)
- `hyperlocalise check --json-report <path>` — structured output for CI / GitHub Apps / Linear (Jordan, Alex, Sam)
- `hyperlocalise drift` — Liquid-aware drift detection on scheduled runs (Alex)
- Exit codes: non-zero when `severity-threshold` is met and `fail-on-findings: 'true'` (Alex; FR28 / FR29)
- `check` runs offline — no LLM provider initialization required (Alex, Jordan)

#### Cluster D — Diagnostics & trust

- Stable diagnostic code `W001-liquid-dynamic-key` with file + line precision (Maya, Jordan, Alex)
- End-of-run grouped diagnostic summary, not interleaved with progress lines (Maya)
- Resolution guidance included in diagnostic output (Maya's "Resolution: ..." line)
- Missing-keys and orphan-keys reporting in `check` (Jordan: "3,614 missing, 47 orphan")
- Structured error output with recoverable instructions (Maya's rate-limit message pointing at idempotent re-run)

#### Cluster E — CI integration

- GitHub Action (`hyperlocalise/action@v1`) with `check:` + `severity-threshold:` + `fail-on-findings:` + `github-annotations:` inputs per `action.yml` (Alex)
- Inline PR annotations from `check --json-report` consumption via `github-annotations: 'true'` (Alex, Sam)
- Consistent behavior across repos and themes in a fleet (Alex, Sam)
- Additive-only `check --json-report` output across minor versions — semver discipline (Sam)

#### Cluster F — Docs & discoverability

- Shopify quickstart page at `hyperlocalise.dev/workflows/shopify-themes` (Maya, Sam)
- Changelog entries clear enough to evaluate risk without testing (Sam)
- CI YAML examples for the GitHub Action (Alex)

#### Cluster G — Backward compatibility

- Adding Liquid does not alter any observable behavior of `JSONParser`, `HTMLParser`, ARB parser (Sam, implicit in Jordan + Alex)
- `check --json-report` schema stable (additive-only) across minor versions (Sam)
- `NewDefaultStrategy()` gracefully registers `.liquid` without disturbing existing registrations (Sam)

#### Cluster-to-success-criterion mapping

Each capability cluster traces to one or more Step 3 success criteria:

| Cluster                            | Success criteria served (from Step 3)                                    |
| ---------------------------------- | ------------------------------------------------------------------------ |
| A — Parsing & extraction           | _Coverage_ (User); _No-panic safety_ (Technical)                         |
| B — Configuration & auto-detection | _Workflow fit_ (User)                                                    |
| C — CLI commands & output          | _Speed_, _Coverage_ (User); _Performance ceiling_ (Technical)            |
| D — Diagnostics & trust            | _Coverage_ (User); _Audience expansion_ (Business)                       |
| E — CI integration                 | _Strategic credibility_ (Business); _Backward compatibility_ (Technical) |
| F — Docs & discoverability         | _Workflow fit_, _First-time setup friction_ (User)                       |
| G — Backward compatibility         | _Backward compatibility_ (Technical); _Audience expansion_ (Business)    |

#### Technical commitments surfaced by the journeys

The journey work surfaced two technical commitments that Step 3 didn't explicitly formalize. They are recorded here and feed forward into Step 10 (Non-functional Requirements) for formal NFR authoring.

- **Diagnostic-code registry.** Warning and error codes emitted by the Liquid parser are published in a versioned registry (`docs/diagnostics.md` as the single source of truth). Each code has a stable identifier (e.g., `W001-liquid-dynamic-key`), a human-readable resolution hint, and a version-added marker. New codes may be added in minor releases; existing codes are never renamed or removed within a major version. Alex's CI gate (`severity-threshold: error` + `fail-on-findings: 'true'`) and Sam's additive-only `check --json-report` output both depend on this code-stability contract.

- **`check --json-report` output schema stability.** JSON emitted by `hyperlocalise check --json-report <path>` conforms to a versioned schema with additive-only changes in minor releases. Fields are never removed, renamed, or type-shifted within a major version. A golden-file regression suite under `internal/i18n/translationfileparser/testdata/` (repo-root path; verified Step 10) enforces this on every release.

## Domain-Specific Requirements

The Liquid feature lives in a low-complexity domain (general developer tooling) — no regulatory framework, no certification path, no compliance gates. Two domain-flavored concerns merit explicit capture; both will be formalized further in Step 10 (Non-functional Requirements).

### License compatibility

- The Liquid parser is built on `github.com/osteele/liquid` (MIT-licensed). Hyperlocalise itself is open source under a compatible license; the dependency is a standard runtime dependency, not vendored or modified.
- License attribution appears in the project's `THIRD_PARTY_LICENSES.md` (or equivalent) and in any distribution artifacts. No copyleft contamination risk; no static linking of incompatibly-licensed code.

### Secret management (LLM API keys)

- The CLI never reads secrets from `i18n.yml` or any committed file. Secrets enter via environment variables (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, etc.) or a local-only `.env.local` consumed at process start.
- Documentation (the `/workflows/shopify-themes` quickstart and the existing CLI docs) instructs users to add `.env.local` to `.gitignore`. The `init` command can optionally append `.env.local` to `.gitignore` when generating `i18n.yml`.
- `check`-mode operations are offline and require no API key — supports CI gates (Alex's journey) where no LLM credentials are configured.
- The CLI emits no telemetry; secrets never leave the user's machine for any purpose other than the explicit LLM API call during `run` mode.

## Distinctive Differentiators

The Liquid feature is excellent execution of an existing paradigm (parse source → extract keys → sync to locale files), not a breakthrough innovation. That said, four positional differentiators distinguish Hyperlocalise from competitors in the localization-tooling space. They are recorded here so they can anchor competitive positioning in Step 8 (scoping) and marketing/docs language thereafter.

- **Local-first with offline `check` mode.** `hyperlocalise check` and `hyperlocalise drift` run without LLM credentials, enabling them in CI gates without secret distribution. SaaS competitors (Smartling, Lokalise, Phrase) require API access on every operation; format-specific OSS tools (`i18next-parser`, `lingui-cli`, `formatjs/cli`) have no LLM integration at all. Hyperlocalise is the only tool in the category where the validation pass is offline and the translation pass is online.

- **Structured dynamic-key diagnostics, never silent skips.** Every static `{{ 'key' | t }}` is extracted; every dynamic `{{ variable | t }}` is surfaced as a `W001-liquid-dynamic-key` finding with file, line, and resolution guidance. Competing tools either skip dynamic keys silently (creating "Auto-Translate garbage" risk per Jordan's brand legal team) or fail the run entirely. The diagnostic-code registry (committed in Step 4 as forwarded to Step 10) makes findings consumable by CI annotations, Linear tickets, and PR review tooling.

- **Format-agnostic strategy architecture.** Adding Liquid is one new `Parser` registration on `NewDefaultStrategy()`, not a fork or a sibling tool. The same CLI surface (`run`, `check`, `drift`) operates uniformly across `.json` / `.arb` / `.html` / `.liquid`. Competitors are typically format-locked: `i18next-parser` is JSON-only, `arb_translate` is ARB-only, Shopify Translate & Adapt is `.liquid`+Shopify-only. A studio using Hyperlocalise on Next.js (Sam's journey) gets Liquid for free at upgrade time.

- **No SaaS lock-in, BYO LLM provider.** Open-source CLI; users supply their own OpenAI/Anthropic/etc. API key; translations are produced and stored in the user's repository. No vendor accounts, no per-seat pricing, no data residency questions, no subscription expiration risk. SaaS competitors require account provisioning, seat licensing, and ongoing subscription; lose access on contract end. Hyperlocalise's locale files belong to the user the moment they're written.

These differentiators are positional, not paradigmatic, and will inform the in/out-of-scope and competitive-boundary work in Step 8.

## CLI Tool Specific Requirements

This section consolidates the CLI-shape commitments scattered across Steps 3, 4, and 5 into one reference for the implementation team. Codebase verification (see _Verification ledger_ below) confirmed that several flag names referenced in the Step 4 user journeys do not yet exist; those rows are marked **forward-looking** in the table and will be locked into formal acceptance criteria in Step 9 (Functional Requirements). Shell completion and editor/IDE integration are deferred at the end of this section.

### Project-type overview

Hyperlocalise is a scriptable, locally-run CLI (`cli_tool` primary; `developer_tool` overlap). The Liquid feature adds one new file-format parser to an existing CLI surface — no new top-level commands, no new packaging targets, no new platform support. The user-facing surface that changes is: extension auto-detection, `i18n.yml` parser registration, and W001 diagnostic emission.

### Command structure

The Liquid feature operates entirely through the existing top-level commands. No new subcommands are introduced.

| Command                                                                | Liquid-specific behavior                                                                                                                                                                                                           | Status                                                                                                                                                                                                                                                                                                                                                                           |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- |
| `hyperlocalise init`                                                   | Detects Shopify theme directories; writes `i18n.yml` with `parser: liquid` and Shopify-flavored defaults                                                                                                                           | New for v1 (Shopify auto-detection logic)                                                                                                                                                                                                                                                                                                                                        |
| `hyperlocalise run --config <path> --locale <list> [--dry-run]`        | Parses `.liquid` files; extracts keys; translates missing keys via configured LLM provider                                                                                                                                         | Existing CLI surface; Liquid is a new parser registration on `NewDefaultStrategy()`                                                                                                                                                                                                                                                                                              |
| `hyperlocalise check --config <path> --json-report <path> [--no-fail]` | Reports parse errors, missing-keys, orphan-keys; offline (no LLM provider initialization)                                                                                                                                          | Existing flags on `check` command                                                                                                                                                                                                                                                                                                                                                |
| W001 dynamic-key diagnostic emission                                   | Surfaces every dynamic `t`-filter call (e.g. `variable \| t`) with file, line, and resolution guidance                                                                                                                             | New for v1                                                                                                                                                                                                                                                                                                                                                                       |
| Per-file `.liquid` coverage report                                     | Keys extracted vs. skipped per `.liquid` file                                                                                                                                                                                      | New for v1; Maya's journey referenced a `--liquid-coverage` flag — that exact flag name is forward-looking and will be specified in Step 9                                                                                                                                                                                                                                       |
| Configurable exit-code policy                                          | Failure thresholds for CI gates                                                                                                                                                                                                    | Existing today via `--no-fail`; richer `--fail-on missing-keys,new-warnings` policy referenced in Alex's journey is **forward-looking** (no such flag in the codebase today) and will be specified in Step 9                                                                                                                                                                     |
| `hyperlocalise run --resume`                                           | Recovery from partial-progress files after rate-limit / transient failures                                                                                                                                                         | **Forward-looking** (introduced by Maya's attempt-2 narrative; no such flag in the codebase today). Step 9 will determine whether v1 ships this or punts to v1.x                                                                                                                                                                                                                 |
| GitHub Action (`hyperlocalise/action@v1`, see `action.yml`)            | Inputs: `check` (drift\|check), `config-path`, `working-directory`, `hyperlocalise-version`, `fail-on-drift`, `fail-on-findings`, `severity-threshold`, `upload-artifact`, `github-annotations`, `summary-format`, `summary-limit` | Existing surface; Liquid runs through it as a new file extension. Alex's Step 4 journey YAML originally used aspirational input names (`command`, `format`, `fail-on`) that do not exist in `action.yml`; Step 11 polish corrected the journey YAML to use `check:`, `severity-threshold:`, `fail-on-findings:`, and `github-annotations:` matching the canonical action surface |     |

### Output formats

- **Default (TTY):** Human-readable progress lines during `run`; end-of-run grouped diagnostic summary (not interleaved). Diagnostic codes (`W001-liquid-dynamic-key`) include file, line, and resolution guidance.
- **`check --json-report <path>`:** Versioned JSON schema with additive-only changes within a major version. Consumed by CI / GitHub Apps / Linear integrations. Schema stability is a Step 10 NFR; golden-file regression suite enforces it. (Step 4 journey narratives originally used a `--format json` shorthand; corrected throughout to `--json-report <path>` in Step 11 polish to match the canonical flag.)
- **Exit codes:** Zero on success; non-zero today via `--no-fail=false` (default). A richer `--fail-on missing-keys,new-warnings` policy is **forward-looking** (referenced in Alex's Step 4 journey but not yet implemented) and will be specified in Step 9 with a concrete exit-code taxonomy.
- **Errors:** Structured error output with recoverable instructions. The rate-limit recovery flow (partial-progress file + `--resume`) referenced in Maya's Step 4 journey is **forward-looking** — no `--resume` flag exists in the codebase today; Step 9 will determine whether v1 ships this or punts to v1.x.

### Config schema

- **Convention:** `i18n.yml` at project root (Shopify themes) or per-package (Sam's monorepo).
- **Liquid-specific keys:** `sources:` (glob to `.liquid` files), `parser: liquid`, `locale_files:` (glob to locale JSON), `locales:` (target locale codes).
- **Auto-detection (`init`):** Shopify theme directories produce a 12-line `i18n.yml` with sensible defaults; no wizard, no questions. User can edit afterwards.
- **Secrets never enter `i18n.yml`** — environment-variable-only (see Domain-Specific Requirements: Secret management).
- **Multi-project compatibility:** A root `i18n.yml` may register multiple parsers across packages; `.liquid` registration does not disturb existing `.json` / `.arb` / `.html` registrations.

### Scripting support

- **CI-first design:** All commands are non-interactive by default. No TTY-required prompts. `init` is the one exception and accepts `--yes` for unattended use (existing behavior; Liquid does not change it).
- **Composable with shell tooling:** `check --json-report <path>` writes a JSON report file consumable by `jq`, Linear actions, and custom GitHub Apps. Stable JSON schema (Step 10 NFR) makes downstream consumers durable.
- **GitHub Action wrapper:** `hyperlocalise/action@v1` exposes the inputs declared in `action.yml` (see Verification ledger). Liquid is just a new file extension to the action — no new action inputs needed for v1.
- **Resumability:** Forward-looking. A `run --resume` mechanism for partial-progress recovery is referenced in Maya's Step 4 journey but does not exist in the codebase today. Step 9 (Functional Requirements) will determine whether v1 ships this or defers to v1.x; CI retry semantics today rely on idempotent re-runs of `run` against the existing locale files.

### Deferred to later steps

- **Shell completion:** Existing CLI ships bash/zsh/fish completion (cobra-built-in). Adding `.liquid` as a recognized extension requires no completion-file change. Confirmed as no-op for v1; if `init` gains new flags, completion will be regenerated as part of standard release tooling. Tracked in Step 9 as a functional non-requirement (i.e., explicitly out of scope as a new work item).

- **IDE / editor integration (LSP, CodeLens, inline W001 surfacing):** Out of scope for v1. Reconsider when one of the following triggers fires: (a) ≥10 distinct GitHub issues request LSP within a calendar quarter; (b) a downstream consumer (Shopify, Vercel, JetBrains, Microsoft) ships an extension that depends on Hyperlocalise output and proposes integration; (c) a community contributor opens a draft PR. Until one of those triggers fires, GitHub PR annotations (Alex's journey) cover the editor-adjacent feedback loop. Recorded in Step 8 (scoping) as a deliberate exclusion with these triggers.

### Verification ledger

Codebase verification against `apps/cli/cmd/`, `go.mod`, and `action.yml` (performed during Step 7 party-mode review) found:

- **Confirmed existing.** `spf13/cobra` framework (✓ `go.mod`, supplies bash/zsh/fish completion as a free benefit). On `run`: `--config`, `--locale`, `--target-locale`, `--dry-run`, `--prune`, `--bucket`, `--group`, `--progress`, `--workers`. On `check`: `--config`, `--json-report`, `--no-fail`. On `sync`: `--config`, `--locale`, `--key-prefix`, `--dry-run`, `--output`, `--fail-on-conflict`, `--apply-curated-over-draft`. Action inputs (`action.yml`): `check`, `config-path`, `working-directory`, `hyperlocalise-version`, `fail-on-drift`, `fail-on-findings`, `severity-threshold`, `upload-artifact`, `github-annotations`, `summary-format`, `summary-limit`.
- **Forward-looking (introduced by Step 4 user journeys; not yet implemented).** `--liquid-coverage` flag, `--fail-on missing-keys,new-warnings` flag policy on `check`, `--resume` flag on `run`. These represent design intent surfaced through narrative; Step 9 (Functional Requirements) will determine which become v1 commitments and which defer to v1.x.
- **Action input names — corrected in Step 11 polish.** Alex's Step 4 journey YAML originally used `command:`, `format:`, `fail-on:` (which do not exist in `action.yml`). Corrected to `check:`, `severity-threshold:`, `fail-on-findings:`, and `github-annotations:` matching the canonical action surface. The intent (CI gate fails on missing keys / new findings, with inline PR annotations) is preserved.
- **Output-format flag spelling — corrected in Step 11 polish.** Journeys originally referenced `check --format json`; corrected throughout to `check --json-report <path>` matching the canonical CLI surface.

## Project Scoping & Phased Development

### MVP Strategy & Philosophy

**MVP approach:** _experience MVP_ — deliver the four Step 4 user journeys end-to-end with the existing CLI surface, adding only the minimum new code to make `.liquid` a first-class file format. Brownfield discipline: every new flag, schema field, and CLI surface change must trace to a journey moment that fails without it. This ruled in W001 emission and Shopify-flavored `init` (clearly required), and ruled out richer `--fail-on` policy and `--resume` flag (existing surface covers the journeys).

**Resource shape:** brownfield, small team, bounded surface. Most v1 work is one new `Parser` registration, one new `init` codepath, one diagnostic-code definition, one workflow doc page, and golden-file regression coverage.

**Validation approach:** journey-driven. Each of Maya / Jordan / Alex / Sam represents a distinct customer segment; v1 ships when all four journeys execute end-to-end against a real Shopify theme corpus.

### MVP Feature Set (Phase 1 — v1)

**Core user journeys supported:**

- Maya (Shopify dev, first-time user) — `init` → `run` → `check` → ship
- Jordan (translation contractor, audit trail) — `i18n.yml` overrides + W001 ledger + multi-locale `run`
- Alex (platform engineer, CI gate) — GitHub Action with existing `action.yml` inputs, no new action surface
- Sam (existing user, expansion path) — additive parser registration, zero behavior change to existing parsers

**Must-have capabilities:**

- `LiquidParser{}` implementing `Parse` + `ParseWithContext` via `osteele/liquid`
- `parser: liquid` registration on `NewDefaultStrategy()`; existing JSON / ARB / HTML parsers unchanged
- Static key extraction from `{{ 'key' | t }}` (zero false negatives)
- Comment / `{% raw %}` / chained-filter / `html_safe` handling without false positives
- W001 dynamic-key diagnostic emission with stable code, file path, line number, and resolution guidance
- `hyperlocalise init` Shopify theme auto-detection writing a Shopify-flavored `i18n.yml`
- Per-file `.liquid` coverage report folded into the existing `check` output (see _Coverage delivery shape_ below)
- `/workflows/shopify-themes` quickstart documentation page
- `docs/diagnostics.md` registry with `W001-liquid-dynamic-key` defined
- JSON-schema stability for `check --json-report` (additive-only; golden-file regression suite)
- Existing CI surface unchanged — `hyperlocalise/action@v1` keeps its current `action.yml` inputs; Liquid runs through the action as a new file extension

**Coverage delivery shape (resolves Amelia's spec-rigor concern from Step 8 party-mode):**

The per-file Liquid coverage report does **not** introduce a `--liquid-coverage` flag. It lands as **Option A** (additive JSON schema + TTY rendering):

- **JSON layer (`check --json-report <path>`):** new top-level `coverage[]` array. Each entry: `{ file, parser, total_keys, extracted_keys, dynamic_keys, parse_errors }`. Additive to the existing schema; consistent with the JSON-schema-stability NFR (Step 10). Sam's 12-project before/after diff verifies additive-only.
- **TTY layer (default `check` output):** end-of-run grouped table showing per-file coverage when `parser: liquid` files are present in `i18n.yml`. Today's `check` TTY output emits aggregated counts; Liquid coverage is a TTY enhancement triggered by the presence of Liquid sources, not unconditional.
- **Step 9 will define exact field names, ordering, and TTY rendering layout as functional acceptance criteria.**

**Alex CI gate mapping (resolves John's deferral question from Step 8 party-mode):**

Alex's CI gate works today via existing flags — no `--fail-on` flag is required. Concrete realization:

- `inputs.check: check`
- `inputs.severity-threshold: error` (gates on missing-keys, which are errors; W001 stays a warning by design and does not fail the gate)
- `inputs.fail-on-findings: 'true'`
- The action runs `check --no-fail --json-report <path>`; the `analyze` step parses the report and exits non-zero based on the threshold + findings flags.

This is the configuration Alex's Step 4 journey YAML _should_ show; the current journey YAML uses aspirational input names (`command`, `format`, `fail-on`) that will be corrected during Step 11 polish.

### Post-MVP Features

**Phase 2 (v1.x — demand-gated):**

Each Phase 2 item has explicit, observable trigger criteria. Without telemetry (Step 5 commitment), triggers are observed via GitHub issues, community channel posts, or direct downstream-consumer requests.

- **`--fail-on missing-keys,new-warnings` policy on `check`** — finer-grained gate semantics distinguishing finding types. Trigger: ≥3 distinct GitHub issues in a calendar quarter requesting per-finding-type gate semantics, OR a marquee downstream consumer (Vercel, Shopify, Linear, etc.) requests it on their roadmap. Until then, Alex's gate (above) serves all observed CI use cases.

- **`--resume` flag on `run` with partial-progress files** — explicit resume mechanism beyond today's idempotent re-run. Verified during Step 8 party-mode that `runsvc` flushes outputs incrementally and atomically per target file (`apps/cli/internal/i18n/runsvc/output_flush.go`, `executor.go`); rate-limit failure preserves all completed translations and idempotent re-run picks them up. Trigger: ≥3 distinct GitHub issues / community posts in a quarter reporting re-translation friction (despite incremental flushing), OR observed >20% retranslation overhead in shared user cost-tracking samples.

- **Additional Liquid-aware diagnostics beyond W001** — W002+ codes for malformed filter chains, deprecated `t`-filter forms, suspicious key patterns. Trigger: parser-correctness reports from real Shopify themes that W001 alone doesn't catch; at least three distinct theme corpora exhibiting the missed pattern.

- **Wider Shopify ecosystem coverage** — Hydrogen storefronts, embedded Liquid in Shopify CLI app templates. Trigger: explicit demand from at least one production user actively shipping in those targets.

- **`init` appends `.env.local` to `.gitignore`** (former FR42, demoted during Step 11 party-mode review). For v1, documentation and `init` output instruct users to add `.env.local` to `.gitignore` manually; a zero-report accidental-commit rate in the first 90 days post-launch is the success hypothesis. Trigger: first public GitHub issue or support thread reporting a `.env.local` credential leak attributed to Hyperlocalise adoption, OR ≥3 distinct user requests for the feature in a calendar quarter. Implementation is trivial once triggered; deferring preserves the "bounded surface" discipline.

**Phase 3 (v2+ — vision, longer horizon):**

- **IDE / editor integration** (LSP, CodeLens, inline W001 surfacing) — trigger criteria already specified in the _CLI Tool Specific Requirements › Deferred to later steps_ section: ≥10 GitHub issues / quarter, downstream consumer adoption, or community draft PR.
- **Localization-quality scoring** — LLM-as-judge pipeline for translation idiomacy. Separate research track; not in the brownfield-extension scope this PRD addresses.
- **Cross-project locale-key reuse / shared-glossary support** — multi-repo glossary store, cross-theme term consistency. Conceptually distinct product surface; deserves its own PRD.
- **Translation memory and term-base integration** — XLIFF-style TM, TBX termbase ingestion. Industry-standard formats; integration cost is non-trivial; demand is unclear.

### Risk Mitigation Strategy

**Technical risks:**

- _Liquid parser correctness on edge cases._ Mitigation: rely on `osteele/liquid` (battle-tested via Jekyll and Shopify-CLI); our parser adds only the `t`-filter detection and W001 emission layers. Test corpus drawn from at least three representative Shopify themes (paths to be specified in Step 9 acceptance criteria).
- _JSON-schema regression._ Mitigation: golden-file suite under `internal/i18n/translationfileparser/testdata/` (repo-root path; verified during Step 10 alongside the existing `marshal_target_fallback/` fixtures) enforced on every PR; Sam's 12-project before/after diff is the journey-validation analogue.
- _Strategy-pattern coupling._ Mitigation: `Parser` interface contract is unchanged; new `.liquid` registration is purely additive on `NewDefaultStrategy()`. Existing parser test suites run unchanged.
- _Coverage-spec ambiguity._ Mitigation: addressed above via _Coverage delivery shape_; Step 9 locks the schema delta and TTY layout into acceptance criteria.

**Market risks:**

- _Brand teams refuse to trust LLM translations._ Mitigation: W001 + offline `check` lets brand legal gate without LLM dependency (Jordan's journey). Translation linguistic accuracy is a separate problem; Hyperlocalise's v1 value is process integrity, not lexical quality.
- _Shopify ecosystem fragmentation._ Mitigation: v1 explicitly targets Shopify themes (auto-detection, doc page, init defaults). Other Liquid use-cases (Jekyll, custom Liquid hosts) work via manual `i18n.yml` configuration but are not auto-detected; clearly documented as such.
- _LLM provider deprecation / rate-limit policy changes._ Mitigation: provider-agnostic by design (BYO API key, multi-provider support already exists in the CLI). Rate-limit recovery via incremental atomic writes (verified during Step 8) keeps Maya's worst case bounded.

**Resource risks:**

- _Single small team on brownfield._ Mitigation: bounded surface (one parser, one `init` codepath, one diagnostic, one doc page, one workflow doc, golden files). Critical path: parser → diagnostic emission → `init` auto-detection → docs → CI golden files.
- _LLM testing cost._ Mitigation: `check` mode is offline by design; Liquid-specific tests use mock / recorded LLM responses for `run` codepath; real LLM integration suite limited to a small set of representative themes.
- _Documentation lag._ Mitigation: `/workflows/shopify-themes` quickstart and `docs/diagnostics.md` ship in the same PR as the parser, not as a follow-up. Treated as a release-gating deliverable, not a nice-to-have.

## Functional Requirements

This section defines the binding capability contract for v1. Every feature listed here must exist in the shipped product; no feature absent from this list will be built without an explicit PRD amendment. Forward-looking items (per Step 7 verification ledger and Step 8 phasing) are deliberately excluded and tracked in _Project Scoping & Phased Development_.

### Liquid Parsing & Key Extraction

- **FR1:** The Hyperlocalise CLI can parse `.liquid` files using a `LiquidParser` that implements the existing `Parser` interface (`Parse` + `ParseWithContext`).
- **FR2:** A developer can extract every static translation key from `{{ 'key.path' | t }}` calls across a `.liquid` file with zero false negatives on the canonical Liquid test corpus (corpus enumerated in Step 10 acceptance criteria).
- **FR3:** The parser can correctly skip translation-filter calls inside `{% comment %}` blocks, `{% raw %}` blocks, and Liquid string literals, emitting no findings for those occurrences.
- **FR4:** The parser can correctly handle chained Liquid filters where `t` appears in any filter position (e.g., `{{ 'k' | upcase | t }}` and `{{ 'k' | t | escape }}`).
- **FR5:** The parser can correctly handle `html_safe` filter compositions and `t`-filter calls inside `{% capture %}` blocks.
- **FR6:** The parser can detect dynamic translation-filter calls (e.g., `{{ variable | t }}`, `{{ section.settings.label | t }}`) and emit a `W001-liquid-dynamic-key` diagnostic for each occurrence.
- **FR7:** A `W001-liquid-dynamic-key` diagnostic record can carry a stable diagnostic code, source file path, line number, and a human-readable resolution hint.
- **FR7b (diagnostics-emission contract):** `W001-liquid-dynamic-key` findings and parse-error findings emitted by the Liquid parser reach the caller (`runsvc` during `run`; `check` command during `check`) with their full payload (code, source file path, line number, resolution hint) intact, are rendered into both TTY output and `--json-report` JSON output, and do not flow through the `Parser` / `ContextParser` return values (which are typed `map[string]string` and carry no position information by construction). The side-channel mechanism by which findings leave the parser is an architecture decision tracked in _Open Questions for Architecture_.
- **FR8:** The CLI can continue past individual `.liquid` files that fail to parse, emitting a parse-error finding for each failed file rather than aborting the entire run.

### Configuration & Project Setup

- **FR9:** A developer can run `hyperlocalise init` in a Shopify theme directory and have the CLI auto-detect the theme layout.
- **FR10:** The auto-detection in `init` can produce an `i18n.yml` with `parser: liquid`, Shopify-flavored `sources:` glob, and `locale_files:` glob using sensible defaults without user prompts.
- **FR11:** A developer can override auto-detected paths by editing `i18n.yml` (e.g., `theme/config/locales/` instead of `locales/`) and have the CLI honor those overrides.
- **FR12:** A monorepo developer can register `parser: liquid` in a root-level or per-package `i18n.yml` alongside `parser: json` / `parser: arb` / `parser: html` registrations without configuration collisions.
- **FR13:** The CLI can run with `parser: liquid` registered without altering any observable behavior of the existing JSON, ARB, or HTML parsers in the same project.
- **FR14:** A developer can configure target locales for a Liquid project via the existing `locales:` mechanism in `i18n.yml`.

### Translation Execution

- **FR15:** A developer can run `hyperlocalise run --config <path> --locale <list>` against a `.liquid` source set and produce translated locale files for all requested locales.
- **FR16:** A developer can pass multiple locales (e.g., `--locale fr,de,it,es,nl,sv`) in a single `run` invocation and have all locales translated.
- **FR17:** A developer can re-run `hyperlocalise run` after an interrupted or rate-limited execution and have the CLI skip translations already persisted to locale files (idempotent re-run).
- **FR17b:** When `hyperlocalise run` is interrupted mid-execution (rate-limit, network failure, manual cancellation), the CLI can preserve all per-locale translations completed before the interruption, with each locale file written atomically.
- **FR18:** A developer can run `hyperlocalise run --dry-run` against a `.liquid` source set to preview planned translation work without invoking the LLM provider or writing locale files.

### Validation & Diagnostics

- **FR19:** A developer can run `hyperlocalise check` against a `.liquid` project offline (without LLM provider credentials) and receive a complete set of findings.
- **FR20:** The `check` command can report missing translation keys (present in source `.liquid` files but absent in target locale files) per target locale.
- **FR21:** The `check` command can report orphan translation keys (present in target locale files but absent in source `.liquid` files) per target locale.
- **FR22:** The `check` command can emit `W001-liquid-dynamic-key` findings alongside missing/orphan key findings in a unified report.
- **FR23:** A developer can run `hyperlocalise check --json-report <path>` and produce a machine-consumable JSON report consumable by CI annotations, GitHub Apps, and ticketing systems.
- **FR24:** The `check` JSON report can carry a top-level `coverage[]` array with per-file entries containing file path, parser identifier derived from the file extension as dispatched by the Strategy at `internal/i18n/translationfileparser/strategy.go` (e.g., `.liquid` → `liquid`, `.json` → `json`, `.arb` → `arb`, `.html` → `html`), total keys, extracted keys, dynamic keys, and parse-error count when `.liquid` files are present in the source set.
- **FR25:** The `check` TTY output can render a per-file coverage table for `.liquid` files when Liquid sources are present in `i18n.yml`, in addition to the existing aggregated counts.
- **FR26:** A developer can run `hyperlocalise check --no-fail` to receive findings in the report without the CLI returning a non-zero exit code.
- **FR27:** A developer can rely on grouped end-of-run diagnostic summaries (not interleaved with progress lines) when `run` or `check` emits multiple findings.

### CI Integration

- **FR28:** A platform engineer can use `hyperlocalise/action@v1` in a GitHub workflow with the existing `action.yml` inputs (`check`, `config-path`, `severity-threshold`, `fail-on-findings`, `fail-on-drift`, etc.) without modification when the project contains `.liquid` files.
- **FR29:** The action can fail a CI run with a non-zero exit code when `inputs.severity-threshold: error` is set and the `check` report contains error-level findings (e.g., missing keys).
- **FR30:** The action can emit inline GitHub workflow annotations from `check --json-report` output when `inputs.github-annotations: 'true'`, surfacing each finding at its source file and line.
- **FR31:** A platform engineer can schedule `hyperlocalise/action@v1` with `inputs.check: drift` to detect drift on `.liquid` projects on a recurring schedule.
- **FR32:** A platform engineer can consume `check --json-report` JSON output downstream (Linear, Slack, custom GitHub Apps) using a stable schema that does not break across Hyperlocalise minor versions.

### Backward Compatibility & Stability

- **FR33:** The CLI can guarantee that `check --json-report` JSON schema receives only additive changes within a major version (no field removals, renames, or type changes).
- **FR34:** The CLI can be upgraded across a minor version (e.g., 1.2.x → 1.3.x adding Liquid) without altering the JSON output of `check --json-report` for projects that contain only `.json`, `.arb`, or `.html` source files.
- **FR35:** A studio operator can pin a Hyperlocalise version in CI and run before/after diffs of `check --json-report` output across heterogeneous projects to verify upgrade safety.

### Documentation & Diagnostic Registry

- **FR36:** A developer can read a Shopify-themes quickstart at `hyperlocalise.dev/workflows/shopify-themes` covering `init` → `run` → `check` end-to-end with copy-pasteable commands.
- **FR37:** A developer can read a versioned diagnostic-code registry at `docs/diagnostics.md` listing every emittable code (initially `W001-liquid-dynamic-key`) with stable identifier, resolution hint, and version-added marker.
- **FR38:** A developer can find Shopify-specific GitHub Action YAML examples in the `hyperlocalise/action@v1` documentation, using only the input names declared in the canonical `action.yml`.

### Secret & License Hygiene

- **FR39:** The CLI can read LLM API credentials only from environment variables or a developer-local `.env.local` file; it cannot read credentials from any committed file (including `i18n.yml`).
- **FR40:** A developer can run `hyperlocalise check` and `hyperlocalise drift` to completion without any LLM provider credentials configured.
- **FR41:** A maintainer can publish license attribution for `osteele/liquid` (MIT) and any other third-party dependencies in a project-level `THIRD_PARTY_LICENSES.md` (or equivalent) shipped with each release.

_(Former FR42 on `init` appending `.env.local` to `.gitignore` was demoted to Phase 2 during Step 11 party-mode review — see_ Post-MVP Features _for the trigger. For v1, the `/workflows/shopify-themes` quickstart and `init` documentation instruct users to add `.env.local` to `.gitignore` manually.)_

**Capability contract reminder.** This list is binding. Any feature not listed here will not exist in v1 unless an explicit PRD amendment adds it. Forward-looking items from Step 7 / Step 8 (`--liquid-coverage`, `--fail-on missing-keys,new-warnings`, `--resume`, IDE integration) are deliberately excluded; their inclusion conditions are specified in _Project Scoping & Phased Development_.

## Non-Functional Requirements

NFRs specify HOW WELL the system must perform, not WHAT it must do. Only categories that materially apply to this feature are documented. Scalability, accessibility, and CLI-self-i18n are acknowledged as not-applicable in _Deferred NFR Categories_ below.

### Performance

- **NFR-P1 (gated):** On a GitHub Actions `ubuntu-latest` runner, `hyperlocalise run` against a small Shopify theme (≤500 translatable keys, ≤50 `.liquid` files) completes parsing and static key extraction in **<10 seconds**, excluding LLM wall-clock time.
- **NFR-P2 (gated):** On the same runner, `hyperlocalise run` against a large Shopify theme (≤5,000 translatable keys, ≤500 `.liquid` files) completes parsing and static key extraction in **<60 seconds**, excluding LLM wall-clock time.
- **NFR-P3 (gated):** On the same runner, `hyperlocalise check` against the large theme profile (offline, no LLM) completes in **<20 seconds**.
- **NFR-P4 (developer-experience target, not gated):** On a reference developer laptop (Apple M1 Pro / equivalent x86, 16 GB RAM, NVMe SSD), the small / large / `check` workloads target **<5 s / <30 s / <10 s** respectively. Measured via a local benchmark script documented in the Shopify-themes quickstart. Not enforced in CI; provided as a user expectation.
- **NFR-P5 (regression gate):** Go benchmarks (`Benchmark*`) for Liquid parsing and key extraction run on every PR. A PR fails the gate if its result is **>20% slower than the rolling median of the last 10 main-branch benchmark runs** for the same benchmark. Baseline data is stored in repo (committed ledger) or CI cache; method locked in implementation.

### Reliability

- **NFR-R1:** `hyperlocalise run` writes every target locale file atomically (write-to-temp + rename). Process kill, OS crash, or disk-full cannot leave a target locale file in a corrupted or partially-written state. (Currently implemented in `flushOutputForTarget`; this NFR locks the contract.)
- **NFR-R2:** `hyperlocalise run` flushes completed translations to disk incrementally (per target locale, not only at end-of-run), preserving all translations completed before any mid-run interruption (rate-limit, network failure, manual cancellation, OS signal).
- **NFR-R3:** `run` and `check` are idempotent against an unchanged source set: no net changes to locale files, and `check --json-report` output is byte-identical modulo timestamps.
- **NFR-R4 (operationalizes FR8 — behavioral, not fixture-count):** For any mixed source set containing a combination of valid and malformed `.liquid` files — including at minimum unbalanced tags, invalid filter syntax, non-UTF-8 bytes, files >10 MiB, and zero-byte files — `hyperlocalise run` must (a) translate every valid file in the set, (b) emit exactly one parse-error finding per malformed file with its source path and (where derivable) line number, (c) never abort mid-run due to a malformed-file cause, and (d) return exit code 0 unless the configured severity threshold dictates otherwise. Verified by integration test, not by a minimum fixture count.
- **NFR-R5 (panic-recovery boundary):** The Liquid parser wraps every call into `github.com/osteele/liquid` (a third-party dependency that can panic on adversarial input) in a `defer recover()` boundary at the Liquid parser's `Parse` / `ParseWithContext` entry points. A recovered panic is converted into a parse-error finding for the offending file (per FR8 and NFR-R4) without propagating up to `runsvc`, the strategy dispatcher, or the CLI process. Verified by a fuzz test (Technical Success criterion “no-panic safety”). The recovery boundary lives at the parser package layer, not at the strategy or `runsvc` layer, so that future parsers with different panic risk profiles can set their own boundaries without a global try/catch.

### Security

- **NFR-S1:** LLM API credentials are read only from process environment variables or a developer-local `.env.local` file. Any attempt to read credentials from `i18n.yml` or any other committed file fails at config-load time with a clear error.
- **NFR-S2:** Zero telemetry. `check` and `drift` make zero outbound network requests; `run` makes outbound requests only to the configured LLM provider endpoint. Verified by an integration test that executes the CLI under a network sandbox blocking all non-allowlisted egress.
- **NFR-S3:** Credential values never appear in stdout, stderr, `check --json-report` output, progress UI, or artifact uploads. Verified by a log-scrubbing test using a sentinel secret value planted in the test environment.

### Stability & Compatibility

- **NFR-C1 (schema additivity):** `check --json-report` carries a top-level `schemaVersion` field. **Introduction note:** `schemaVersion` does not exist in the current `check --json-report` output (confirmed via codebase inspection during Step 11 review). This feature introduces it at value `1`, emitted unconditionally on every `check --json-report` write starting with the CLI release that ships Liquid support. **Consumer-side compatibility contract:** downstream consumers (GitHub Apps, Linear integrations, studio-level diff tooling) MUST treat the absence of `schemaVersion` as schema version `0` (pre-introduction, field-set as it existed before this release) and MUST NOT fail parsing on absence. Consumers MUST NOT fail on presence of unknown fields at any schema version — NFR-C1 guarantees only additive changes, so unknown fields are always safe to ignore. Within a given `schemaVersion`, changes are additive only — no field removals, no renames, no type changes. The `schemaVersion` integer bumps only when the schema itself breaks, independent of CLI major-version bumps: `schemaVersion: 1` is maintained across the lifetime of this schema regardless of CLI v1.x / v2.x / later major releases, until a deprecation notice is published with at least one minor-release lead time.
- **NFR-C2 (diagnostic-code permanence):** Diagnostic codes (`W001-liquid-dynamic-key` and any future `W002+` / `E001+`) are permanent identifiers. Once published, a code is never renumbered, repurposed, or deleted. Deprecation (marked in `docs/diagnostics.md` with a successor code) is supported; removal is not.
- **NFR-C3 (structural parity across parser additions):** Adding a new parser registration to `NewDefaultStrategy()` at `internal/i18n/translationfileparser/strategy.go` must not alter `check --json-report` output for projects whose `i18n.yml` declares only pre-existing parsers — under _structural equivalence_ (same JSON structure, same values for all fields present in both versions, field-order within an object irrelevant, unknown-to-old-schema fields ignored). Strict byte-for-byte equivalence is not required and not achievable across schema-additive upgrades. The exact equivalence method (RFC 8785 JSON Canonicalization, a custom Go deep-equal, or an existing testing library) is an architecture decision tracked in _Open Questions for Architecture_; Sam's 12-project before/after diff (FR35) is the journey-level validation, and the golden-file regression suite (NFR-M2) is the implementation-level validation.
- **NFR-C4 (input-surface freeze):** Within the `hyperlocalise/action@v1` series, every input declared in `action.yml` at `v1.0` remains valid and semantically equivalent on every `v1.x.y` re-tag. New inputs may be added only with backward-compatible defaults (no-op when unset). Renames, retyping, and removals require a `v2` major-version bump. This contract governs the _input surface_, independent of how users pin the action (moving `@v1` tag vs. `@v1.2.3` SHA pin).
- **NFR-C5:** Minimum Go version is pinned in `go.mod`. Bumping it requires a minor-version release and a changelog entry.

### Observability

- **NFR-O1 (quality; behavior in FR7/FR22):** Diagnostic codes emitted per FR7 and FR22 follow the stable pattern `[WE]\d{3}-[a-z0-9-]+`. A finding emitted without a code is a regression and blocked in review.
- **NFR-O2 (exit-code taxonomy):** Exit codes are stable across releases:
  - `0` — success, no blocking findings
  - `1` — runtime error (panic, invalid config, I/O failure)
  - `2` — findings at or above the configured severity threshold (suppressible via FR26 / `--no-fail`)
  - Other codes are reserved; semantics will not be reassigned once documented.
- **NFR-O3 (quality; behavior in FR27):** Progress lines during `run` and `check` are **grouped** (not interleaved) with findings in TTY output when multiple findings are emitted in a single run. FR27 defines the behavior; this NFR constrains its quality.
- **NFR-O4 (determinism):** `check --json-report` per-file entries are sorted lexicographically by source path. Output is deterministic across runs against an unchanged source set, independent of filesystem directory-entry ordering.

### Maintainability

- **NFR-M1 (canonical test corpus):** The Liquid test corpus lives at `internal/i18n/translationfileparser/testdata/liquid/` (repo-root path; same `testdata/` directory convention as the existing `marshal_target_fallback/` fixtures in the parser module). Required fixture categories:
  - Three representative Shopify themes: one minimal, one production-complexity, one legacy / partial-translation.
  - One fixture per W001 trigger pattern enumerated in FR6 (`variable | t`, `section.settings.x | t`, `obj.prop | t`, chained dynamic with defaults).
  - One fixture per FR3 skip case (`{% comment %}`, `{% raw %}`, Liquid string literal).
  - One fixture per FR4 chained-filter case and FR5 `{% capture %}` case.
  - Malformed-file fixtures covering the NFR-R4 matrix (unbalanced tags, invalid filter syntax, non-UTF-8, >10 MiB, zero-byte).
- **NFR-M2:** Golden-file regression tests run on every PR. Updating a golden file requires an explicit `-update` flag on the test run plus a changelog entry explaining the schema or output delta.
- **NFR-M3 (registry-source-of-truth):** The diagnostic-code registry at `docs/diagnostics.md` is kept in sync with Go source via a unit test that compares the documented registry against the set of codes registered at the emission site. Emitting a code absent from the registry fails the test at build time. The exact synchronization mechanism (Markdown-parse-and-diff, `go generate` with check-in-is-current CI gate, or Go-side single-source-of-truth with embed) is an architecture decision tracked in _Open Questions for Architecture_.
- **NFR-M4:** Parser benchmarks run in CI and surface per-commit numbers; the regression gate is specified in NFR-P5.

### Developer Experience

- **NFR-DX1 (error quality):** Every error- and warning-level finding emitted by the CLI includes (a) the source file path, (b) the 1-indexed line number when a source location is knowable for that finding class, and (c) a one-to-two-sentence remediation hint naming a concrete next action. Findings missing any of these fail the golden-file gate.

### Licensing

- **NFR-L1 (attribution continuity):** Attribution for `osteele/liquid` (MIT) and any subsequently added third-party dependency is present in `THIRD_PARTY_LICENSES.md` in every release artifact from the release introducing the dependency through every subsequent release. Missing or regressed attribution blocks a release tag. (FR41 covers the distribution mechanic; this NFR is the non-regression contract.)
- **NFR-L2:** Dependency upgrades and additions are license-scanned in CI. Non-permissive licenses (GPL, AGPL, unknown) block merge.

### Deferred NFR Categories (acknowledged gaps)

Explicitly documented so the gaps are visible to future reviewers and don't drift into silent omission:

- **Installability / Distribution** — reproducible builds, checksums / signatures on release binaries, GitHub Action tag-resolution strategy. Current state: release binaries ship via the existing Hyperlocalise release process, unchanged by this feature. Promotion trigger: first enterprise or security-sensitive adopter requests signed binaries or a supply-chain attestation.
- **Scalability** — not applicable. Hyperlocalise is a per-invocation CLI with no concurrent-user surface. Revisit if/when a long-running server mode or multi-tenant hosted surface is proposed.
- **Accessibility** — not applicable. The v1 surface is a TTY CLI; WCAG and assistive-technology concerns do not apply. Revisit if/when a GUI surface (dashboard, IDE plugin UI) is added.
- **Internationalization of the CLI itself** — not applicable. CLI output is English-only by design. Revisit if/when non-English developer adoption becomes a measurable segment of the user base.

**NFR discipline reminder.** NFRs above constrain quality attributes, not capabilities. Capabilities are defined in _Functional Requirements_. Items that describe continuity or non-regression contracts over existing behavior (e.g., NFR-L1 attribution continuity vs. FR41 attribution distribution) remain in this section. (Former FR42 on `.gitignore` append during `init` was demoted to Phase 2 during Step 11 party-mode review; see _Post-MVP Features_ for the trigger.)

### Verification Ledger (NFR scope)

| Item                                                                    | Status                        | Fix owner                                                                                                                                                                               |
| ----------------------------------------------------------------------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Step 4 User Journeys referenced `apps/cli/internal/...testdata/golden/` | ✓ **Fixed in Step 11 polish** | Replaced with `internal/i18n/translationfileparser/testdata/` (repo-root, verified during Step 10).                                                                                     |
| Step 8 Risk Mitigation referenced the same wrong path                   | ✓ **Fixed in Step 11 polish** | Same replacement.                                                                                                                                                                       |
| NFR-M1 path locked correctly                                            | ✓                             | Locked to `internal/i18n/translationfileparser/testdata/liquid/`.                                                                                                                       |
| NFR-P5 baseline mechanism (committed ledger vs. CI cache)               | Deferred                      | Architecture decision in Step 11 or implementation; both options are viable under the written contract.                                                                                 |
| Step 4 journey YAMLs used aspirational action input / flag names        | ✓ **Fixed in Step 11 polish** | Maya, Jordan, Alex, Sam narratives now use the canonical `check:`, `severity-threshold:`, `fail-on-findings:`, `github-annotations:` action inputs and `--json-report <path>` CLI flag. |
| Maya `--resume` flag narrative contradicted Step 8 Phase 2 deferral     | ✓ **Fixed in Step 11 polish** | Attempt-2 scene rewritten to reflect idempotent re-run against incrementally-flushed locale files (FR17 / NFR-R2).                                                                      |
| Success-criteria row referenced killed `--liquid-coverage` flag         | ✓ **Fixed in Step 11 polish** | Row updated to reflect Option A (additive JSON `coverage[]` + TTY table).                                                                                                               |
| Exec Summary "under five minutes" claim was unscoped                    | ✓ **Fixed in Step 11 polish** | Scoped to small theme, cross-referenced to Success Criteria and NFR Performance section.                                                                                                |
| NFR-C1 `schemaVersion` introduction status was ambiguous                | ✓ **Fixed in Step 11 polish** | Added introduction note: field does not exist today, introduced at value `1` with this release.                                                                                         |
| Panic-recovery boundary for `osteele/liquid` was unspecified            | ✓ **Fixed in Step 11 polish** | Added NFR-R5 locating the `defer recover()` at the Liquid parser package layer.                                                                                                         |
| Diagnostics-emission side channel for W001 was unspecified              | ✓ **Fixed in Step 11 polish** | Added FR7b documenting that `Parser` / `ContextParser` return shape cannot carry line numbers; W001 flows via a side-channel diagnostics sink. Sink shape deferred to Open Questions.   |
| FR42 (`.gitignore` append) lacked traceability to a user need           | ✓ **Fixed in Step 11 polish** | Demoted to Phase 2 with explicit trigger. For v1, documentation covers the concern.                                                                                                     |
| NFR-C3 structural-equivalence method was under-specified                | ✓ **Fixed in Step 11 polish** | Deferred to Open Questions for Architecture with three candidate methods named.                                                                                                         |

## Open Questions for Architecture

The following decisions are deliberately deferred from the PRD to the architecture phase. Each has a concrete choice space and a contract-level constraint that the decision must satisfy. Architecture picks the method; the PRD pins the contract.

- **Diagnostics sink shape (FR7b).** The Liquid parser cannot return line-number information through the existing `Parser` / `ContextParser` interfaces (both return `map[string]string`). Findings must flow through a side channel. Candidate shapes: (a) a `chan Finding` passed at parser construction, (b) a callback function `func(Finding)` registered per-invocation, (c) an accumulator slice returned alongside the parse result via a new Liquid-specific method. Constraints: (i) the shape must be thread-safe under `runsvc`'s existing goroutine-pool concurrency model and must allow `check` (single-threaded) and `run` (worker-pool) to both drain findings without code duplication; (ii) the panic-recovery handler mandated by NFR-R5 must have access to the sink at the moment of recovery in order to convert a recovered panic into a parse-error finding — this implies the sink cannot be purely call-time-scoped (candidate (b) needs the callback stored on the parser struct or closed over by the recovery handler; candidate (c) needs the accumulator allocated before the `defer recover()` frame is established).

- **NFR-C3 equivalence method.** Structural equivalence of `check --json-report` output across parser additions needs a concrete comparison method. Candidates: (a) RFC 8785 JSON Canonicalization Scheme with byte-comparison of canonicalized output, (b) a custom Go deep-equal that ignores object key order and treats missing keys in the old schema as wildcards, (c) an existing library (`google/go-cmp` with a custom option, `nsf/jsondiff`). Constraint: the chosen method must be usable both in the golden-file regression suite (NFR-M2) and in Sam's studio-level before/after diff workflow — i.e., it must be runnable as a standalone comparison without Hyperlocalise-internal imports.

- **NFR-P5 baseline mechanism.** Benchmark regression data for the >20%-slower gate needs a durable store. Candidates: (a) committed ledger file (`benchmarks/baseline.json` updated via a scheduled main-branch workflow), (b) GitHub Actions cache keyed on branch+benchmark-name, (c) an external store (S3, GitHub Releases artifact). Constraint: the store must survive CI runner replacement and be queryable from a PR run against main-branch baseline without requiring write-access during PR execution.

- **NFR-P1/P2/P3 CI runner pool.** The gated parsing-time NFRs specify `ubuntu-latest`. Shared GitHub Actions runners exhibit 2-3× variance on Go benchmarks, which risks flapping the NFR-P5 regression gate. Candidate mitigations: (a) loosen the gate (e.g., `>2σ of rolling baseline` instead of `>20%`), (b) dedicate a self-hosted or larger runner, (c) run the gate against an averaged N-sample per PR. Constraint: whatever method is chosen must keep CI wall-clock under 10 minutes per PR and must not require infrastructure the Hyperlocalise team does not already operate.

- **TTY coverage-table sort order (FR25).** FR25 specifies a per-file Liquid coverage table in `check` TTY output when `parser: liquid` files are present. Sort order is unspecified. Candidates: (a) lexicographic by source path (matches NFR-O4 JSON determinism), (b) descending by extracted-key count (surfaces highest-coverage files first), (c) descending by dynamic-key count (surfaces W001 hotspots first). Constraint: whatever is chosen must be deterministic across runs (NFR-R3 idempotency).

- **NFR-M3 registry synchronization mechanism.** NFR-M3 says `docs/diagnostics.md` stays in sync with Go source "via a unit test that compares the documented registry against the set of codes registered at the emission site." The test shape is under-specified. Candidates: (a) parse `docs/diagnostics.md` with a Markdown library and diff against a Go-side registry, (b) generate `docs/diagnostics.md` from Go `go generate` directive and check-in-is-current in CI, (c) use embed directives and a single source of truth in Go. Constraint: contributors adding a new diagnostic code must not have to update multiple files by hand; the test must fail loudly on drift.

These questions are **not** blockers for PRD approval. They are deferred to the Architect with named candidate solutions and contract-level constraints. Architecture signs off on one candidate per question (or proposes an alternative that satisfies the constraint) before epic/story breakdown begins.
