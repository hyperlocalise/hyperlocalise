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

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-05-07)
