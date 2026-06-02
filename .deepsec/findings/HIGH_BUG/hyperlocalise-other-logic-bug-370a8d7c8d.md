# [HIGH_BUG] Setup retry can downgrade working webhook subscriptions

**File:** [`apps/hyperlocalise-web/src/lib/providers/webhooks/provider-webhook-subscription-manager.ts`](https://github.com/hyperlocalise/hyperlocalise/blob/main/apps/hyperlocalise-web/src/lib/providers/webhooks/provider-webhook-subscription-manager.ts#L226-L309) (lines 226, 235, 248, 256, 259, 274, 284, 287, 309)
**Project:** hyperlocalise
**Severity:** HIGH_BUG  •  **Confidence:** high  •  **Slug:** `other-logic-bug`

## Owners

**Suggested assignee:** `cungminh2710@gmail.com` _(via last-committer)_

## Finding

ensureProviderWebhookSubscription loads an existing subscription, but it updates the row to manual_required before checking whether an existing active subscription can be reused. If HYPERLOCALISE_PUBLIC_APP_URL is temporarily missing, automatic setup is disabled, provider capabilities change, or an adapter is unavailable, an already active subscription is changed to manual_required. The inbound webhook lookup only accepts status active, so this turns previously working provider deliveries into ignored deliveries even though the remote provider webhook and stored secret may still be valid.

## Recommendation

Check and preserve reusable active subscriptions before any manual/error transition. If setup cannot currently be refreshed, record audit/error metadata separately without changing status from active unless the remote webhook is known invalid or the user explicitly disables it.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-05-31)
