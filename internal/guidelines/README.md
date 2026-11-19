# Guideline retrieval

PostgreSQL owns guideline content and revision identity. `Source` loads current
canonical documents for an application-authorized scope. `Index` owns derived
passages and can be rebuilt. The turbopuffer adapter stores chunk text for BM25
and native `google/gemini-embedding-2` vectors at 1536 dimensions. Search runs
both rankings and fuses them with server-side reciprocal rank fusion. Changing
the embedding model or dimensions requires a new turbopuffer deployment prefix.

## Documents

The Postgres source returns ready rows in `guideline_documents` (`doc:<id>`).
Only `ready` rows with extracted content are returned. A row with
`mandatory = true` is the product switch **Always apply**: the document is
returned in full and must fit in the check prompt. Otherwise only its search
hits are used, and those hits can be dropped when the prompt is full. A row
with a locale applies only when `Scope.Locale` matches; a null locale
applies to every locale.

Project scopes include assigned org-wide documents as well as the
project's own. Org-wide uploads (`project_id IS NULL`) check
`guideline_document_projects`: a document applies to a project only when
listed, so an unassigned org-wide document applies to no project.
Project-owned uploads skip assignment. An empty project scope keeps all
org-scoped content.

## Indexing

`Service.Sync` re-indexes the current revisions in a scope. The turbopuffer
adapter uses deterministic revision-specific chunk IDs, replaces same/older
versions, and restricts queries to current document/revision pairs in a namespace
isolated by organization. `Service.Delete` writes a versioned tombstone that
preserves newer revisions. Retrying an old write can leave unreachable old chunks,
which a subsequent current-version sync removes.

go-svc writes the row first and then publishes an `ingest.Message` to SQS.
`apps/guideline-ingest-lambda` consumes it:

- `extract_index` reads the stored object, extracts text with
  `internal/textextract`, marks the row `ready` or `failed`, and indexes it.
  Every state change is guarded by `revision_id`, so a stale message is a no-op.
- `sync` re-indexes a scope after adoption, rebuilds, or a missed document write.
- `delete` removes a document's chunks through its tombstone version.

A lost publish is recovered by the `/internal/guidelines/sweep` route, which a
Vercel cron calls every 15 minutes. It republishes rows that have been
`processing` too long, `ready` rows whose index lags the current revision, and
`failed` rows with `guideline_ingest_enqueue_failed` after a transient SQS error.

For rebuilds, enumerate canonical organization/project scopes and call Sync. For
an incompatible index schema/chunker change, build under a new deployment prefix
and switch only after indexing finishes; retire the old namespaces afterward.

## Retrieval

`Service.Retrieve` reloads canonical revisions after searching and reconstructs
passage text from canonical content. Unknown, stale, cross-scope and duplicate
hits are discarded. Search errors return `searchAvailable: false`; database errors
fail the request. Mandatory documents are returned independently of ranking. A
Service without an index returns mandatory documents only.

`WithReranker` fetches up to 32 canonical hits and reorders them before trimming
to the requested limit. go-svc uses `voyage/rerank-3-lite` through AI Gateway
(`internal/rerank`) when `AI_GATEWAY_API_KEY` is set. A rerank failure keeps the
index's RRF order.

## Checks

`check.Checker` retrieves once per request, splits mandatory documents into
chunks, and labels every passage `P1..Pn`. Classification uses Jev
(`typesafe-ai/jev`) through `Classifier.Classify`. One boolean question per
segment×passage (`s{i}_P{j}`) returns P(true). Findings are derived in Go:

- `>= 0.75`: emit a warning that spans the whole field, with canned copy and
  `reasoningAvailable: true`
- `0.40 .. 0.75`: drop and log the band
- `< 0.40`: clean

Jev does not quote text or write a suggestion. `Explain` runs Luna
(`openai/gpt-6-luna`) with the existing JSON schema: quote, message, suggestion,
and a passage label. The server maps the label back to a chunk ID and computes
UTF-16 offsets from the quote. Findings for unknown segments, unrequested
fields, uncited passages, or quotes missing from the text are dropped. When no
passages apply, neither model is called.

Classifier JSON is cached under `go-svc:guideline-check:v2:` for 24 hours.
Explain JSON is cached under `go-svc:guideline-explain:v1:`. The key includes
the organization plus a hash of the model, schema version, and prompt or state.
A hit does not call the model and is not billed.

go-svc serves `POST /v1/orgs/{org}/guidelines/check` and
`POST /v1/orgs/{org}/guidelines/explain` for signed-in users, plus
`POST /internal/guidelines/check` and `POST /internal/guidelines/explain` for
trusted server callers such as MCP and project QA scans. Check meters each
segment on Autumn `guideline_checks`. Explain meters Luna usage on `ai_tokens`.
The internal check route explains flagged segments automatically unless the
request sets `autoExplain` to false. Project QA scans set that flag and explain
a finding when someone chooses **Explain**. A Luna failure keeps the classifier
findings. Public CAT check does not auto-explain. Project scans batch up to 50
segments per locale, persist findings, and leave older guideline issues open if
classify hits the allowance or Knowledge is off.

Models are configured with `AI_GATEWAY_API_KEY`, optionally
`AI_GATEWAY_BASE_URL` / `AI_GATEWAY_EVALUATE_BASE_URL`,
`GUIDELINE_CHECK_CLASSIFIER_MODEL` (default `typesafe-ai/jev`), and
`GUIDELINE_CHECK_REASONING_MODEL` (falls back to `GUIDELINE_CHECK_MODEL`, then
`openai/gpt-6-luna`). Without the gateway key the routes return 503.

Translation prompts get guideline documents from `POST /internal/guidelines/retrieve`,
which uses the same `Service.Retrieve` path.
