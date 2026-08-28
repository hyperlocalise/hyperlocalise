# ADR: Cursor-paginated TM entry search

## Status

Accepted

## Date

2026-08-28

## Context

`GET /api/orgs/:organizationSlug/translation-memories/:memoryId/entries` returned the first page of a memory with offset pagination and locale filters only. Client-side filtering cannot produce complete results for large memories. HL-642 asks for a tenant-safe management search contract: cursor pagination, composable filters, and documented query semantics.

This endpoint is management search, not concordance. It does not replace runtime TM matching.

## Decision

Extend the existing entry list route. Keep the resource-keyed envelope. Add a signed cursor, server-side search, and AND-composed filters. Authorize the memory before the query runs.

### Request

`GET /api/orgs/:organizationSlug/translation-memories/:memoryId/entries`

| Query | Meaning |
| --- | --- |
| `limit` | Page size. Default 50. Minimum 1. Maximum 100. |
| `cursor` | Opaque cursor from a previous page. |
| `search` | Management search over source text, target text, entry id, `externalKey`, and string metadata. |
| `sourceLocale`, `targetLocale` | Exact locale filters. |
| `reviewStatus` | `approved`, `pending`, or `rejected`. |
| `origin` | Exact `provenance` match (`manual`, `import`, `sync`, and similar). |
| `provider` | Matches `provenance` or `metadata.provider`. |
| `createdByUserId` | Creator user id. |
| `modifiedFrom`, `modifiedTo` | Inclusive `updated_at` range. ISO-8601. |
| `importBatchId` | Entries written by one import request. |
| `sort` | `created_at` (default) or `updated_at`. |
| `sortDir` | `desc` (default) or `asc`. |
| `offset` | Ignored. Kept so existing first-page clients keep type-checking. |

All supplied filters AND together with search.

### Search normalization

1. Trim the query and cap it at 200 characters.
2. If the query is a UUID, include an exact `id` match.
3. Include an exact `externalKey` match.
4. Build a `simple` prefix `tsquery`: strip operator characters, split on whitespace, keep 50 terms, append `:*`, join with `&`.
5. Match that query against `management_search_vector`.

`management_search_vector` weights source text and `externalKey` as A, target text as B, and `jsonb_to_tsvector` string metadata (including `context`) as C. Concordance continues to use the original `search_vector`.

This is lexical prefix search, not fuzzy or linguistic matching.

### Sort and tie-break

Pages use keyset pagination on `(sort column, id)` in the requested direction. `id` is the deterministic tie-breaker when primary sort values are equal. Default order is `created_at DESC, id DESC`, which matches the previous first page.

### Cursor

A cursor is `base64url(json).hmac`. The payload stores sort, direction, sort value, entry id, issue time, and a hash of the filter set.

The sort value is the Postgres `timestamptz` rendered in UTC with microsecond precision (`YYYY-MM-DDTHH:MM:SS.ffffffZ`). Keyset comparison casts that string back to `timestamptz` in SQL. JavaScript `Date` is not used for cursor encode or compare: node-postgres truncates timestamps to milliseconds, which drops or repeats rows when many entries share a `defaultNow()` value that is not millisecond-aligned.

The server rejects the cursor with `{ error: "invalid_cursor" }` when:

- the string is malformed
- the HMAC does not match (tamper)
- the cursor is older than 24 hours
- the caller changed search, filters, or sort

Clients must start a new first page after those errors. Inserts that sort after the cursor do not appear on later pages of that walk. They appear on a fresh first page.

### Response

```json
{
  "memoryEntries": [],
  "nextCursor": "…",
  "total": 0,
  "pagination": { "limit": 50, "returned": 0, "hasMore": false }
}
```

`total` counts rows that match the filters, not the current page. `nextCursor` is null on the last page.

Entry records now include `createdByUserId` and `importBatchId`. Import responses also return `importBatchId`. Import writes stamp `provenance=import`, the caller, and that batch id.

### Authorization and logging

`canAccessMemory` runs before any entry query. Callers without access receive `memory_not_found`. Team-scoped members only see memories attached to a project they can access. Results never leave that memory, so they cannot cross project or workspace boundaries.

Logs use memory id, counts, and status codes. They do not include source text, target text, search strings, or metadata.

### Indexes

`memory_entries` gains `created_by_user_id`, `import_batch_id`, `management_search_vector`, and btree indexes for `(memory_id, created_at, id)`, `(memory_id, updated_at, id)`, review status, provenance, creator, and import batch. The management search vector uses a GIN index.

### Latency target

Indexed first-page and filter paths on a representative 2,000–10,000 entry memory should stay near 200ms locally. The automated benchmark asserts a 1s CI budget so shared runners do not flake.

## Consequences

The current detail page still requests the first 50 entries and keeps working. Explorer UI, editing, and review transitions stay out of scope. Agent list tools still use offset pagination.
