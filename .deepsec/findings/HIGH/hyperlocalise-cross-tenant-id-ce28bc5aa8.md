# [HIGH] Chat asset tools can leak glossary and translation memory data across organizations

**File:** [`apps/hyperlocalise-web/src/api/routes/conversation/chat-stream.route.ts`](https://github.com/hyperlocalise/hyperlocalise/blob/main/apps/hyperlocalise-web/src/api/routes/conversation/chat-stream.route.ts#L122-L133) (lines 122, 129, 133)
**Project:** hyperlocalise
**Severity:** HIGH  •  **Confidence:** high  •  **Slug:** `cross-tenant-id`

## Owners

**Suggested assignee:** `cungminh2710@gmail.com` _(via last-committer)_

## Finding

The chat stream builds the full LLM toolset for any authenticated conversation and lets streamText execute it. The imported queryGlossary/queryTranslationMemory tools use ctx.organizationId in their context shape, but their DB queries do not filter by organizationId when no projectId is supplied; the system prompt explicitly allows org-wide glossary/TM queries. As a result, an authenticated user can ask the agent for common terms or memory matches and receive entries from other tenants through tool output or the assistant response. The optional projectId path is also not ownership-checked before querying projectGlossaries/projectMemories.

## Recommendation

Add organizationId predicates to all glossary and translation-memory query tools, and verify any optional projectId belongs to ctx.organizationId before using project attachments. Add regression tests that seed two organizations and assert chat tools cannot return the other org's assets.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-05-05)
