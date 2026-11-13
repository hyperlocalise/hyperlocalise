# Translation QA scan diagnostics

## Context

A failed scan used to show the same retry instruction for every cause. The run
already stored an error code, raw exception, and timestamps, but project QA did
not use the code and workspace QA omitted it. Workspace findings came from the
last successful scan, even when a newer scan had failed.

## Decision

Make the run, rather than the findings list, the unit of diagnosis.

- Classify failures as queueing, translation checks, finalization, or a stalled
  run. Keep old `qa_scan_failed` runs as an unknown failure.
- Show a plain-language reason, attempted time, trigger, retry action, and
  copyable run ID on project QA. Keep the code and ID under technical details.
- Show the last completed scan separately and let members open it. Failed runs
  have no reviewable findings.
- Flag projects whose latest scan failed on workspace QA. Date findings using
  each project's last completed scan, so old results cannot appear current.
- Return safe failure codes from go-svc. Keep raw exception messages in the
  database for internal diagnosis and omit them from browser report responses.
- Log the run ID, project ID, failure code, and error type on failure. Never log
  source text, target text, or raw exception messages.

## Engineering triage

Copy the run ID from project QA, then find the matching
`translation-qa-scan` event in application logs. The stored run row has the raw
exception for authorized internal investigation:

```sql
select id, project_id, status, error_code, error_message, started_at, completed_at
from translation_qa_runs
where id = $1;
```

An `qa_scan_stale` code means no page progress was recorded before the lease
expired. `qa_scan_processing_failed` identifies a page/check failure;
`qa_scan_finalization_failed` identifies report completion. The run ID also
links retry attempts to the original failure through the project run history.

## Verification

Cover failed and stale runs, prior successful results, run history actions,
workspace freshness, and the omission of raw exception text. Run the web and
Go repository checks required by `AGENTS.md`.
