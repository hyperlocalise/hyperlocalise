# [BUG] Concurrent webhook setup can create duplicate subscriptions

**File:** [`apps/hyperlocalise-web/src/lib/providers/provider-webhook-subscription-manager.ts`](https://github.com/hyperlocalise/hyperlocalise/blob/main/apps/hyperlocalise-web/src/lib/providers/provider-webhook-subscription-manager.ts#L201-L212) (lines 201, 210, 212)
**Project:** hyperlocalise
**Severity:** BUG  •  **Confidence:** high  •  **Slug:** `other-race-condition`

## Owners

**Suggested assignee:** `cungminh2710@gmail.com` _(via last-committer)_

## Finding

ensureProviderWebhookSubscription first looks up an existing subscription and then inserts a new pending row when none is found. There is no transaction, advisory lock, or unique constraint on the credential/project pair; the schema only uniquely constrains providerCredentialId plus providerWebhookId. Two concurrent setup calls for the same credential and project can both miss the existing row and insert different pending-* webhook IDs. This can produce duplicate UI rows today and, once automatic provider adapters are enabled, can create duplicate remote webhooks and duplicate event deliveries.

## Recommendation

Add a uniqueness guarantee for one subscription per provider credential/project pair, including the null project case, and make setup use INSERT ... ON CONFLICT or a transaction/advisory lock around the lookup and insert.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-05-28)
