# [BUG] QA finding IDs are collision-prone

**File:** [`apps/hyperlocalise-web/src/app/(authenticated)/org/[organizationSlug]/jobs/[jobId]/_components/job-qa-findings-model.ts`](https://github.com/hyperlocalise/hyperlocalise/blob/main/apps/hyperlocalise-web/src/app/(authenticated)/org/[organizationSlug]/jobs/[jobId]/_components/job-qa-findings-model.ts#L40-L43) (lines 40, 43)
**Project:** hyperlocalise
**Severity:** BUG  •  **Confidence:** high  •  **Slug:** `other-logic-bug`

## Owners

**Suggested assignee:** `cungminh2710@gmail.com` _(via last-committer)_

## Finding

`attachFindingIds()` assigns IDs with `buildFindingId()`, which concatenates finding fields using a raw delimiter. Because fields such as external string IDs, keys, locales, and messages can contain that delimiter, distinct findings can collapse to the same ID. The UI then uses those IDs for selection and comment write-back state, so one selected or posted finding can unintentionally affect another finding with a colliding ID.

## Recommendation

Build finding IDs from an unambiguous encoding, such as a SHA-256 hash over a JSON array of the ID components, and update marker parsing/tests to use the same collision-resistant ID.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-05-24)
