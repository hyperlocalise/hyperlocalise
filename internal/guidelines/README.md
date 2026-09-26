# Guideline retrieval

PostgreSQL owns guideline content and revision identity. `Source` loads current
canonical documents for an application-authorized scope. `Index` owns derived
passages and can be rebuilt. The turbopuffer adapter stores chunk text for BM25
and native `google/gemini-embedding-2` vectors at 1536 dimensions. Search runs
both rankings and fuses them with server-side reciprocal rank fusion. Changing
the embedding model or dimensions requires a new turbopuffer deployment prefix.

`Service.Sync` indexes the current workspace/project revisions. The turbopuffer
adapter uses deterministic revision-specific chunk IDs, replaces same/older
versions, and restricts queries to current document/revision pairs in a namespace
isolated by organization. `DeleteThrough` accepts versioned tombstones and
preserves newer revisions. Retrying an old write can leave unreachable old chunks,
which a subsequent current-version sync removes.

`Service.Retrieve` reloads canonical revisions after searching and reconstructs
passage text from canonical content. Unknown, stale, cross-scope and duplicate
hits are discarded. Search errors return `searchAvailable: false`; database errors
fail the request. Mandatory documents are returned independently of ranking.
The existing PostgreSQL workspace/project documents are treated as mandatory in
full because the schema has no separate mandatory-rule classification.

Application adoption must persist index work in the same transaction as guideline
edits. A worker can call Sync, retry on errors, and apply versioned deletion events.
The current change provides the retryable operations and opt-in go-svc API; it does
not install an outbox worker or change the existing TypeScript lexical retrieval.
For rebuilds, enumerate canonical organization/project scopes and call Sync. For
an incompatible index schema/chunker change, build under a new deployment prefix
and switch only after indexing finishes; retire the old namespaces afterward.
