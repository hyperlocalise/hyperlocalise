# [BUG] Negative publish statuses can be treated as approved

**File:** [`apps/hyperlocalise-web/src/lib/providers/smartling/smartling-content-puller.ts`](https://github.com/hyperlocalise/hyperlocalise/blob/main/apps/hyperlocalise-web/src/lib/providers/smartling/smartling-content-puller.ts#L34-L116) (lines 34, 35, 36, 37, 38, 39, 116)
**Project:** hyperlocalise
**Severity:** BUG  •  **Confidence:** medium  •  **Slug:** `other-logic-bug`

## Owners

**Suggested assignee:** `cungminh2710@gmail.com` _(via last-committer)_

## Finding

isApprovedTranslation treats any publishStatus containing `publish` as approved unless it starts with `unpublish`, and any status containing `author` as approved unless it starts with `unauthor`. Statuses such as `not_published` or `not_authorized` would pass these substring checks even when authorized/published booleans are false, causing pulled translations to be marked `isApproved: true`.

## Recommendation

Replace substring checks with an explicit allowlist of provider statuses known to mean approved, and add tests for negative statuses such as `not_published`, `not_authorized`, and unknown values.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-05-23)
