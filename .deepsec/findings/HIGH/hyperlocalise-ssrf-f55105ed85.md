# [HIGH] Provider health check can be abused for blind SSRF

**File:** [`apps/hyperlocalise-web/src/lib/providers/external-tms-health-check.ts`](https://github.com/hyperlocalise/hyperlocalise/blob/main/apps/hyperlocalise-web/src/lib/providers/external-tms-health-check.ts#L71-L354) (lines 71, 159, 282, 285, 296, 304, 314, 331, 344, 354)
**Project:** hyperlocalise
**Severity:** HIGH  •  **Confidence:** high  •  **Slug:** `ssrf`

## Owners

**Suggested assignee:** `cungminh2710@gmail.com` _(via last-committer)_

## Finding

The health check fetches a URL derived from the stored provider credential baseUrl. normalizeBaseUrl only validates the initial URL string and blocks a few literal localhost/private-IP forms, while allowing arbitrary HTTPS hostnames. The subsequent fetch uses default redirect behavior, so an attacker with provider credential admin access for their tenant can set a base URL on a domain they control and redirect the server-side request to an internal URL, or use an internal DNS name that passes the string checks. The response body is mostly not returned, but this still gives a tenant-controlled blind SSRF primitive from the application server.

## Recommendation

Restrict provider base URLs to explicit provider or approved enterprise domains where possible. Set fetch redirect handling to manual and revalidate any redirect target before following it. If custom domains must be supported, resolve hostnames and block loopback, link-local, private, multicast, and otherwise non-public IPv4/IPv6 ranges at connection time, and apply the same validation to all provider clients.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-05-23)
