# [MEDIUM] Public job creation lacks quota controls and bounded job fan-out

**File:** [`apps/hyperlocalise-web/src/api/routes/public-jobs/public-jobs.route.ts`](https://github.com/hyperlocalise/hyperlocalise/blob/main/apps/hyperlocalise-web/src/api/routes/public-jobs/public-jobs.route.ts#L28-L178) (lines 28, 29, 41, 42, 107, 150, 176, 178)
**Project:** hyperlocalise
**Severity:** MEDIUM  •  **Confidence:** medium  •  **Slug:** `expensive-api-abuse`

## Owners

**Suggested assignee:** `cungminh2710@gmail.com` _(via last-committer)_

## Finding

POST /api/v1/jobs requires a jobs:write API key, but the route has no per-key or per-organization rate limit, queue-depth check, or quota enforcement before persisting and enqueueing translation work. The request schema also leaves targetLocales and metadata unbounded, so one valid or leaked API key can submit many expensive AI-backed jobs or a single very large fan-out/payload.

## Recommendation

Add route-local abuse controls: cap targetLocales and metadata size, enforce total token/payload budgets, rate-limit by API key and organization, and reject or defer requests when queue depth or spend quotas are exceeded.

## Revalidation

**Verdict:** true-positive

The public route does require apiKeyAuthMiddleware and requireApiKeyPermission("jobs:write"), and it scopes project and source-file lookups to the API key's organization. The finding is partly outdated because this route has a 1MB bodyLimit and createPublicJobBodySchema now reuses the project job caps for targetLocales and metadata. Those controls prevent the originally described unbounded single-request fan-out. They do not address request volume: the POST path still inserts the job, reserves a usage event, and enqueues translation work without any per-key rate limit, per-organization quota check, queue-depth check, or spend guard. apiKeyAuthMiddleware only validates the key and updates lastUsedAt; reserveUsageEvent only records usage and does not deny over-quota work. A leaked jobs:write key can repeatedly submit valid capped string jobs and create unbounded AI-backed queue load. The quota-control portion of the finding remains real and exploitable.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-05-28)
