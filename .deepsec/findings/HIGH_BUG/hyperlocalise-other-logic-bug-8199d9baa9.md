# [HIGH_BUG] Run now only creates a queued manual run that is never dispatched

**File:** [`apps/hyperlocalise-web/src/app/(authenticated)/org/[organizationSlug]/automations/_components/automation-detail-page-content.tsx`](https://github.com/hyperlocalise/hyperlocalise/blob/main/apps/hyperlocalise-web/src/app/(authenticated)/org/[organizationSlug]/automations/_components/automation-detail-page-content.tsx#L105-L120) (lines 105, 112, 120)
**Project:** hyperlocalise
**Severity:** HIGH_BUG  •  **Confidence:** high  •  **Slug:** `other-logic-bug`

## Owners

**Suggested assignee:** `cungminh2710@gmail.com` _(via last-committer)_

## Finding

The Run now action posts a manual run request and reports success when the API returns. Tracing the route shows it only inserts a workspaceAutomationRun with triggerSource manual and status queued. The dispatcher code only links and enqueues scheduled and GitHub-triggered runs; no code path processes queued manual runs. Users can therefore see 'Manual run queued' while the run remains queued forever and no automation work starts.

## Recommendation

Implement a manual-run dispatcher/enqueue path that creates the underlying runnable job and advances run status, or disable the Run now button until manual execution is supported.

## Recent committers (`git log`)

- Minh Cung <cungminh2710@gmail.com> (2026-06-01)
