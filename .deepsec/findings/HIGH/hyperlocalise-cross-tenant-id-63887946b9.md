# [HIGH] Translation memory search is not scoped to the current organization

**File:** [`apps/hyperlocalise-web/src/lib/tools/asset-tools.ts`](https://github.com/hyperlocalise/hyperlocalise/blob/main/apps/hyperlocalise-web/src/lib/tools/asset-tools.ts#L144-L216) (lines 144, 145, 146, 147, 148, 156, 157, 158, 159, 160, 166, 176, 177, 192, 193, 194, 195, 196, 202, 215, 216)
**Project:** hyperlocalise
**Severity:** HIGH  •  **Confidence:** high  •  **Slug:** `cross-tenant-id`

## Owners

**Suggested assignee:** `cungminh2710@gmail.com` _(via last-committer)_

## Finding

createQueryTranslationMemoryTool searches memory_entries directly and never joins memories or filters by ctx.organizationId. Without projectId, exact and fuzzy searches return approved translation memory matches from every tenant. With projectId, the tool reads project_memories by raw projectId without an organization check. This exposes source text, target text, provenance, and match metadata from other organizations through authenticated chat tool calls.

## Recommendation

Join memory_entries to memories and require eq(schema.memories.organizationId, ctx.organizationId) for both exact and fuzzy searches. Also validate projectId ownership or filter projectMemories by ctx.organizationId before using attached memory IDs.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-05-04)
