# [HIGH_BUG] Archive dialog triggers irreversible project deletion semantics

**File:** [`apps/hyperlocalise-web/src/app/(authenticated)/org/[organizationSlug]/projects/_components/archive-project-dialog.tsx`](https://github.com/hyperlocalise/hyperlocalise/blob/main/apps/hyperlocalise-web/src/app/(authenticated)/org/[organizationSlug]/projects/_components/archive-project-dialog.tsx#L32-L51) (lines 32, 35, 46, 51)
**Project:** hyperlocalise
**Severity:** HIGH_BUG  •  **Confidence:** medium  •  **Slug:** `other-data-loss`

## Owners

**Suggested assignee:** `cungminh2710@gmail.com` _(via last-committer)_

## Finding

The dialog presents the action as archiving and says the project will be removed from active projects, then invokes onArchive(project.id). Tracing the parent and API route shows this is wired to DELETE /api/orgs/:organizationSlug/projects/:projectId, whose handler hard-deletes the projects row. The projects table has no archived/status field, so this is not a reversible archive; related project glossary/memory attachments cascade and jobs/files/interactions lose the project link. A user can reasonably expect archive to be recoverable, causing accidental project metadata loss.

## Recommendation

Either implement a real soft-archive field and update/list projects by status, or rename this UI to Delete project and explicitly warn that the action is permanent and affects project links/context.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-04-30)
