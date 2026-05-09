# [HIGH] Glossary search can return terms from other organizations

**File:** [`apps/hyperlocalise-web/src/lib/tools/asset-tools.ts`](https://github.com/hyperlocalise/hyperlocalise/blob/main/apps/hyperlocalise-web/src/lib/tools/asset-tools.ts#L58-L97) (lines 58, 59, 60, 61, 62, 69, 70, 71, 72, 73, 95, 96, 97)
**Project:** hyperlocalise
**Severity:** HIGH  •  **Confidence:** high  •  **Slug:** `cross-tenant-id`

## Owners

**Suggested assignee:** `cungminh2710@gmail.com` _(via last-committer)_

## Finding

createQueryGlossaryTool is described as org-wide when no project is attached, but the query never filters glossaries by ctx.organizationId. With no projectId, it searches all active glossaries across all tenants for the requested locale pair. With a supplied projectId, it first reads project_glossaries by raw projectId without proving that the project belongs to the current organization. An authenticated user can prompt the agent to search common text and receive glossary terms, translations, descriptions, and glossary names from other organizations.

## Recommendation

Always add eq(schema.glossaries.organizationId, ctx.organizationId) to glossary searches. When projectId is provided, first verify the project belongs to ctx.organizationId or filter projectGlossaries by organizationId as well.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-05-04)
