# [HIGH] Provider download URL safety check does not resolve hostnames before fetch

**File:** [`apps/hyperlocalise-web/src/lib/providers/provider-url-safety.ts`](https://github.com/hyperlocalise/hyperlocalise/blob/main/apps/hyperlocalise-web/src/lib/providers/provider-url-safety.ts#L24-L55) (lines 24, 27, 47, 55)
**Project:** hyperlocalise
**Severity:** HIGH  •  **Confidence:** medium  •  **Slug:** `ssrf`

## Owners

**Suggested assignee:** `cungminh2710@gmail.com` _(via last-committer)_

## Finding

normalizeProviderDownloadUrl accepts any HTTPS hostname that is not a literal blocked IP/localhost value. It does not resolve the hostname or pin the connection target. Related provider adapters use this normalized URL for provider-supplied download links and then call their client fetch function, which defaults to global fetch in production paths. A malicious or compromised custom provider endpoint can return a download URL such as an internal HTTPS hostname; this helper will accept it because the hostname is not a literal private IP, and the later global fetch can resolve and connect to the internal address.

## Recommendation

Do not treat this synchronous normalization as an SSRF guard. Route provider download fetches through providerSafeFetch or an equivalent async resolver that rejects private DNS answers and pins the resolved address for the actual connection. Keep normalization for formatting only.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-05-30)
