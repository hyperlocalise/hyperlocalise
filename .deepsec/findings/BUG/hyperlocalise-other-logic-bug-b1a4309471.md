# [BUG] Case-sensitive glossary matches are not post-filtered

**File:** [`apps/hyperlocalise-web/src/lib/translation/load-synced-glossary-matches.ts`](https://github.com/hyperlocalise/hyperlocalise/blob/main/apps/hyperlocalise-web/src/lib/translation/load-synced-glossary-matches.ts#L45-L64) (lines 45, 58, 64)
**Project:** hyperlocalise
**Severity:** BUG  •  **Confidence:** high  •  **Slug:** `other-logic-bug`

## Owners

**Suggested assignee:** `cungminh2710@gmail.com` _(via last-committer)_

## Finding

The full-text search uses the generated search vector, which lowercases terms, then returns matches directly. A glossary term marked caseSensitive can therefore be returned for source text with different casing, because lines 45 and 58 use to_tsquery/ts_rank and there is no source-term post-filter before normalization at line 64. This can inject incorrect glossary constraints into translation context.

## Recommendation

After fetching candidates, filter matches with the same sourceContainsTerm-style check used elsewhere, respecting entry.caseSensitive and entry.sourceTerm before returning normalized matches.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-05-23)
