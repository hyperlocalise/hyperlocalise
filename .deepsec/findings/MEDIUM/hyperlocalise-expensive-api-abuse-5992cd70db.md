# [MEDIUM] Concurrent i18n setup starts can bypass the active-run guard

**File:** [`apps/hyperlocalise-web/src/app/(authenticated)/org/[organizationSlug]/integrations/_components/repository-i18n-setup-action.tsx`](https://github.com/hyperlocalise/hyperlocalise/blob/main/apps/hyperlocalise-web/src/app/(authenticated)/org/[organizationSlug]/integrations/_components/repository-i18n-setup-action.tsx#L117-L121) (lines 117, 121)
**Project:** hyperlocalise
**Severity:** MEDIUM  •  **Confidence:** high  •  **Slug:** `expensive-api-abuse`

## Owners

**Suggested assignee:** `cungminh2710@gmail.com` _(via last-committer)_

## Finding

This component starts i18n setup by POSTing to `/repositories/:githubRepositoryId/i18n-setup`. In the traced server handler, the active-run check and insert/enqueue are not atomic: it calls `findActiveI18nSetupRun` and, if none is found, inserts a new `githubI18nSetupRuns` row and enqueues the workflow. The schema only has a non-unique `(organizationId, githubRepositoryId)` index for these runs, so concurrent requests for the same repository can both observe no active run and enqueue duplicate setup workflows. The workflow uses sandbox and AI agent execution, so this bypasses the intended one-active-run limit and can create duplicate pull requests and unnecessary paid compute/API usage. Auth and repository ownership checks are present, so this requires an authenticated workspace operator, but it is still an abuse/race condition on an expensive operation.

## Recommendation

Make i18n setup start atomic. Add a partial unique index for active runs per `(organization_id, github_repository_id)` where status is `queued` or `running`, or use a transaction/advisory lock around the active-run lookup and insert. On conflict, return the existing active run and only enqueue after the caller wins the insert.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-06-01)
