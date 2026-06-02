# [MEDIUM] Lokalise client does not use runtime DNS-pinned provider fetch

**File:** [`apps/hyperlocalise-web/src/lib/providers/adapters/lokalise/lokalise-api.ts`](https://github.com/hyperlocalise/hyperlocalise/blob/main/apps/hyperlocalise-web/src/lib/providers/adapters/lokalise/lokalise-api.ts#L243-L664) (lines 243, 443, 449, 663, 664)
**Project:** hyperlocalise
**Severity:** MEDIUM  •  **Confidence:** medium  •  **Slug:** `ssrf`

## Owners

**Suggested assignee:** `cungminh2710@gmail.com` _(via last-committer)_

## Finding

The client accepts a stored provider base URL and provider-returned download URLs, normalizes them, then sends requests with the default global fetch. `requireProviderBaseUrl` and `normalizeProviderDownloadUrl` reject obvious literal localhost/private IPs, but they do not pin DNS at request time. The credential save path performs a DNS check once, but DNS can change later, and bundle download URLs are only checked synchronously here. In contrast, this codebase has `providerSafeFetch`, which resolves and pins the connect target for provider-controlled URLs. A malicious or compromised provider endpoint, or a custom provider base URL whose DNS changes after validation, can cause server-side requests to hosts that were not validated at fetch time.

## Recommendation

Use `providerSafeFetch` as the default `fetchFn` for provider API and download requests, or perform equivalent per-request DNS resolution and connect-target pinning before every outbound request. Keep redirects disabled and add timeouts. Consider restricting Lokalise base URLs to an explicit allowlist unless custom enterprise endpoints are required.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-05-31)
