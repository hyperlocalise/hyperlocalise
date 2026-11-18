# Guideline check: Jev classification, Luna reasoning on demand

**Status:** Accepted

## Context

Live guideline review in the CAT editor and MCP `check_guidelines` call
`openai/gpt-6-luna` on every cache miss whenever a retrieved passage applies.
The model returns structured findings (severity, quote, message, suggestion,
passage label). The server grounds those findings and meters each segment on
Autumn `guideline_checks`.

That path is too heavy for the hot loop. The editor debounce is 1.5s per
selected segment. Most checks return no findings. Luna still generates JSON
(up to 4096 completion tokens) to say so.

Vercel AI Gateway exposes TypeSafe AI's Jev (`typesafe-ai/jev`) as a decision
model: shared state in, typed boolean / choice / score answers with
probabilities out, no prose. Gateway list price is $0.042 per 1M input tokens
and no output charge. Luna on Gateway is $0.10 / $0.50 per 1M input / output
tokens. The repo already wraps Jev:

- Go: `internal/aisdk.ExperimentalEvaluate` (AI SDK evaluation protocol)
- Web: `apps/hyperlocalise-web/src/lib/ai/evaluate.ts`

Neither is wired to guideline QA.

Jev cannot quote text, write a message, or propose a replacement. Those stay
on Luna, and only when someone asks.

## Decision

Split guideline review into two calls:

1. **Classify** with Jev: is this segment clearly OK against the retrieved
   passages, or not?
2. **Explain** with Luna: for a flagged segment, write the grounded finding
   (quote, message, suggestion, cited passage) using the existing JSON schema.

Retrieval, mandatory-document budget, Valkey cache shape, Autumn
`guideline_checks` metering, and editor debounce stay where they are. The
change is which model runs on the check path, plus a new explain path.

### Surfaces

| Caller | Classify (Jev) | Explain (Luna) |
|--------|----------------|----------------|
| CAT editor | Always, on the existing debounce | On demand: **Explain** on a flagged row |
| MCP `check_guidelines` | Always | Automatic for segments Jev flags; skip Luna when every segment is OK |
| Project QA scans | Always, when Guidelines is enabled | Automatic for segments Jev flags, same as MCP |

Agents need the explanation to fix copy, so MCP does not wait for a click.
The cost win still holds: clean segments never call Luna.

### Classification contract

Keep `POST /v1/orgs/{org}/guidelines/check` and
`POST /internal/guidelines/check`. Same request body. Change the model and
the finding payload.

After retrieve, build one Jev `state` object per request:

```json
{
  "sourceLocale": "en",
  "targetLocale": "fr-FR",
  "checks": ["target"],
  "segments": [{ "id": "s1", "source": "…", "target": "…" }],
  "passages": [{ "label": "P1", "text": "…" }]
}
```

Ask one boolean per segment×passage, evaluated in parallel against that
state (Jev's native shape):

- id: `s{i}_P{j}`
- instructions: true only for a clear, attributable breach of that passage
  in a requested field of that segment. False for no match, style preference, or a rule
  that does not apply.
- criteria: true / false descriptions that repeat the grounding rule
  (verbatim quote must exist in the segment; omission may span the field).

Derive findings in Go, not in the model:

| Probability that `s{i}_P{j}` is true | Action |
|--------------------------------------|--------|
| `>= 0.75` | Emit a finding. Severity `warning`. `passageId` is that passage. Offsets span the whole field until Luna explains. Message is a canned English string, not model text. |
| `0.40 .. 0.75` | Drop. Log the band for calibration. Do not show noise in the editor. |
| `< 0.40` | No finding for that passage. |

If several passages clear 0.75, emit one finding per passage (same as
today's multi-finding result). Cap questions at the existing retrieve limit
(12). Cap Jev state at 32k tokens; shrink optional passages first. Mandatory
passages that still overflow return the existing
`guideline_check_mandatory_too_large` error.

`Result.model` becomes `typesafe-ai/jev`. Add `reasoningAvailable: true` on
classifier findings so the client can render **Explain**. Do not invent
quotes or suggestions on this path.

Cache classifier JSON under a new key prefix
(`go-svc:guideline-check:v2:…`) hashed from organization, Jev model id,
question schema version, and state. Hits skip Jev and skip billing, as
today.

### Reasoning contract

Add `POST /v1/orgs/{org}/guidelines/explain` and
`POST /internal/guidelines/explain`. Request is the check body plus optional
`passageIds`. When `passageIds` is omitted, Luna sees every retrieved
passage (current prompt). When it is set, Luna sees only those passages.

Reuse `check.Checker`'s Luna `Complete` + `groundFindings`. Default model
stays `openai/gpt-6-luna` (`GUIDELINE_CHECK_REASONING_MODEL`). Cache under
`go-svc:guideline-explain:v1:…`. Return the current finding shape
(message, suggestion, UTF-16 offsets, `passageId`).

The editor sends the flagged `passageId` so Luna does not re-judge the whole
corpus. MCP sends every passage id Jev flagged for the batch.

### Editor

`fetchEditorGuidelineChecks` keeps calling `/guidelines/check`. Classifier
findings still map through `guidelineFormatChecks`. The canned message is
enough for the existing empty-message guard.

Inline QA grows an **Explain** action on guideline rows that have no
suggestion yet. It calls `/guidelines/explain`, then replaces that row's
message, suggestion, and token highlight. **Fix** stays disabled until Luna
returns a suggestion. A Luna miss or 402 leaves the classifier row in place.

Do not block save on an unexplained classifier warning unless the project
QA policy already treats guideline as `error`. Uncertain Jev answers never
reach the editor, so they cannot block save.

### Billing

| Call | Autumn feature | When |
|------|----------------|------|
| Jev classify | `guideline_checks` (per segment) | Classifier invoked (not cache hit, not empty retrieval) |
| Luna explain | `ai_tokens` via `trackTokens` (`openai/gpt-6-luna`) | Reasoning invoked |

Explain does not increment `guideline_checks`. The quota still means "we
checked this segment." Generation spends AI credit.

Zero Data Retention on both Gateway calls (`providerOptions.gateway`).

### Configuration

| Env | Default |
|-----|---------|
| `GUIDELINE_CHECK_CLASSIFIER_MODEL` | `typesafe-ai/jev` |
| `GUIDELINE_CHECK_REASONING_MODEL` | `openai/gpt-6-luna` (preferred over `GUIDELINE_CHECK_MODEL` for generation) |

There is no `GUIDELINE_CHECK_CLASSIFIER=luna` rollback. A Jev failure is a
502 `guideline_check_failed`, same as a Luna failure today. Do not silently
fall back to Luna on the live path; that would restore the cost we are
removing.

Keep using `internal/aisdk` for Jev. Do not move classification into Next.js.
A later swap from `/v4/ai/evaluation-model` to Gateway `/v1/decisions` is
an aisdk change, not a product change.

## Alternatives considered

**Jev as a prefilter, Luna still on every "not OK".** Cheaper than today for
clean segments, but the editor would still wait on Luna for every flag,
including false positives. Rejected for CAT. Kept for MCP only, where the
caller cannot click **Explain**.

**One Jev boolean for the whole request (`compliant`).** Cheaper questions,
no passage id until Luna. The editor could not cite a document, and MCP
would send the full corpus into Luna. Rejected; per-segment×passage booleans
match Jev's independent-question model and keep grounding.

**Keep Luna for editor checks, add Jev only to project QA scans.** Rejected
for the first change: the live editor debounce was the cost that fired every
1.5s. Project scans now use the same Jev classify path, with Luna only on
flagged segments (MCP’s contract).

## Non-goals

- Scoring or pass/fail grades beyond the existing warning / error policy
- Showing retrieved passage text in the inline QA row (still the guideline
  sheet)
- Recalibrating Autumn `guideline_checks` plan limits
- Calling Jev from the web `experimentalEvaluate` helper for this feature

## Implementation order

1. **go-svc classifier.** New Jev adapter in `internal/guidelines/check`,
   thresholds, v2 cache, tests with a fake evaluate client.
2. **Explain API.** Luna path extracted from `CheckBeforeModel`; HTTP +
   `ai_tokens` tracking; MCP auto-explain on flagged segments only.
3. **Editor Explain.** Canned classifier copy, **Explain** action, replace
   row after Luna. Stories and unit tests around
   `content-editor-guideline-checks.ts`.
4. **Docs.** `internal/guidelines/README.md`,
   `docs/platform/knowledge/guidelines.mdx`, MCP tool copy.

## Verification

- Unit: threshold bands, per-passage finding derivation, empty retrieval
  skips Jev, cache key changes with passage text, grounding still drops
  Luna quotes that are not in the segment.
- HTTP: check meters `guideline_checks`; explain meters `ai_tokens` and not
  `guideline_checks`; public check does not auto-explain.
- MCP: all-OK batch never calls Luna; a mixed batch explains only flagged
  segment ids.
- Editor: debounce still hits check only; **Explain** fills message and
  optional **Fix**; abort and 402 behave as the current limit row.
