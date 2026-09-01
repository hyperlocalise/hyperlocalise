# CAT spellcheck rollout and rollback

## Date

2026-09-01

## Context

CAT already posts to `/api/go-svc/v1/validate/segment` for format, length, and
QA checks. `go-svc` can also spell-check requested locales with Hunspell when
built with `cgo_hunspell`. The `go_svc` container service and `/api/go-svc/*`
rewrite are already in [`vercel.json`](../../vercel.json). This record is the
rollout and rollback procedure for turning CAT spelling on and for turning it
off independently of the rest of segment validation.

Related: [CAT segment validation service
integration](./2026-07-05-cat-segment-validation-service-design.md), [CLI spell
check](./2026-08-28-cli-spellcheck-design.md).

## Decision

Keep spelling behind a web compile-time flag that is independent of all CAT
segment validation. Rollback spelling first; disable all segment validation
only if the problem is not spelling.

### Rollout order

This order is already in place. Follow it again only if a future change turns
the flags off.

1. Confirm `vercel.json` defines the `go_svc` container (`Dockerfile.vercel`)
   and the `/api/go-svc/*` rewrite.
2. Build and deploy that image (`make docker-build-go-svc`, then the usual
   deploy).
3. Confirm `GET /api/go-svc/health` returns `{"status":"ok"}`.
4. Set both flags in
   [`project-file-content-editor-validation.ts`](../../apps/hyperlocalise-web/src/components/content-editor/project-file/project-file-content-editor-validation.ts)
   to `true` and deploy web:
   - `CAT_SEGMENT_VALIDATION_ENABLED` — all CAT segment validation.
   - `CAT_SEGMENT_SPELLING_ENABLED` — include `"spelling"` in `modes` when the
     target locale is a BCP 47 tag.

### Toggle

`CAT_SEGMENT_SPELLING_ENABLED` is the supported deployment toggle for
spelling. Set it to `false` and redeploy web. CAT keeps posting format and QA
modes; it stops requesting spelling. `CAT_SEGMENT_VALIDATION_ENABLED` stays
`true`.

Do not treat an invalid `HUNSPELL_DICT_DIR`, a missing dictionary, or a
non-`cgo_hunspell` build as a rollback switch. Those are existing
provider-unavailable behaviours: the service still starts, format and QA checks
still run, and the response lists `"spelling"` in `skippedModes`.

### Rollback order

1. Set `CAT_SEGMENT_SPELLING_ENABLED = false` and redeploy web. Spelling stops;
   other segment checks continue.
2. If the fault is not spelling, set `CAT_SEGMENT_VALIDATION_ENABLED = false`
   and redeploy web. CAT stops calling go-svc for segment validation.

### Observability

Each completed spelling check emits one `spellcheck: request completed` log
from `composeSegmentValidation`. Canceled or deadline-exceeded checks do not
emit this completion log. Fields:

| Field | Meaning |
| --- | --- |
| `spelling_duration_ms` | Time spent in `checkSpelling` |
| `spelling_locale_skipped` | `true` when the locale has no dictionary or the provider is unavailable |
| `spelling_provider_error_count` | `0` or `1`; unexpected provider errors |
| `spelling_warning_count` | Spelling issues found before the per-response cap |

The log takes only duration, booleans, and counts. The spelling log must not
include source text, target text, extracted words, or the submitted source file
path. The generic request log records HTTP method, route path, status,
duration, and an optional request id.

### Smoke test

After deploy, as a signed-in user, `POST /api/go-svc/v1/validate/segment` with
the `wos-session` cookie.

- Supported locale (`en-US`): body includes `"modes":["spelling"]` and a
  misspelling from the dictionary. Expect HTTP 200, a spelling warning in
  `checks`, and no `"spelling"` in `skippedModes`.
- Unsupported locale (`ja-JP`): expect HTTP 200, format/QA checks present, and
  `"spelling"` in `skippedModes`.
- Logs for that request contain `spelling_duration_ms` and do not contain the
  segment text.
