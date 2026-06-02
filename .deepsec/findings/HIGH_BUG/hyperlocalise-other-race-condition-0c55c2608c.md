# [HIGH_BUG] Concurrent auto write-back reviews can enqueue duplicate write-back runs

**File:** [`apps/hyperlocalise-web/src/lib/providers/agent-runs/tms-agent-automation-runner.ts`](https://github.com/hyperlocalise/hyperlocalise/blob/main/apps/hyperlocalise-web/src/lib/providers/agent-runs/tms-agent-automation-runner.ts#L167-L175) (lines 167, 175)
**Project:** hyperlocalise
**Severity:** HIGH_BUG  •  **Confidence:** high  •  **Slug:** `other-race-condition`

## Owners

**Suggested assignee:** `cungminh2710@gmail.com` _(via last-committer)_

## Finding

maybeEnqueueAutoWriteBackAfterProposalReview checks for an existing active push-approved write-back run and then creates a new run in separate operations. There is no transaction, advisory lock, or unique constraint tying organizationId + hyperlocaliseJobId + push_approved_changes + active status together. If two proposal reviews for the same job race, both can observe no active run and both create/enqueue write-back runs. The write-back worker only skips items already marked uploaded/skipped by previous completed write-back runs, so concurrently running duplicate write-backs can push the same accepted translations to the external TMS twice.

## Recommendation

Make the check-and-create atomic. Use a database transaction with a per-job advisory lock, or add a partial unique index/exclusion mechanism for active push_approved_changes write-back runs and handle conflict by returning the existing run.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-05-31)
