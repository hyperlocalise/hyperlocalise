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

## Revalidation

**Verdict:** true-positive

The original file has been refactored to apps/hyperlocalise-web/src/lib/providers/agent-runs/tms-agent-automation-runner.ts, and commit 3a00186e added a mitigation that checks findActivePushApprovedWriteBackAgentRun before creating a new push_approved_changes run. That fixes the unconditional sequential enqueue described in part of the finding: a normal second review submission while a write-back is already queued or running now reuses the active run instead of inserting another one. However, the check is still a non-atomic check-then-insert outside a transaction, and the agent_runs schema has no unique constraint or partial unique index for organizationId, hyperlocaliseJobId, active status, and action. Two authorized reviewers, or two parallel requests from the same reviewer, can both update review state and then both run the active-run lookup before either insert becomes visible, causing two distinct queued write-back agent runs with distinct workflow events. The review route triggers the helper whenever the updated changedItems contain any accepted proposal, not only when a proposal newly transitions to accepted, so repeated concurrent no-op accept submissions are a viable trigger. The worker only skips proposals after it sees uploaded or skipped changedItems from another write-back run; if two write-back workflows start and list job runs before either completes, both see no previous uploaded/skipped marker and both call pushExternalTmsTranslations for the same accepted proposals. The queue layer also keys events by the newly created agentRunId and does not provide a stable job/action idempotency key. Therefore the current code still permits duplicate concurrent external TMS writes despite the partial active-run mitigation.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-05-31)
