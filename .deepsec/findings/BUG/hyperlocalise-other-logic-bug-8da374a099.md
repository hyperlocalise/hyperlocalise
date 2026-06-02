# [BUG] TMS locale replacement corrupts path segments

**File:** [`apps/hyperlocalise-web/src/lib/agents/i18n-setup/tms-config-hints.ts`](https://github.com/hyperlocalise/hyperlocalise/blob/main/apps/hyperlocalise-web/src/lib/agents/i18n-setup/tms-config-hints.ts#L81-L328) (lines 81, 87, 135, 149, 290, 328)
**Project:** hyperlocalise
**Severity:** BUG  •  **Confidence:** high  •  **Slug:** `other-logic-bug`

## Owners

**Suggested assignee:** `cungminh2710@gmail.com` _(via last-committer)_

## Finding

replaceLocaleToken uses replaceAll for the locale token across the whole path. For a common source locale like en, a path such as content/en.json becomes cont{{source}}t/{{source}}.json because en inside content is replaced too. Crowdin and Phrase mapping conversion both call this helper, so generated i18n mappings can be invalid for legitimate paths.

## Recommendation

Replace locale tokens only when they appear as a complete filename stem or path segment, using segment-aware parsing instead of global string replacement.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-05-30)
