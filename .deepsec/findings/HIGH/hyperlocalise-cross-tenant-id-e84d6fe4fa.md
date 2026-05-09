# [HIGH] Chat asset search tools can disclose glossary and translation memory data across organizations

**File:** [`apps/hyperlocalise-web/src/api/app.ts`](https://github.com/hyperlocalise/hyperlocalise/blob/main/apps/hyperlocalise-web/src/api/app.ts#L56) (lines 56)
**Project:** hyperlocalise
**Severity:** HIGH  •  **Confidence:** high  •  **Slug:** `cross-tenant-id`

## Owners

**Suggested assignee:** `cungminh2710@gmail.com` _(via last-committer)_

## Finding

The conversation route mounted here exposes the chat agent tools. The imported queryGlossary and queryTranslationMemory tools query glossary terms and memory entries without constraining results to ctx.organizationId; when a projectId is supplied, they resolve projectGlossaries/projectMemories by raw projectId without verifying that the project belongs to the active organization. An authenticated user can ask the agent to search terms or memories and receive matching localization assets from other tenants.

## Recommendation

Add organization ownership predicates to all glossary and memory tool queries. When accepting a projectId, first verify projects.id and projects.organizationId match ctx.organizationId, then restrict attached asset lookups through that verified project.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-05-07)
