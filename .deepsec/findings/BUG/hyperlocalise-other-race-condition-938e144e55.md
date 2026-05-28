# [BUG] Auto write-back enqueue is not idempotent

**File:** [`apps/hyperlocalise-web/src/lib/providers/tms-agent-automation-runner.ts`](https://github.com/hyperlocalise/hyperlocalise/blob/main/apps/hyperlocalise-web/src/lib/providers/tms-agent-automation-runner.ts#L147-L179) (lines 147, 153, 163, 179)
**Project:** hyperlocalise
**Severity:** BUG  •  **Confidence:** high  •  **Slug:** `other-race-condition`

## Owners

**Suggested assignee:** `cungminh2710@gmail.com` _(via last-committer)_

## Finding

maybeEnqueueAutoWriteBackAfterProposalReview resolves automation settings and then unconditionally creates and enqueues a new push_approved_changes agent run whenever it is called. The review route calls this helper whenever the updated proposal set contains any accepted proposal, not only when a proposal newly transitions to accepted. The write-back worker only skips items after another write-back run has completed and written uploaded/skipped changedItems, so concurrent queued or running write-back runs do not reserve the same accepted proposal items. The agent_runs table also has only indexes, not a uniqueness constraint for one write-back run per organization/job/action. Repeated or concurrent review submissions with auto write-back enabled can therefore enqueue multiple provider write-back workflows for the same accepted proposals, causing duplicate external TMS writes or wasted provider/API work.

## Recommendation

Make write-back enqueue idempotent. For example, create or reuse a write-back run inside a transaction guarded by a unique key over organizationId, hyperlocaliseJobId, and action for active write-back statuses, or lock the job/run set and return an existing queued/running write-back run. Also consider triggering only when proposals newly transition to accepted.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-05-24)
