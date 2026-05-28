# [BUG] Missing webhook event can leave a claimed sync intent running

**File:** [`apps/hyperlocalise-web/src/lib/providers/provider-sync-intent-worker.ts`](https://github.com/hyperlocalise/hyperlocalise/blob/main/apps/hyperlocalise-web/src/lib/providers/provider-sync-intent-worker.ts#L36-L84) (lines 36, 74, 76, 77, 84)
**Project:** hyperlocalise
**Severity:** BUG  •  **Confidence:** medium  •  **Slug:** `other-stale-event-reference`

## Owners

**Suggested assignee:** `cungminh2710@gmail.com` _(via last-committer)_

## Finding

`processProviderSyncIntent` claims the intent, then marks all referenced webhook events as `processing` before entering its `try` block. `updateProviderWebhookEventProcessingStatus` throws when an event no longer exists. Because intent event references are JSON strings rather than foreign keys, deleting a provider credential or subscription can cascade-delete webhook events while leaving queued intents behind. A worker processing that intent will throw before `failProviderSyncIntent` runs, leaving the intent in `running` until lease expiry and potentially repeating indefinitely.

## Recommendation

Move the initial event status updates inside the failure-handled block or make missing event updates best-effort. Consider cleaning up pending intents when subscriptions are deleted, or replacing JSON event references with enforceable relationships.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-05-28)
