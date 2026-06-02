# [BUG] Directory-locale detection drops sibling files

**File:** [`apps/hyperlocalise-web/src/lib/agents/i18n-setup/locale-detection.ts`](https://github.com/hyperlocalise/hyperlocalise/blob/main/apps/hyperlocalise-web/src/lib/agents/i18n-setup/locale-detection.ts#L145-L184) (lines 145, 159, 164, 175, 184)
**Project:** hyperlocalise
**Severity:** BUG  •  **Confidence:** high  •  **Slug:** `other-logic-bug`

## Owners

**Suggested assignee:** `cungminh2710@gmail.com` _(via last-committer)_

## Finding

For locale-in-directory layouts, buildPatternKey returns only the base directory for every file under that locale directory. Paths such as messages/en/common.json, messages/en/errors.json, messages/fr/common.json, and messages/fr/errors.json all collapse into one group key, then buildLocaleFileGroups selects one sample file and builds only one pathPattern from it. The generated i18n config can silently omit sibling translation files.

## Recommendation

Include the non-locale portion of the file path in the grouping key, or emit one mapping per relative file path under the locale directory instead of one mapping per locale parent directory.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-05-30)
