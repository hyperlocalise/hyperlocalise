# Multi-locale file translation in one `hl run`

## Problem

`fileTranslationJobWorkflow` runs `hl run` once per target locale. The CLI already plans and executes all `locales.targets` in one invocation. Prefill is the blocker: `--prefilled-entries` is a flat `map[string]string` scoped to a single `--prefilled-target-path`, so the same entry key cannot carry different values for FR and DE.

## Decision

1. Extend the CLI so `--prefilled-entries` accepts a locale-keyed nested JSON object.
2. Change the file translation workflow to write one multi-locale config and one `hl run` for all targets.
3. Validate glossary terms after the run; retry only failed locales.

## Prefill contract

Detection after parsing `--prefilled-entries`:

- Every top-level value is a string → legacy flat mode (still requires `--prefilled-target-path`).
- Every top-level value is a non-null object → locale-keyed mode (`--prefilled-target-path` must be omitted).
- Mixed shapes → error.

Locale-keyed apply (after planning + lock filter):

- For each `locale → entries`, stage matching `EntryKey`s onto planned tasks with that `TargetLocale`.
- Unknown locales in the file → warning; error if the file is non-empty and no entries apply.
- Empty locale maps are omitted by the workflow writer.

Example:

```json
{
  "fr-FR": { "hello": "Bonjour" },
  "de-DE": { "hello": "Hallo" }
}
```

## Workflow

```text
extract source entries (once)
assemble prefill per locale → nested JSON
write config with locales.targets + to: name-{{target}}.ext
hl run --prefilled-entries (no --locale, no --prefilled-target-path)
per locale: read output, glossary validate, persist
retry: hl run --locale <failed...> with feedback
```

Glossary terms for all locales stay in the system prompt (already tagged by locale).

`provider-agent-file-translate.ts` stays on the per-locale path for now; flat flags remain valid.

## Errors

- Non-zero batch `hl run`: salvage any locale outputs already on disk, retry missing locales individually, persist successes, then fail only for locales still missing.
- Glossary retry runs **per failed locale** with that locale's feedback only (no cross-locale contamination).
- Single-locale jobs use the same multi-locale path with one target.

## Testing

- CLI: flat vs nested parse; reject mixed; nested applies across locales; nested + `--prefilled-target-path` errors; unknown locale warns.
- Web: multi-target config with `{{target}}`; prefill assembly shape; retry selection for failed locales.
