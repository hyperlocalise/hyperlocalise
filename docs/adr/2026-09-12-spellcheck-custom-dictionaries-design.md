# Spellcheck custom dictionaries

## Date

2026-09-12

## Status

Accepted.

## Context

`go-svc` spell-checks CAT segments with Hunspell. The CLI spell-check ADR
([2026-08-28](./2026-08-28-cli-spellcheck-design.md)) chose `hunspell -a` for
`hl check` and left custom word lists out of scope. Brand names and product
terms still flag as misspellings in CAT and will do the same in CI once the
CLI check lands.

Crowdin already separates this from terminology: a **dictionary** is a list of
words the spell checker should skip. Hyperlocalise already has org-level
glossaries and translation memories that attach to many projects. Dictionaries
need the same library-and-attach shape, and they must reach three runtimes:

| Runtime | How spelling runs today | Constraint |
|---|---|---|
| `go-svc` | CGO Hunspell, one process-global handle per locale | No database. Shared across every org. `Dictionary` is not safe for concurrent use without the per-locale mutex. |
| CLI | Not implemented yet; ADR is `hunspell -a`, `CGO_ENABLED=0`, offline | Reads local files. No credentials in CI. |
| Sandbox | Pinned `.aff`/`.dic` files baked into the image | Image is shared. Per-org lists must not be baked in. |

`Hunspell_add` on the go-svc handles would mutate a process-wide dictionary
that every tenant shares. Cloning Hunspell dictionaries per project repeats
the load cost the sidecar exists to amortize (`pt_BR` is ~274 ms).

Glossaries are the wrong store. They are bilingual preferred or forbidden
terms, often multi-word, and they already feed `hl run` through the system
prompt. Hunspell tokenizes single words.

## Decision

Treat a custom dictionary as an **allow-list overlay**. Hunspell still
decides whether a token is in the pinned locale dictionary. Go then drops
any flagged word that appears in the resolved allow-list for that locale.
The overlay lives in `internal/i18n/spellcheck` and is the only place CLI,
sandbox `hl check`, and go-svc apply custom words.

Do not call `Hunspell_add`. Do not put dictionary words in LLM prompts. Do
not reuse `glossaries` / `glossary_terms`.

### Libraries and attachment

A dictionary is an **organization library**, like a glossary or memory.

```text
organizations
  └── spellcheck_dictionaries          org library (name, status, version)
        └── spellcheck_dictionary_words  (locale, word)
projects
  └── project_spellcheck_dictionaries  attach library to project + priority
```

| Table | Role |
|---|---|
| `spellcheck_dictionaries` | Org-owned library: name, description, `asset_status`, `words_version`, audit columns |
| `spellcheck_dictionary_words` | One row per `(dictionary_id, locale, word_normalized)` |
| `project_spellcheck_dictionaries` | Attach a library to a project. Unique `(project_id, dictionary_id)`. `priority` matches `project_glossaries` (lower loads first) |

Resolved words for `project P` and locale `L` are the union of words with
locale `L` from every **active** library attached to `P`. When the same
normalized word appears in two libraries, the lower `priority` row keeps its
original casing.

v1 libraries are org-controlled only. Team-controlled dictionaries and live
Crowdin dictionary sync are out of scope. Crowdin dictionaries are
project-scoped; ours are org-scoped. A later importer can map them.

### Word rules

A stored word is one Hunspell token, not a phrase.

- Trim, NFC-normalize, reject empty and whitespace.
- Length 1–64.
- No multi-word strings. Hunspell never sees those as one token.
- Store original casing; match the overlay **case-insensitively**.
- Cap 20,000 words per library.
- Cap 5,000 unique resolved words per project locale when sending to go-svc
  or writing CLI files. Sort the resolved set so truncation is stable.

`words_version` increments on the library when its words change. The
resolved set for CAT and sync is keyed by
`(project_id, locale, hash(attached library ids + versions))`.

### Shared overlay

```go
// internal/i18n/spellcheck
func Accept(word string, accepted AcceptedWords) bool
func FilterIssues[T ~struct{ Word string }](issues []T, accepted AcceptedWords) []T
```

`AcceptedWords` is a case-folded set. Callers build it from files (CLI,
sandbox) or from a request field (go-svc). Hunspell runs first. The overlay
runs before suggestion generation when the implementation can skip that
work, and always before issues are returned.

### go-svc

`POST /v1/validate/segment` gains an optional field:

```json
{
  "targetLocale": "en-US",
  "modes": ["spelling"],
  "acceptedWords": ["Hyperlocalise", "AuthKit"]
}
```

go-svc stays stateless. It does not load Postgres or call the web app. CAT
loads the resolved list once (SWR) from the web API and sends it on each
validate. Hundreds of brand names are a few kilobytes; that is cheaper than
a Hunspell suggestion (~5.7 ms per misspelling).

Do not add `projectId` to go-svc for this. The browser already has the
project context.

### Web

**Capabilities.** Add `dictionaries:read` and `dictionaries:write`. Map them
like memories: every role can read; `admin` and `localization_manager` can
write. Translators do not mutate org libraries in v1. Team contribution
(the glossary exception) waits for a later control-level design.

**Routes.**

| Method | Path | Purpose |
|---|---|---|
| CRUD | `/api/orgs/:slug/dictionaries` | List, create, update, archive libraries |
| Words | `/api/orgs/:slug/dictionaries/:id/words` | Add, remove, list, import, export |
| Attach | `/api/orgs/:slug/projects/:id/dictionaries` | Attach, detach, reorder |
| Resolve | `GET .../projects/:id/dictionaries/resolved?locale=` | Union CAT and sandbox consume |

**UI.** Workspace **Dictionaries** for library CRUD and word editing.
Project settings attach and order libraries. Native CAT spelling warnings
offer **Add to dictionary** when the caller has `dictionaries:write` and at
least one active library is attached. If several are attached, the picker
defaults to the lowest priority.

Import and export are UTF-8 text, one word per line. That is the same
format the CLI and sandbox write.

### CLI

Once `hl check` grows `spelling`:

```yaml
# i18n.yml
spellcheck:
  dictionary_dir: .hyperlocalise/dictionaries
```

`hl sync pull` writes the **resolved** union, not one file per library:

```text
.hyperlocalise/dictionaries/en-US.txt
.hyperlocalise/dictionaries/de-DE.txt
```

`--dictionary-dir` overrides the config path so the sandbox does not rewrite
`i18n.yml`. Missing files mean an empty overlay; spelling still runs against
the pinned Hunspell dictionary. Offline CI keeps working without
credentials.

### Sandbox

Keep the 20 pinned Hunspell dictionaries in the image. At job start, write
resolved `.txt` files under `.hl-sandbox-dictionaries/` and pass
`--dictionary-dir`. Same pattern as `.hl-sandbox-i18n.yml` and
`--prefilled-entries`.

File translation today runs `hl run`, not `hl check`. Dictionary files only
matter when the sandbox actually spell-checks (agent `hl check`, or a later
post-run QA step). CAT does not go through the sandbox.

```text
Web (org libraries → project attachments → resolved union)
  ├─ CAT     SWR resolved list → go-svc acceptedWords → overlay
  ├─ sync    .hyperlocalise/dictionaries/{locale}.txt → hl check
  └─ sandbox writeFiles → --dictionary-dir → hl check
```

## Alternatives considered

### Mutate Hunspell (`Hunspell_add` / `-p`)

Rejected. go-svc would add and remove words on a shared in-memory
dictionary. That races across tenants even with the per-locale mutex, and
the CLI subprocess path would still need a file-based personal dictionary.
The overlay keeps both runtimes identical.

### Reuse glossary tables

Rejected. Glossaries constrain translation. Dictionaries suppress
spellcheck false positives. Mixing them would accept forbidden terms, drop
multi-word phrases, and couple Hunspell to concept review state. A later
option can seed dictionary words from glossary target terms.

### Project-only lists (Crowdin-shaped)

Rejected. The product already treats glossaries and memories as org
libraries that attach to many projects. Brand names belong to the workspace,
not one project.

### Post-filter only in the web app

Rejected. That would leave `hl check` and go-svc disagreeing unless both
call the same Go helper. The overlay belongs in `internal/i18n/spellcheck`.

## Consequences

CAT spelling warnings stop firing on attached brand names without reloading
Hunspell. `hl check` can use the same list from files after `hl sync pull`.
go-svc request bodies grow by the resolved word list; the 5,000-word cap
keeps that bounded.

v1 does not let translators add words. Org libraries stay manager-curated,
same as org glossaries. Team dictionaries, Crowdin live sync, and “also
accept glossary target terms” stay follow-ups.

The CLI spelling check still needs its own implementation. This ADR only
defines how custom words reach that check.

## Validation

This record settles the approach. Implementation should add:

1. Overlay unit tests in `internal/i18n/spellcheck` (case folding, union,
   empty set, cap).
2. go-svc handler tests that `acceptedWords` drops a Hunspell misspelling
   and does not request suggestions for those tokens.
3. Web route tests for library CRUD, attach uniqueness, and resolved union
   order.
4. CLI tests that `--dictionary-dir` and `spellcheck.dictionary_dir` load
   `{locale}.txt` once the spelling check exists.
)
