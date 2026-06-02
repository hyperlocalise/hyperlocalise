# [BUG] Duplicate job claims are returned without scope validation

**File:** [`apps/hyperlocalise-web/src/lib/agents/github/github-repository-automation-jobs.ts`](https://github.com/hyperlocalise/hyperlocalise/blob/main/apps/hyperlocalise-web/src/lib/agents/github/github-repository-automation-jobs.ts#L147-L166) (lines 147, 156, 159, 166)
**Project:** hyperlocalise
**Severity:** BUG  •  **Confidence:** high  •  **Slug:** `other-idempotency-collision`

## Owners

**Suggested assignee:** `cungminh2710@gmail.com` _(via last-committer)_

## Finding

claimGithubRepositoryAutomationJob inserts by a globally unique idempotencyKey, but on conflict it selects and returns the existing job using only that key. It does not verify that the existing row matches the requested organizationId, githubInstallationRepositoryId, repository ID, trigger mode, config version, or workflow payload. Traced callers include workspace automation dispatch paths that can reuse GitHub-derived idempotency keys for multiple automations on the same event, causing unrelated automation runs to collapse onto the first job and potentially run the wrong workflow configuration.

## Recommendation

Include all relevant scope in idempotency keys, especially automation ID for workspace automations, and make claimGithubRepositoryAutomationJob validate that any existing row matches the requested organization, repository, trigger, config, and workflow shape before returning it. Treat mismatches as errors instead of successful duplicate claims.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-06-01)
