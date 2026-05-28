# [HIGH] Config-controlled API base URL can exfiltrate the Hyperlocalise API key

**File:** [`apps/cli/cmd/sync_hyperlocalise.go`](https://github.com/hyperlocalise/hyperlocalise/blob/main/apps/cli/cmd/sync_hyperlocalise.go#L192-L711) (lines 192, 202, 615, 643, 706, 711)
**Project:** hyperlocalise
**Severity:** HIGH  •  **Confidence:** medium  •  **Slug:** `secrets-exposure`

## Owners

**Suggested assignee:** `140675996+NguyenChHieu@users.noreply.github.com` _(via last-committer)_

## Finding

newHyperlocaliseSyncRuntime takes hyperlocalise.api_base_url from the repository config, trims it, and installs it directly as the HTTP client base URL without parsing, scheme enforcement, host allowlisting, or private-network checks. Subsequent upload/create/download requests send the HYPERLOCALISE_API_KEY-derived x-api-key header to that origin, and push requests also upload source file content. In CI usage where the config comes from the checked-out repository and the API key is injected via environment, a malicious config change can redirect requests to an attacker-controlled or internal HTTP endpoint and receive the secret.

## Recommendation

Validate api_base_url before constructing the client. Default to an allowlisted Hyperlocalise origin, require HTTPS, reject userinfo/query/fragment and private/link-local/loopback hosts outside explicit development mode, and avoid sending API keys to non-allowlisted origins.

## Recent committers (`git log`)

- Chi Hieu Nguyen <140675996+NguyenChHieu@users.noreply.github.com> (2026-05-23)
- Minh Cung <cungminh2710@gmail.com> (2026-05-20)
