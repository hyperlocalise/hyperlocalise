# Guideline retrieval

PostgreSQL owns guideline content and revision identity. `Source` loads current
canonical documents for an application-authorized scope. `Index` owns derived
passages and can be rebuilt. The turbopuffer adapter stores chunk text for BM25
and native `google/gemini-embedding-2` vectors at 1536 dimensions. Search runs
both rankings and fuses them with server-side reciprocal rank fusion. Changing
the embedding model or dimensions requires a new turbopuffer deployment prefix.

## Documents

The Postgres source returns two kinds of document:

- The workspace and project knowledge memory notes. They are always mandatory
  and apply to every locale.
- Uploaded rows in `guideline_documents` (`doc:<id>`). Only `ready` rows with
  extracted content are returned. A row with `mandatory = true` is returned in
  full; otherwise only its search hits are used. A row with a locale applies only
  when `Scope.Locale` matches; a null locale applies to every locale.

Project scopes include workspace documents as well as the project's own.

## Indexing

`Service.Sync` indexes the current workspace/project revisions. The turbopuffer
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
- `sync` re-indexes a scope after a knowledge memory note commit.
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

## Checks

`check.Checker` grounds an LLM review in retrieved guidelines. It retrieves once
per request, splits mandatory documents into chunks, labels every passage `P1..Pn`,
and asks the model for findings under a strict JSON schema. The model returns a
quote and a passage label; the server maps the label back to a chunk ID and
computes UTF-16 offsets from the quote. Findings for unknown segments, unrequested
fields, uncited passages, or quotes missing from the text are dropped. When no
passages apply the model is not called.

go-svc serves `POST /v1/orgs/{org}/guidelines/check` for signed-in users and
`POST /internal/guidelines/check` for trusted server callers such as MCP. Both
meter usage per segment on the Autumn `guideline_checks` feature. The model is
configured with `GUIDELINE_CHECK_MODEL`, `AI_GATEWAY_API_KEY`, and optionally
`AI_GATEWAY_BASE_URL`; without them the routes return 503.
