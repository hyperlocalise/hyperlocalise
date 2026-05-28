# [MEDIUM] Translation job creation lacks abuse limits

**File:** [`apps/hyperlocalise-web/src/api/routes/project/job.route.ts`](https://github.com/hyperlocalise/hyperlocalise/blob/main/apps/hyperlocalise-web/src/api/routes/project/job.route.ts#L268-L330) (lines 268, 281, 304, 330)
**Project:** hyperlocalise
**Severity:** MEDIUM  •  **Confidence:** medium  •  **Slug:** `expensive-api-abuse`

## Owners

**Suggested assignee:** `cungminh2710@gmail.com` _(via last-committer)_

## Finding

POST /:projectId/jobs accepts a validated job payload, stores it as inputPayload, and immediately enqueues translation work. The imported job schema caps sourceText but does not cap targetLocales count or metadata size, and this route has no per-user or per-organization rate limit or quota before enqueueing. File translation jobs are especially sensitive because each target locale drives sandboxed translation work using the app OpenAI environment. An authenticated owner/admin, or a compromised admin session, can enqueue arbitrarily many large or multi-locale jobs and consume paid compute/API resources.

## Recommendation

Add server-side quotas/rate limits for job creation and retry by organization and user, enforce a small maximum targetLocales count and bounded metadata keys/values in the job schema, and reject jobs before insertion/enqueue when limits are exceeded.

## Revalidation

**Verdict:** true-positive

The route is authenticated through the parent project route's workosAuthMiddleware and the POST handler requires isProjectMutationAllowed, so the attacker needs an owner/admin role or a compromised admin session. The finding is partly stale because createJobBodySchema now caps targetLocales at 20, metadata at 50 entries with bounded key/value sizes, sourceText at 100000 characters, and context at 20000 characters. File jobs also verify the source file belongs to the authenticated organization/project scope before insertion. However, after validation the handler inserts a queued job, records a reserveUsageEvent, and immediately calls options.jobQueue.enqueue without checking per-user limits, per-organization limits, queue depth, current open-job count, or billing quota. reserveUsageEvent is only an idempotent usage record and does not reject when a customer is over budget. A compromised admin session can therefore loop valid maximum-size string translation jobs and cause unbounded queued AI work, even though each individual request is now size-limited. The core expensive job-volume abuse remains exploitable.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-05-28)
