# [MEDIUM] External job upsert can merge jobs across projects

**File:** [`apps/hyperlocalise-web/src/lib/providers/sync/organization-external-tms-jobs.ts`](https://github.com/hyperlocalise/hyperlocalise/blob/main/apps/hyperlocalise-web/src/lib/providers/sync/organization-external-tms-jobs.ts#L71-L99) (lines 71, 84, 99)
**Project:** hyperlocalise
**Severity:** MEDIUM  •  **Confidence:** medium  •  **Slug:** `other-cross-project-data-mixup`

## Owners

**Suggested assignee:** `cungminh2710@gmail.com` _(via last-committer)_

## Finding

upsertExternalJob deduplicates external jobs on organizationId, externalJobId, and providerKind, but not projectId or externalProjectId. On conflict, it keeps the old externalJobDetails.jobId, deletes the newly created job, and updates the existing job by that id without moving or validating its projectId. If a provider uses project-scoped task/job ids, two projects in the same organization can collide: syncing project B can overwrite the external details attached to a job that remains scoped to project A. Since project/job APIs enforce access by jobs.projectId and then join externalJobDetails by jobId, users with access to project A could see provider metadata, assignees, URLs, or status from project B, and automation for project B can be associated with project A's job id.

## Recommendation

Scope external job uniqueness and conflict handling by project. Add projectId or externalProjectId to externalJobDetails and to the unique conflict target, backfill/migrate existing rows, and update conflict-path job updates with organizationId and projectId predicates.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-05-31)
