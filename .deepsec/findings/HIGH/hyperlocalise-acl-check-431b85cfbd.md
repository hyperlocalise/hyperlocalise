# [HIGH] Chat agent exposes admin-grade mutation tools to any authenticated organization member

**File:** [`apps/hyperlocalise-web/src/api/app.ts`](https://github.com/hyperlocalise/hyperlocalise/blob/main/apps/hyperlocalise-web/src/api/app.ts#L56) (lines 56)
**Project:** hyperlocalise
**Severity:** HIGH  •  **Confidence:** high  •  **Slug:** `acl-check`

## Owners

**Suggested assignee:** `cungminh2710@gmail.com` _(via last-committer)_

## Finding

The app mounts the conversation chat API at /api/orgs/:organizationSlug/conversations. The mounted chat stream route only verifies that the user is authenticated and the conversation belongs to the organization, then passes a full toolset into streamText. That toolset includes create/update/delete glossary tools, create/update/delete translation memory tools, and createTranslationJob, but ToolContext carries no membership role and the tools do not enforce the owner/admin checks used by the direct REST routes. A regular member can prompt the chat agent to mutate or delete organization localization assets and create jobs, bypassing the REST authorization gates.

## Recommendation

Pass the authenticated membership role into ToolContext and enforce the same owner/admin checks inside every mutating agent tool, or only register mutation tools when the authenticated user has the required role.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-05-07)
