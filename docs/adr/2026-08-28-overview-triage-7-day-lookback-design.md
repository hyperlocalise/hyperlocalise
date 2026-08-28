# Overview triage: last 7 days only

## Problem

Project Overview **Needs you now** listed every triage-eligible job (review,
failed, queued, running), including work that had not changed in weeks. The
queue should stay a current action list, not a backlog.

## Decision

When `triage=true` (native Overview) or when selecting Overview jobs on the
client (TMS), keep only jobs whose `updatedAt` is within the last 7 days.

- Use `updatedAt`, not `createdAt`, so a job created earlier still appears if
  it entered review or failed recently.
- Apply the window before triage ranking and the existing cap of 5.
- Leave the Jobs page and non-triage list queries unchanged.

## Out of scope

- Configurable lookback
- Filtering by `createdAt`
- Workspace dashboard UI changes (the shared `triage` query uses the same
  window if callers pass `triage=true`)
