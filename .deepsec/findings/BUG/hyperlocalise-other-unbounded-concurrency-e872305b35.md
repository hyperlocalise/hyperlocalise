# [BUG] Glossary sync fans out unbounded provider API calls

**File:** [`apps/hyperlocalise-web/src/lib/providers/adapters/crowdin/crowdin-glossary-fetcher.ts`](https://github.com/hyperlocalise/hyperlocalise/blob/main/apps/hyperlocalise-web/src/lib/providers/adapters/crowdin/crowdin-glossary-fetcher.ts#L43-L46) (lines 43, 46)
**Project:** hyperlocalise
**Severity:** BUG  •  **Confidence:** high  •  **Slug:** `other-unbounded-concurrency`

## Owners

**Suggested assignee:** `cungminh2710@gmail.com` _(via last-committer)_

## Finding

fetchCrowdinGlossaries() uses Promise.all(scoped.map(...)) and calls client.listGlossaryTerms() once per scoped glossary. A large Crowdin account can therefore trigger hundreds or thousands of concurrent outbound requests, which can exhaust sockets, hit provider rate limits, or make the sync run fail noisily. This is not a direct security issue, but it is a reliability risk on large provider workspaces.

## Recommendation

Process glossaries with bounded concurrency, for example using the repo's mapWithConcurrency helper, and consider preserving partial results when individual glossary term fetches fail.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-05-31)
