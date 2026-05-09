# [MEDIUM] Unbounded full-text tsquery construction can exhaust DB/worker resources

**File:** [`apps/hyperlocalise-web/src/lib/translation/translation-job-queued-function.ts`](https://github.com/hyperlocalise/hyperlocalise/blob/main/apps/hyperlocalise-web/src/lib/translation/translation-job-queued-function.ts#L91-L232) (lines 91, 97, 145, 157, 221, 232)
**Project:** hyperlocalise
**Severity:** MEDIUM  •  **Confidence:** medium  •  **Slug:** `expensive-api-abuse`

## Owners

**Suggested assignee:** `cungminh2710@gmail.com` _(via last-committer)_

## Finding

This is not SQL injection: Drizzle binds the interpolated tsQuery value safely. The issue is availability. sourceText is user-controlled through translation job creation and can be up to 100,000 characters; buildTsQuery turns every whitespace token into a prefix tsquery term, then loadGlossaryTermsForContext and loadMemoryMatchesForContext pass that large generated query into to_tsquery for glossary and memory lookups. There is no term cap, tsquery-safe parser, or fallback when Postgres rejects or struggles with the query. A caller with jobs:write access can enqueue large or tsquery-hostile source text to consume DB CPU or repeatedly fail workers before translation begins.

## Recommendation

Use plainto_tsquery or websearch_to_tsquery where possible, cap the number of terms used for context retrieval, catch full-text query errors and skip context lookup on failure, and enforce API/queue quotas for large jobs.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-05-06)
