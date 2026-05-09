# [BUG] Code highlighting cache can render the wrong snippet

**File:** [`apps/hyperlocalise-web/src/components/ai-elements/code-block.tsx`](https://github.com/hyperlocalise/hyperlocalise/blob/main/apps/hyperlocalise-web/src/components/ai-elements/code-block.tsx#L137-L221) (lines 137, 138, 139, 140, 186, 187, 188, 220, 221)
**Project:** hyperlocalise
**Severity:** BUG  •  **Confidence:** high  •  **Slug:** `other-cache-collision`

## Owners

**Suggested assignee:** `cungminh2710@gmail.com` _(via last-committer)_

## Finding

The token cache key only includes the language, total length, first 100 characters, and last 100 characters of the code. Two different snippets with the same length, prefix, and suffix but different middle content will share a cache entry. Because cached TokenizedCode includes the original token.content, the second CodeBlock can render the first snippet's content instead of its own. This is not a direct cross-user security issue because the cache is client-local, but it can display stale or sensitive prior code within the same browser session.

## Recommendation

Use a collision-resistant key for the full code content, such as the full code string itself for this in-memory cache or a hash of the complete code plus language.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-05-04)
