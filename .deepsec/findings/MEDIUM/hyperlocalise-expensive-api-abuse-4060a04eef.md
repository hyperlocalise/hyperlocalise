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

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-05-07)
