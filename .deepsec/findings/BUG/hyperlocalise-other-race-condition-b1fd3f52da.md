# [BUG] Email translation job updates are not bound to the owning workflow run

**File:** [`apps/hyperlocalise-web/src/workflows/steps/translation-job.ts`](https://github.com/hyperlocalise/hyperlocalise/blob/main/apps/hyperlocalise-web/src/workflows/steps/translation-job.ts#L57-L115) (lines 57, 66, 77, 91, 103, 115)
**Project:** hyperlocalise
**Severity:** BUG  •  **Confidence:** high  •  **Slug:** `other-race-condition`

## Owners

**Suggested assignee:** `cungminh2710@gmail.com` _(via last-committer)_

## Finding

The email-specific job step helpers update translation jobs using only jobs.id and jobs.kind. markEmailTranslationJobRunning overwrites workflowRunId, while markEmailTranslationJobSucceeded and markEmailTranslationJobFailed do not check workflowRunId at all before setting terminal state and updating translationJobDetails. Unlike completeFileTranslationJobStep, a duplicated/replayed email workflow or an active workflow that continues after a user marks the job failed can later overwrite the current job state with stale success or failure data.

## Recommendation

Pass the workflowRunId through the email success and failure step inputs, require jobs.workflowRunId to match in all email job state transitions, and only update translationJobDetails after the matching job row was updated. Throw or return a stale-run result when no row matches, mirroring the string/file translation completion helpers.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-05-06)
