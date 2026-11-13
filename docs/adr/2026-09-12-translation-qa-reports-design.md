# Translation QA reports

## Date

2026-09-12

## Context

CAT validates one segment at a time in the browser through `go-svc`. Those checks
are advisory and never stored. Teams have no project-wide view of empty targets,
same-as-source copy, glossary misses, or length failures unless they open every
string.

Provider job QA (`review_with_agent` / `hl check` in a sandbox) is deprecated and
ignored. This design covers native projects only. Provider project APIs return
`400 qa_scan_not_supported`, and provider projects do not appear in workspace QA
or project navigation.

## Decision

Add persisted QA scans for native projects and a QA dashboard that reads those
scans.

1. **Engine.** Reuse the CAT QA rules in TypeScript: `not_localized`,
   `whitespace_only`, `same_as_source`, `escaped_char_mismatch`, `maxLength`,
   simple placeholder parity, and attached glossary terms. CAT live validation
   stays in the editor.
2. **Storage.** `translation_qa_runs` holds one scan. `translation_qa_findings`
   holds failing and warning checks. Each native project stores
   `qa_scan_cadence` (`off` | `daily`) and `qa_scan_last_run_at`.
3. **Trigger.** A member with `jobs:create` can run a scan from the project QA
   page. A daily cron starts due scans for projects with `daily` cadence.
4. **Dashboard.** Project QA shows the latest summary, findings, run history,
   a run button, and the schedule toggle. Workspace QA lists the latest native
   scan per project.
5. **CAT merge.** The editor loads the latest succeeded scan for the open
   locale and shows those findings immediately when the target text still
   matches the scan snapshot. Live go-svc / glossary checks then merge in and
   win on overlapping families. Scan findings remain when go-svc is unavailable.

Scans start from visible keys crossed with the project's target locales and
left-join stored translations. A missing translation row is an empty target, so
untouched locales still produce `not_localized` findings.

Scans run as a Vercel Workflow. The API or cron tick claims a `running` row,
starts the workflow, and returns. Each workflow step scans one page of keys so
a large project can outlive a single serverless request. Concurrent scans on
the same project return `409`. A partial unique index allows only one `running`
scan per project. Running rows with no page progress for thirty minutes are
marked failed so a dead workflow cannot block later scans. Local development
runs the scan inline when Workflow World is unavailable.

## Non-goals

- Crowdin, Phrase, Smartling, or Lokalise QA
- Calling `go-svc` or Hunspell from the scanner
- Creating issue-sheet rows from findings
- Replacing CAT live validation

## Testing

- Unit tests for each check
- Route tests for start, list, findings, settings, CAT latest-findings, and native-only rejection
- Cron tests for auth and due-project selection
- Route test that enqueueing the workflow returns a running report without waiting
- Navigation tests for the QA item
- Unit tests for mapping scan findings onto CAT checks and merging live + scan results
