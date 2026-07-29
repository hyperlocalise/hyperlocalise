# Session limit for `hl run` translations

## Problem

Large file translation jobs can plan thousands of keys across locales. A single `hl run` in `fileTranslationJobWorkflow` can exceed sandbox/workflow timeouts. Users also wait until the whole run finishes before project translations appear.

## Decision

1. Add `hl run --max-translations N` to cap how many executable translation tasks run in one invocation (`0` = unlimited).
2. After planning, lock filtering, and prefill, truncate the executable queue to `N` in plan order. Deferred tasks stay unlocked so a later run without `--force` continues.
3. Report `deferredByLimit` (stdout + JSON summary) so callers know whether another page is needed.
4. Update `fileTranslationJobWorkflow` to loop `hl run --max-translations 1000`, persist translations after each successful page, and stop when `deferredByLimit` is `0`.

## CLI contract

| Flag | Default | Meaning |
|------|---------|---------|
| `--max-translations` | `0` | Max executable tasks this session. `0` disables the cap. Negative values error. |

Behavior:

- Cap applies to **executable** tasks only (after lock skip + prefill reuse), not planned total.
- Truncation keeps the first `N` tasks in deterministic plan order (sorted groups/buckets/keys/locales).
- Partial target files still flush: existing flush already merges staged entries into the current target.
- Exit `0` when the page succeeds even if work remains (`deferredByLimit > 0`).
- `--force` still ignores lock skips for the planned set, then the cap applies. Pagination must omit `--force` on later pages or the same first `N` keys repeat.

Report additions:

- `deferredByLimit` — executable tasks not run because of the cap
- stdout line: `deferred_by_limit=%d` (always printed; `0` when uncapped or fully drained)

## Workflow

```text
page = 0
loop:
  hl run --max-translations 1000 [--force only on page 0]
  if exit != 0 → existing salvage / per-locale retry (also capped)
  for each locale with readable output:
    extract entries → persist TM + project translations (incremental)
  if deferredByLimit == 0 → break
  page++
glossary validate / retry (unchanged, per failed locale)
complete job
```

Notes:

- Fresh sandbox has an empty lock; page 0 may use `--force` for a clean slate. Later pages omit `--force` so completed lock entries are skipped.
- Same-sandbox pagination relies on the lockfile only — no prefill mutation between pages.
- If the sandbox is recreated mid-job, the lockfile is lost; that path may redo earlier keys (existing recreate limitation).
- Incremental persist is best-effort (same as today's end-of-job persist). Failures log and continue.
- Glossary retry keeps `--force` on page 0 for the failed locale, then pages without `--force` until `deferredByLimit` is 0 (same session cap).

## Errors

- `--max-translations < 0` → CLI validation error
- Page failure → existing salvage/retry; do not advance the pagination cursor past failed work
- Sandbox disconnect → existing same-sandbox resume without `--force`, then recreate

## Testing

- CLI: flag plumbing; truncate executable; deferred count; next run without force continues; force + limit redoes the head of the queue
- Web: pagination loop stops when deferred is 0; page 0 uses force, later pages do not; persist called between pages
