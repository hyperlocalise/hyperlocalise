# [HIGH] Content pulls feed stored Smartling base URLs into the unsafe client

**File:** [`apps/hyperlocalise-web/src/lib/providers/smartling/smartling-content-puller.ts`](https://github.com/hyperlocalise/hyperlocalise/blob/main/apps/hyperlocalise-web/src/lib/providers/smartling/smartling-content-puller.ts#L49-L52) (lines 49, 50, 51, 52)
**Project:** hyperlocalise
**Severity:** HIGH  •  **Confidence:** high  •  **Slug:** `ssrf`

## Owners

**Suggested assignee:** `cungminh2710@gmail.com` _(via last-committer)_

## Finding

pullSmartlingTaskContent constructs SmartlingApiClient with `authBaseUrl: credential.baseUrl ?? undefined`. That credential value is stored from the external TMS provider credential API and is not checked here against the provider health-check URL guard. Triggering a Smartling content pull therefore gives the same server-side request primitive as the underlying client: authentication is attempted against the configured host before any Smartling response validation occurs.

## Recommendation

Do not pass stored provider base URLs into SmartlingApiClient until they have been centrally validated. Prefer fixing SmartlingApiClient itself, then add regression tests that unsafe URLs such as localhost, private IPs, and link-local metadata addresses are rejected before fetch.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-05-23)
