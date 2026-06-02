# [MEDIUM] Shared TMS webhook URL relies on provider-local webhook IDs for tenant routing

**File:** [`apps/hyperlocalise-web/src/lib/providers/webhooks/provider-webhook-public-url.ts`](https://github.com/hyperlocalise/hyperlocalise/blob/main/apps/hyperlocalise-web/src/lib/providers/webhooks/provider-webhook-public-url.ts#L20-L27) (lines 20, 27)
**Project:** hyperlocalise
**Severity:** MEDIUM  •  **Confidence:** medium  •  **Slug:** `cross-tenant-id`

## Owners

**Suggested assignee:** `cungminh2710@gmail.com` _(via last-committer)_

## Finding

buildTmsWebhookEndpointUrl returns only /api/webhooks/tms/<providerKind>, so inbound routing depends on a providerWebhookId later supplied in headers, payload, or query string. Tracing the intake path shows findActiveProviderWebhookSubscription looks up active subscriptions by providerKind and providerWebhookId only, without organization, project, provider credential, or a Hyperlocalise-generated globally unique routing token. The database also only enforces uniqueness for providerCredentialId + providerWebhookId, not providerKind + providerWebhookId globally. If a provider's webhook IDs are project- or account-local, two tenants can have the same providerWebhookId; the public handler will select an arbitrary matching active subscription before signature verification. That can cause legitimate signed deliveries for one tenant to be verified against another tenant's secret and dropped, creating cross-tenant denial of service and misrouting risk.

## Recommendation

Include a Hyperlocalise-generated opaque subscription routing token in the callback URL or required header and look up subscriptions by that globally unique token before verification. Alternatively, store and match enough provider context to make the route key globally unique, and add a database uniqueness constraint covering the actual lookup key.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-05-31)
