# [MEDIUM] Translation memory project list can disclose projects outside the user's team scope

**File:** [`apps/hyperlocalise-web/src/app/(authenticated)/org/[organizationSlug]/translation-memories/[memoryId]/page.tsx`](https://github.com/hyperlocalise/hyperlocalise/blob/main/apps/hyperlocalise-web/src/app/(authenticated)/org/[organizationSlug]/translation-memories/[memoryId]/page.tsx#L17-L19) (lines 17, 19)
**Project:** hyperlocalise
**Severity:** MEDIUM  •  **Confidence:** high  •  **Slug:** `acl-check`

## Owners

**Suggested assignee:** `cungminh2710@gmail.com` _(via last-committer)_

## Finding

The page renders TranslationMemoryDetailPageContent for a memory the user can access. That component calls GET /translation-memories/:memoryId/projects and displays each returned project name/link. The route verifies the user can access the memory, but listMemoryProjects only filters by organizationId and memoryId, then returns every linked project's id, name, source locale, and target locales. For team-scoped users, canAccessMemory grants access when the memory is linked to at least one accessible project, so a memory shared with both an accessible and inaccessible project will disclose metadata for the inaccessible project.

## Recommendation

Filter listMemoryProjects through the same accessible-project predicate used elsewhere, for example by joining projects with buildAccessibleProjectsWhere(auth) or restricting to getAccessibleProjectIds(auth). Add a team-scoped regression test where a shared memory is linked to two projects and the user can see only their accessible project.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-06-01)
