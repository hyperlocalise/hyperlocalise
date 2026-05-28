# [BUG] Intent leases are completed using reusable worker IDs

**File:** [`apps/hyperlocalise-web/src/lib/providers/provider-sync-intents.ts`](https://github.com/hyperlocalise/hyperlocalise/blob/main/apps/hyperlocalise-web/src/lib/providers/provider-sync-intents.ts#L192-L307) (lines 192, 198, 248, 252, 271, 278, 303, 307)
**Project:** hyperlocalise
**Severity:** BUG  •  **Confidence:** medium  •  **Slug:** `other-race-condition`

## Owners

**Suggested assignee:** `cungminh2710@gmail.com` _(via last-committer)_

## Finding

claimProviderSyncIntent records only leasedBy as the lease owner, and completeProviderSyncIntent/failProviderSyncIntent authorize completion or failure by matching that same workerId. If a lease expires and the same worker identity later reclaims the intent, a late completion or failure from the previous attempt can still match the row and overwrite the newer attempt's state, clearing the lease or attaching the wrong providerSyncRunId. Existing checks protect against a different workerId, but not reuse of the same workerId across attempts.

## Recommendation

Create a unique lease token or claim attempt ID for every successful claim and require it, along with status running, in complete/fail updates. Avoid using a stable worker identifier as the sole proof of lease ownership.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-05-28)
