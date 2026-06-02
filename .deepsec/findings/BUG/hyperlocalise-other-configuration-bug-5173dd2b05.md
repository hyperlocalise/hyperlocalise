# [BUG] Configured Smartling base URL is ignored during webhook subscription setup

**File:** [`apps/hyperlocalise-web/src/lib/providers/adapters/smartling/smartling-webhook-subscription-adapter.ts`](https://github.com/hyperlocalise/hyperlocalise/blob/main/apps/hyperlocalise-web/src/lib/providers/adapters/smartling/smartling-webhook-subscription-adapter.ts#L22-L83) (lines 22, 23, 83)
**Project:** hyperlocalise
**Severity:** BUG  •  **Confidence:** high  •  **Slug:** `other-configuration-bug`

## Owners

**Suggested assignee:** `cungminh2710@gmail.com` _(via last-committer)_

## Finding

ProviderWebhookSubscriptionAdapterContext carries baseUrl, but createSmartlingClient constructs SmartlingApiClient with only credentials and fetchFn, and resolveAccountUid calls resolveSmartlingAccountUid without authBaseUrl. Automatic webhook list/create/update/disable/delete and account UID resolution therefore use the default Smartling API host instead of the stored endpoint, which can break webhook setup and audit for custom Smartling environments.

## Recommendation

Pass authBaseUrl: context.baseUrl ?? undefined when constructing SmartlingApiClient and when calling resolveSmartlingAccountUid. Add tests asserting webhook setup uses a non-null baseUrl.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-05-31)
