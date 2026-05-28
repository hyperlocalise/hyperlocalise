# [HIGH] Custom Smartling base URLs can target arbitrary hosts

**File:** [`apps/hyperlocalise-web/src/lib/providers/smartling/smartling-api.ts`](https://github.com/hyperlocalise/hyperlocalise/blob/main/apps/hyperlocalise-web/src/lib/providers/smartling/smartling-api.ts#L287-L1016) (lines 287, 334, 336, 348, 350, 1010, 1016)
**Project:** hyperlocalise
**Severity:** HIGH  •  **Confidence:** high  •  **Slug:** `ssrf`

## Owners

**Suggested assignee:** `cungminh2710@gmail.com` _(via last-committer)_

## Finding

SmartlingApiClient accepts options.authBaseUrl and normalizes it only by parsing as a URL and stripping search/hash/trailing slashes. It does not require HTTPS, restrict Smartling hosts, or block localhost/private/link-local IPs. The client then sends authentication and refresh requests to `${this.authBaseUrl}/authenticate` and `/authenticate/refresh`, including Smartling credentials or refresh tokens. Stored external TMS credentials accept baseUrl with only generic URL validation, and other Smartling sync paths pass that value into this client. The health-check path has private-IP validation, but this client bypasses it, so a provider-credential admin can store an internal or attacker-controlled URL and trigger server-side fetches through sync/content operations.

## Recommendation

Validate provider base URLs at credential upsert and inside SmartlingApiClient. Require HTTPS, allowlist expected Smartling or explicitly approved enterprise hosts, block localhost/private/link-local IPs after DNS resolution, and reuse the existing health-check URL guard for all provider fetch paths.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-05-24)
