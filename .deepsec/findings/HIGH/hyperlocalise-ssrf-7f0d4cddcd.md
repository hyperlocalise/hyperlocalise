# [HIGH] Provider baseUrl can drive server-side requests to arbitrary hosts during sync

**File:** [`apps/hyperlocalise-web/src/api/routes/external-tms-provider-credential/external-tms-provider-credential.route.ts`](https://github.com/hyperlocalise/hyperlocalise/blob/main/apps/hyperlocalise-web/src/api/routes/external-tms-provider-credential/external-tms-provider-credential.route.ts#L70-L265) (lines 70, 78, 242, 265)
**Project:** hyperlocalise
**Severity:** HIGH  •  **Confidence:** high  •  **Slug:** `ssrf`

## Owners

**Suggested assignee:** `cungminh2710@gmail.com` _(via last-committer)_

## Finding

The credential upsert route accepts and stores payload.baseUrl, then the sync-projects route passes the stored credential into provider fetchers. Those provider clients concatenate credential.baseUrl with provider API paths and issue fetch requests with provider auth headers. The health-check path has a safer normalizeBaseUrl helper, but that validation is not enforced at write time or on the sync path. A tenant admin can set baseUrl to an internal or attacker-controlled URL and trigger /sync-projects to make server-side requests at fixed provider paths, enabling internal service probing and credential/header leakage to attacker-controlled hosts.

## Recommendation

Validate baseUrl at write time and before every provider request. Require HTTPS, block loopback/link-local/private networks after DNS resolution, and preferably allowlist expected provider or enterprise domains. Reuse one safe URL validator across health checks, project sync, file sync, webhook setup, and all provider clients.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-05-28)
