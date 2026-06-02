# [HIGH] Provider download fetches bypass DNS-pinning SSRF guard

**File:** [`apps/hyperlocalise-web/src/lib/providers/adapters/crowdin/crowdin-api.ts`](https://github.com/hyperlocalise/hyperlocalise/blob/main/apps/hyperlocalise-web/src/lib/providers/adapters/crowdin/crowdin-api.ts#L955-L961) (lines 955, 956, 961)
**Project:** hyperlocalise
**Severity:** HIGH  •  **Confidence:** medium  •  **Slug:** `ssrf`

## Owners

**Suggested assignee:** `cungminh2710@gmail.com` _(via last-committer)_

## Finding

CrowdinApiClient.downloadUrl() accepts a provider-returned URL, runs only syntactic validation via normalizeProviderDownloadUrl(), then calls fetch() directly. That validation blocks non-HTTPS URLs, credentials, localhost, and literal private IPs, but it does not resolve hostnames or pin the connection target. The repo has providerSafeFetch/resolvePinnedHttpConnectTarget for DNS-based SSRF protection, but this client does not use it. A malicious Crowdin-compatible custom endpoint, compromised provider response, or attacker-influenced download URL could use a public-looking HTTPS hostname that resolves to an internal/private address, causing Hyperlocalise to make a server-side request to that internal service. Redirects are disabled, which helps, but DNS/CNAME private targets remain unchecked.

## Recommendation

Use providerSafeFetch, or equivalent DNS resolution and pinned-connect logic, for Crowdin download URLs and preferably as the default CrowdinApiClient fetch implementation. Re-validate resolved addresses on every outbound request and keep redirects disabled.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-05-31)
