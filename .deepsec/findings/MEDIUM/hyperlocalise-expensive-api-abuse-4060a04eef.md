# [MEDIUM] Mounted translation job surfaces lack quota/rate limits for expensive AI work

**File:** [`apps/hyperlocalise-web/src/api/app.ts`](https://github.com/hyperlocalise/hyperlocalise/blob/main/apps/hyperlocalise-web/src/api/app.ts#L46-L63) (lines 46, 47, 56, 58, 63)
**Project:** hyperlocalise
**Severity:** MEDIUM  •  **Confidence:** medium  •  **Slug:** `expensive-api-abuse`

## Owners

**Suggested assignee:** `cungminh2710@gmail.com` _(via last-committer)_

## Finding

The app mounts browser job routes, public API-key job routes, and chat agent routes that can enqueue translation work. The imported schemas cap sourceText length but do not cap targetLocales, and no route-level or app-level rate limit, quota, or per-key/per-user abuse control was found for these job creation paths. A valid session or API key with job-writing capability can submit large or repeated jobs that fan out across many locales and drive LLM/workflow cost.

## Recommendation

Add per-organization and per-api-key rate limits/quotas around job creation and chat streaming, cap targetLocales to a sane maximum, and enforce request body limits on JSON job endpoints.

## Revalidation

**Verdict:** true-positive

The exact input-shape portion of the finding has improved: current schemas cap `sourceText`, `context`, metadata, and `targetLocales` with `maxTranslationTargetLocales = 20`, and the public job route has a 1 MB body limit. However, the mounted browser job route, public API-key job route, and chat stream still have no enforcement point that rejects excessive request frequency or organization/key quota exhaustion. `reserveUsageEvent` records an event and later tracks it with Autumn, but it does not check a balance or deny job creation before queueing. The project job route lets an admin create repeated translation jobs, and the public route lets any valid `jobs:write` API key do the same for its organization. The chat stream can also create fresh model calls repeatedly for an authenticated member once a chat conversation has translation attachments. A concrete abuse case is a valid API key or compromised admin session looping job-creation requests up to the per-request caps, driving workflow and model cost without a per-key or per-org limiter.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-05-27)
