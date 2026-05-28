# [HIGH] Custom provider base URL enables server-side request forgery

**File:** [`apps/hyperlocalise-web/src/lib/providers/organization-external-tms-provider-credentials.ts`](https://github.com/hyperlocalise/hyperlocalise/blob/main/apps/hyperlocalise-web/src/lib/providers/organization-external-tms-provider-credentials.ts#L181-L222) (lines 181, 189, 203, 222)
**Project:** hyperlocalise
**Severity:** HIGH  •  **Confidence:** high  •  **Slug:** `ssrf`

## Owners

**Suggested assignee:** `cungminh2710@gmail.com` _(via last-committer)_

## Finding

External TMS credentials persist an arbitrary `baseUrl` without provider-domain or private-network validation. The org-scoped route schema only requires a syntactically valid URL, and later sync paths pass the stored `credential.baseUrl` into provider clients that concatenate it with API paths and call `fetch`. An organization admin can set `baseUrl` to an attacker-controlled or internal HTTPS host and trigger sync-projects or webhook-driven syncs, causing backend requests from Hyperlocalise infrastructure and sending provider Authorization headers or Smartling credential material to that host. The health-check code has a private `normalizeBaseUrl` guard, but that mitigation is not applied before storage or in the sync clients.

## Recommendation

Validate `baseUrl` before storing and before every outbound provider request. Use provider-specific allowlists or explicit enterprise-domain validation, reject loopback/link-local/private/IP hosts, and prevent redirects to disallowed hosts. Prefer centralizing this validation so health checks and sync clients share the same egress policy.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-05-28)
