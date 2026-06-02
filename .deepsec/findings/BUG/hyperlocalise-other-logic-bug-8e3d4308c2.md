# [BUG] Selected project is ignored when sending a reply

**File:** [`apps/hyperlocalise-web/src/app/(authenticated)/org/[organizationSlug]/inbox/_components/reply-composer.tsx`](https://github.com/hyperlocalise/hyperlocalise/blob/main/apps/hyperlocalise-web/src/app/(authenticated)/org/[organizationSlug]/inbox/_components/reply-composer.tsx#L107-L280) (lines 107, 130, 144, 280)
**Project:** hyperlocalise
**Severity:** BUG  •  **Confidence:** high  •  **Slug:** `other-logic-bug`

## Owners

**Suggested assignee:** `cungminh2710@gmail.com` _(via last-committer)_

## Finding

The composer tracks selectedProjectId and lets the user choose another project from the dropdown, but sendReply calls onSend with only text and files. The parent send path also submits only text/files to the conversation messages endpoint, so changing the visible project selector has no effect on the message or agent context. This can make replies run under the conversation's existing project while the UI indicates a different project was selected.

## Recommendation

Either remove or disable the project selector if replies must always use the conversation project, or include selectedProjectId in the send callback/API contract and server-side validate that the user can access that project before applying it.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-06-01)
