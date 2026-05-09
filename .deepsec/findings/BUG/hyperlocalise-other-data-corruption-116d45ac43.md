# [BUG] Translation output trimming corrupts whitespace-significant strings

**File:** [`apps/hyperlocalise-web/src/lib/translation/string-job-executor.ts`](https://github.com/hyperlocalise/hyperlocalise/blob/main/apps/hyperlocalise-web/src/lib/translation/string-job-executor.ts#L18-L185) (lines 18, 19, 181, 185)
**Project:** hyperlocalise
**Severity:** BUG  •  **Confidence:** high  •  **Slug:** `other-data-corruption`

## Owners

**Suggested assignee:** `cungminh2710@gmail.com` _(via last-committer)_

## Finding

The structured output schema trims every returned translation string before persistence. Localization strings often intentionally contain leading or trailing spaces, yet the system prompt explicitly asks the model to preserve whitespace. This silently changes valid translated content and can break UI copy or formatting.

## Recommendation

Remove .trim() from translated output validation and validate non-empty content without mutating the model result. If needed, reject only strings that are entirely whitespace while preserving original text.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-05-04)
