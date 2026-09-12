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

Scans run in the API request (or cron tick). Native QA checks are cheap string
comparisons. Concurrent scans on the same project return `409`.

## Non-goals

- Crowdin, Phrase, Smartling, or Lokalise QA
- Calling `go-svc` or Hunspell from the scanner
- Creating issue-sheet rows from findings
- Replacing CAT live validation

## Testing

- Unit tests for each check
- Route tests for start, list, findings, settings, and native-only rejection
- Cron tests for auth and due-project selection
- Navigation tests for the QA item
