# [BUG] Partial multi-file upload failures can leave orphaned stored files

**File:** [`apps/hyperlocalise-web/src/api/routes/conversation/conversation.route.ts`](https://github.com/hyperlocalise/hyperlocalise/blob/main/apps/hyperlocalise-web/src/api/routes/conversation/conversation.route.ts#L266-L301) (lines 266, 267, 301)
**Project:** hyperlocalise
**Severity:** BUG  •  **Confidence:** high  •  **Slug:** `other-partial-upload-leak`

## Owners

**Suggested assignee:** `cungminh2710@gmail.com` _(via last-committer)_

## Finding

Files are uploaded with Promise.all before the handler enters the cleanup block around addInteractionMessage. If one createStoredFile call rejects after another file has already been uploaded and inserted, the Promise.all rejects and the handler exits without deleting the successfully created storedFiles rows or storage objects. This can leave unattached files and consume storage indefinitely.

## Recommendation

Use Promise.allSettled or explicit staged tracking so any successfully created files are cleaned up whenever any sibling upload fails, not only when message persistence fails.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-05-05)
