# [MEDIUM] Public webhook lookup is not tenant-unique

**File:** [`apps/hyperlocalise-web/src/lib/providers/webhooks/provider-webhook-storage.ts`](https://github.com/hyperlocalise/hyperlocalise/blob/main/apps/hyperlocalise-web/src/lib/providers/webhooks/provider-webhook-storage.ts#L298-L312) (lines 298, 300, 305, 307, 308, 309, 312)
**Project:** hyperlocalise
**Severity:** MEDIUM  •  **Confidence:** medium  •  **Slug:** `cross-tenant-id`

## Owners

**Suggested assignee:** `cungminh2710@gmail.com` _(via last-committer)_

## Finding

The public TMS webhook route resolves an active subscription only by providerKind and providerWebhookId, and this storage helper applies no organizationId or globally unique subscription token. The schema only enforces uniqueness on providerCredentialId + providerWebhookId, so two tenants can store the same provider webhook id for the same provider. Provider ids such as Crowdin webhook ids are provider-side numeric ids and may be scoped to a project/account rather than globally unique. If a malicious or colliding tenant has the same providerWebhookId, deliveries can be resolved to the wrong subscription before signature verification, causing valid victim deliveries to be checked against the wrong secret and dropped, and the 202-vs-401 behavior can also reveal whether a webhook id exists.

## Recommendation

Route inbound webhooks with a locally generated, globally unique subscription identifier or random routing token in the callback URL/header, and look up by that value. Also add a database uniqueness constraint that matches the public routing key, or include an organization-scoped secret token in the endpoint and verify it before selecting a subscription.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-05-31)
