# [HIGH] Chat glossary mutation tools bypass the owner/admin role gate

**File:** [`apps/hyperlocalise-web/src/lib/tools/glossary-tools.ts`](https://github.com/hyperlocalise/hyperlocalise/blob/main/apps/hyperlocalise-web/src/lib/tools/glossary-tools.ts#L61-L349) (lines 61, 82, 99, 132, 152, 159, 219, 257, 283, 319, 330, 349)
**Project:** hyperlocalise
**Severity:** HIGH  •  **Confidence:** high  •  **Slug:** `acl-check`

## Owners

**Suggested assignee:** `cungminh2710@gmail.com` _(via last-committer)_

## Finding

The normal glossary API only permits owner/admin roles to create, update, or delete glossaries, but these agent tools receive only conversationId, organizationId, projectId, and db through ToolContext and perform the same mutations without checking membership role. A regular organization member with access to chat can prompt the agent to create, modify, or delete organization glossaries and glossary terms, bypassing the route-level RBAC policy and corrupting shared localization assets.

## Recommendation

Carry the authenticated membership role in ToolContext and enforce the same isGlossaryMutationAllowed owner/admin check before exposing or executing glossary and glossary-term mutation tools.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-05-04)
