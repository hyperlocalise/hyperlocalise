# [BUG] File-scoped Smartling translations can be silently dropped

**File:** [`apps/hyperlocalise-web/src/lib/providers/adapters/smartling/smartling-content-puller.ts`](https://github.com/hyperlocalise/hyperlocalise/blob/main/apps/hyperlocalise-web/src/lib/providers/adapters/smartling/smartling-content-puller.ts#L12-L139) (lines 12, 103, 109, 127, 139)
**Project:** hyperlocalise
**Severity:** BUG  •  **Confidence:** medium  •  **Slug:** `other-logic-bug`

## Owners

**Suggested assignee:** `cungminh2710@gmail.com` _(via last-committer)_

## Finding

When a Smartling job has files, the puller fetches translations with a fileUri filter, but translationLookupKey only includes fileUri if each returned translation row contains it. SmartlingLocaleTranslation.fileUri is optional, so a file-filtered response that omits fileUri is indexed under the plain hashcode. Source units then only probe file-scoped keys such as fileUri::hashcode and fileUri::text, so those translations are not matched and the sync result can incorrectly show no translations for affected strings.

## Recommendation

Carry the fileUri from the file-scoped request into translationLookupKey when the response row omits it, or include unscoped hashcode/text fallback keys when matching source strings.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-05-31)
