# [MEDIUM] Unvalidated AWS region controls the Bedrock request host

**File:** [`internal/i18n/translator/provider_bedrock.go`](https://github.com/hyperlocalise/hyperlocalise/blob/main/internal/i18n/translator/provider_bedrock.go#L26-L187) (lines 26, 28, 36, 41, 68, 72, 186, 187)
**Project:** hyperlocalise
**Severity:** MEDIUM  •  **Confidence:** medium  •  **Slug:** `go-ssrf`

## Owners

**Suggested assignee:** `cungminh2710@gmail.com` _(via last-committer)_

## Finding

`AWS_REGION` / `AWS_DEFAULT_REGION` is interpolated directly into `https://bedrock-runtime.${region}.amazonaws.com` and then used for a signed HTTP request. The CLI loads project `.env` values before commands when an env var is not already set, so a malicious project can set a value such as `attacker.com:443/x`; that makes the request host `bedrock-runtime.attacker.com:443` while the `.amazonaws.com` suffix becomes part of the path. The signed Bedrock request body, access key id in the Authorization header, and optional session token header would be sent to an attacker-controlled HTTPS host.

## Recommendation

Validate the region against AWS region syntax or an SDK-maintained allowlist before building the endpoint, reject URL metacharacters such as `:`, `/`, `?`, `#`, and `@`, or use the AWS SDK Bedrock Runtime endpoint resolver instead of manual URL construction.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-04-26)
- Muen Yu <22992947+MuenYu@users.noreply.github.com> (2026-03-03)
