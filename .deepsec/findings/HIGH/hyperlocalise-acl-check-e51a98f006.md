# [HIGH] Translation memory mutation tools have no role authorization

**File:** [`apps/hyperlocalise-web/src/lib/tools/memory-tools.ts`](https://github.com/hyperlocalise/hyperlocalise/blob/main/apps/hyperlocalise-web/src/lib/tools/memory-tools.ts#L57-L370) (lines 57, 64, 79, 96, 116, 123, 194, 254, 282, 340, 351, 370)
**Project:** hyperlocalise
**Severity:** HIGH  •  **Confidence:** medium  •  **Slug:** `acl-check`

## Owners

**Suggested assignee:** `cungminh2710@gmail.com` _(via last-committer)_

## Finding

The translation memory tools allow creating, updating, and deleting organization-level memories and entries using only ctx.organizationId ownership checks. Because ToolContext does not include the caller's membership role, any authenticated organization member who can use chat can mutate or delete shared translation memory content, affecting future translations and potentially destroying approved translation data.

## Recommendation

Add an explicit owner/admin authorization check for all translation memory and entry mutation tools, or omit these tools from buildTools for non-admin members.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-05-04)
