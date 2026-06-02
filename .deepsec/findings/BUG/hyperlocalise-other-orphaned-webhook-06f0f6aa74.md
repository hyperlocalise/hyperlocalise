# [BUG] Created Phrase webhook ID is lost if the callback URL patch fails

**File:** [`apps/hyperlocalise-web/src/lib/providers/adapters/phrase/phrase-webhook-subscription-adapter.ts`](https://github.com/hyperlocalise/hyperlocalise/blob/main/apps/hyperlocalise-web/src/lib/providers/adapters/phrase/phrase-webhook-subscription-adapter.ts#L120-L135) (lines 120, 121, 125, 134, 135)
**Project:** hyperlocalise
**Severity:** BUG  •  **Confidence:** high  •  **Slug:** `other-orphaned-webhook`

## Owners

**Suggested assignee:** `cungminh2710@gmail.com` _(via last-committer)_

## Finding

createRemoteSubscription first creates an active Phrase webhook using the bare endpointUrl, then patches it to append provider_webhook_id. If the create succeeds but the updateWebhook call fails, the catch block maps the error without passing the newly allocated created.id. The shared subscription manager is designed to persist partial providerWebhookId values on adapter failure, but this adapter drops that ID in this path. The result is an active remote webhook that the local subscription still cannot audit, update, disable, or delete; retries may create duplicates, and deliveries from the orphaned webhook may be unroutable because the initial callback URL lacked provider_webhook_id.

## Recommendation

Track created.id across the follow-up PATCH and pass it to mapPhraseError when the PATCH fails. Prefer also attempting best-effort disable/delete of the just-created webhook, or persist the partial providerWebhookId so retry/audit can reconcile it. Add a regression test where POST succeeds and PATCH fails.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-05-31)
