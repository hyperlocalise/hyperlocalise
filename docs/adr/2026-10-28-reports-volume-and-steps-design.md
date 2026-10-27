# Reports: volume per week, time by task step, task run stages

**Status:** Accepted

Builds on [Reports rework](./2026-10-23-reports-rework-design.md) and follows [the AI usage tab](./2026-10-27-reports-ai-usage-tab-design.md). No migration; nothing new is recorded.

## Context

Users asked Reports for "weekly volume per project" and "time spent on each step". After the rework, volume per week was a table only (Word counts grouped by week), the Activity chart stacked finished words by where the text came from rather than by project, and time per step knew two steps, translation and review, so a post-edit task and a proofread task were one "Review" line. Automated run time showed each translation task run as one number from its first event to its last, with nothing about where the time went. The Costs tab also carried "expenses": a US dollar amount typed by hand against a project, from the first Reports (#2244), which no user asked for and no peer platform (Crowdin, Smartling, Lokalise, Phrase) offers.

## Decision

- **Expenses are removed** from the web app: the `POST /reports/expenses` route, the dialog, the Costs card and column and the CSV column. Spent on Costs and Budgets is people's work (`reporting_costs.kind = 'human'`) plus billed AI. The `reporting_costs` table keeps its `expense` kind because go-svc's copy of the old Reports API still writes it; the web app neither writes nor sums such rows.
- **A volume chart on Word counts, grouped by week.** `queryWordCountSeries` (`word-queries.ts`) reads the same daily summary table as the by-week table (by project, or by task when tasks are chosen), one point per Monday-start UTC week from the week of the first day to the last, every week present. The five projects with the most units over the period are series of their own, the rest one "Other" series, as the AI usage chart does. It follows every filter the table follows (arrived or finished, unit, step, language, tasks, project). `readWords` adds it as `series` when `groupBy` is `week`, null otherwise, so `GET /reports/words`, `GET /reports?report=words` and MCP `get_report` carry it; the CSV is unchanged.
- **Time by what each task is for.** Reports keeps `translation` and `review` as the steps it prices and records. A task's own step is worked out from the task (`taskStepSql` in `time-queries.ts`): `post_edit` when a visual workflow stored `workflowTaskStep = 'edit'` in the job's input payload, `proofread` for any other `proofread` or `review` job, `translate` otherwise, and `translate` for a deleted task. "Time on each step" on Activity groups logged time by it (translate, post-edit, proofread, in that order), the Time tab's rows carry it in a "Task step" column beside the pricing step, and both CSVs write `taskStep`. A time entry logged as review on a translate task counts as translate work, since the task is what people spend time on.
- **Task run stages.** `queryTaskRuns` (`time-queries.ts`) pivots each run's boundary events (`job_started`, `context_ready`, `strings_extracted`, the last `translations_reused`, the last `locale_completed` or `locale_failed`, `job_succeeded` or `job_failed`) into preparing, extracting, reusing memory, translating and finishing, each clamped at zero; a run missing a boundary contributes to the stages it has and the rest of its time to "other", so the stages sum to the run total shown before. With a language chosen on Activity, runs that did not include it are left out, reusing memory and translating count that language's events only, the other stages stay whole-run and "other" is zero. The Step times table lists the stages under the run total; the CSV adds a `task_run_stage` row per stage. The Time tab's "Automated time" card still ignores the language, as its note says.

## Consequences

- A project's series is its name now; a renamed project keeps its history under the new name, and a project a viewer cannot open is not in the chart (the scope is the same as the table's).
- Post-edit and proofread still share the `review` rate line and the review half of every analysis; only time views tell them apart. Pricing post-editing differently from proofreading would need a third step through rates, analyses and summaries, with a migration.
- A task's step rests on the job's kind and on `workflowTaskStep`, which only `createWorkflowTaskJob` writes; a task made another way that is for post-editing shows as proofread.
- Stage times are wall-clock between events languages share, so with several languages translating is the slowest language's time, not the sum; with a language chosen it is that language's own.
- `GET /reports/step-times` now takes `targetLocale` into the automated part; `GET /reports/time` does not, so the two can differ for the same dates while a language is chosen.
- Older runs that recorded only `job_started`, `strings_extracted` and the end show their time under "Other".

## Alternatives considered

- **A third pricing step for post-edit:** the full answer to "time per step", but a migration through every Reports table and the rate cards, for a distinction only time views need today.
- **A weekly chart on Activity instead of Word counts:** Activity's chart is by day or week depending on the range and stacks by text source; two stacked charts there would compete. The by-week table already holds the numbers, so the chart sits with it.
- **Keeping expenses with edit and delete added:** finishing a feature nobody asked for; removed instead, with the table kept for the Go copy.
