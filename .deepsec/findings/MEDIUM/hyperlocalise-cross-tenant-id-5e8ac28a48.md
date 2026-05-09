# [MEDIUM] Chat requests accept projectId without an organization ownership check

**File:** [`apps/hyperlocalise-web/src/api/routes/chat-request/chat-request.route.ts`](https://github.com/hyperlocalise/hyperlocalise/blob/main/apps/hyperlocalise-web/src/api/routes/chat-request/chat-request.route.ts#L13-L163) (lines 13, 15, 29, 31, 101, 104, 108, 113, 115, 156, 159, 163)
**Project:** hyperlocalise
**Severity:** MEDIUM  •  **Confidence:** high  •  **Slug:** `cross-tenant-id`

## Owners

**Suggested assignee:** `cungminh2710@gmail.com` _(via last-committer)_

## Finding

Both chat creation paths accept a user-supplied projectId and pass it directly into createInteraction and createStoredFile while scoping only the new records' organizationId to the active organization. Since projectId is a foreign key to the global projects table, a tampered request with another organization's known project ID can create current-org interactions, inbox items, and stored files linked to that foreign project, and can distinguish existing project IDs from nonexistent ones via success versus database failure.

## Recommendation

When projectId is supplied, first query projects by id and c.var.auth.activeOrganization.localOrganizationId; reject missing or foreign projects before inserting interactions or files. Add a database-level composite relationship or constraint where possible so project-scoped records cannot reference projects from another organization.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-05-05)
