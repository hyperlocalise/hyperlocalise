# [HIGH_BUG] Archive mutation calls the hard-delete project endpoint

**File:** [`apps/hyperlocalise-web/src/app/(authenticated)/org/[organizationSlug]/projects/_components/projects-page-content.tsx`](https://github.com/hyperlocalise/hyperlocalise/blob/main/apps/hyperlocalise-web/src/app/(authenticated)/org/[organizationSlug]/projects/_components/projects-page-content.tsx#L101-L116) (lines 101, 103, 116)
**Project:** hyperlocalise
**Severity:** HIGH_BUG  •  **Confidence:** medium  •  **Slug:** `other-data-loss`

## Owners

**Suggested assignee:** `cungminh2710@gmail.com` _(via last-committer)_

## Finding

The archiveProjectMutation calls the Hono client's $delete method for /api/orgs/:organizationSlug/projects/:projectId, but the success path tells the user 'Project archived'. The traced backend delete handler performs db.delete(schema.projects) under the authenticated organization scope, and the projects schema has no archived/status column. This makes the archive flow a permanent project deletion, losing project metadata and severing related project associations.

## Recommendation

Use a PATCH-style archive endpoint that sets archivedAt/status and filters active projects in list queries, or change the UI and toast copy to clearly describe permanent deletion.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-04-30)
