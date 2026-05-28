# [HIGH] Public URL check can be bypassed through DNS and private IPv6 ranges

**File:** [`apps/hyperlocalise-web/src/lib/agent-runtime/tools/workspace/fetch.ts`](https://github.com/hyperlocalise/hyperlocalise/blob/main/apps/hyperlocalise-web/src/lib/agent-runtime/tools/workspace/fetch.ts#L57-L120) (lines 57, 67, 70, 79, 91, 120)
**Project:** hyperlocalise
**Severity:** HIGH  •  **Confidence:** medium  •  **Slug:** `ssrf`

## Owners

**Suggested assignee:** `cungminh2710@gmail.com` _(via last-committer)_

## Finding

The fetch tool validates only the literal hostname string before calling `fetch`. It blocks `localhost`, some literal private IPv4 ranges, loopback IPv6, and IPv4-mapped IPv6, but it does not resolve DNS and verify the final IP address, and it misses private/link-local IPv6 ranges such as `fc00::/7` and `fe80::/10`. A hostname that resolves to an internal address, or an internal IPv6 literal in an unblocked range, can still make the server fetch internal services. Disabling redirects does not mitigate direct DNS-based SSRF.

## Recommendation

Resolve the hostname server-side, reject all non-global IP ranges for every resolved address, and pin the connection to the validated address. Consider replacing broad public fetching with an allowlist of documentation/API domains needed by the agent.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-05-27)
