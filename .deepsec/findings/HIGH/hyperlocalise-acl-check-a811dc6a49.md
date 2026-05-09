# [HIGH] LLM mutation tools bypass owner/admin role gates

**File:** [`apps/hyperlocalise-web/src/api/routes/conversation/chat-stream.route.ts`](https://github.com/hyperlocalise/hyperlocalise/blob/main/apps/hyperlocalise-web/src/api/routes/conversation/chat-stream.route.ts#L71-L129) (lines 71, 122, 129)
**Project:** hyperlocalise
**Severity:** HIGH  •  **Confidence:** high  •  **Slug:** `acl-check`

## Owners

**Suggested assignee:** `cungminh2710@gmail.com` _(via last-committer)_

## Finding

The route only requires a WorkOS session before exposing buildTools to streamText. That registry includes create/update/delete tools for glossaries, glossary terms, translation memories, memory entries, and translation jobs, but ToolContext does not carry the authenticated membership role and the tools do not perform role checks. The normal REST routes gate equivalent project, job, and glossary mutations behind owner/admin checks, so a plain organization member can use the chat endpoint as a confused deputy to mutate or delete shared assets and enqueue paid jobs.

## Recommendation

Pass the authenticated role/permissions into ToolContext and enforce the same owner/admin checks inside each mutating tool, or omit mutating tools entirely for non-admin roles. Keep read-only tools separate from write tools.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-05-05)
