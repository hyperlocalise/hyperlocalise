# Reports rework: daily summary, money and the new pages

**Status:** Accepted

Ships in three pull requests: the daily summary (`feat/web-reports-summary`), the read layer and API (`feat/web-reports-read-api`), and the Reports page with a task's Report tab (`feat/web-reports-task-report`). It builds on [Reports capture rework](./2026-10-20-reports-capture-rework-design.md), which records the work this reads. The whole rework is one migration, `0160_reporting_rework`, carried by the first pull request with the final schema; the three deploy together.

## Context

Reports (behind the `workspace-reports` flag, no customer users yet) records words, match bands, completions, logged time and costs. Users asked for word counts per project, language and task by match band, time per task, budgets, and analytics: weekly volume, time per step and AI usage.

- The page was one table over the raw records. Finished-word totals join `reporting_activity` to `reporting_analyses`; for a large workspace (5.4 million analysis rows a year) each section took 2 to 7 seconds.
- Reports priced AI itself with `tokenlens`, which has no prices for the default managed models, while billing already records what each call is charged ([AI spend tracking](./2026-09-01-ai-spend-tracking-design.md)).
- Rates were per word only, and a task's own rate was one rate line used for every language of the task.
- Rollout was one date for every workspace (`reporting_rollout`).

## Decision

### Daily summary

- `reporting_daily_by_task` keeps, per workspace, project, task, source and target language, step, match band, where the finished text came from (`source`: memory, ai, person, import, unknown, or "" on a row that only holds arrivals), payable flag and UTC day: source, arrived, arrived and done, finished, finished by a person, and finished unchanged (a person kept the text they were given), each in words, strings, characters and characters with spaces, plus strings whose units could not be counted. `reporting_daily_by_project` is the same without task, source language and payable. Neither has a unique key, so a task or project deleted with `set null` never collides.
- `reporting_current_by_project` keeps each project's current strings by language, step and match band (the daily rows' arrivals summed over every day, with the project's own source language), rewritten by each refresh of the project, so a whole project can be estimated without reading its days.
- "Arrived" counts the current version of each string; "finished" counts every finished record. Each completion records where its text came from (`reporting_activity.source`) and, for a person's save, whether they kept the text they were given (`unchanged`, from the editor's own version history: the latest version not written by a person against the text saved). A person's save keeps the given text's source when they kept it, else it is their own.
- A task for people (a proofread task, a visual workflow's translate, post-edit or proofread task) runs no agent, so its strings are recorded as arrived when it is created, in a workflow step started off the request (`taskAnalysisWorkflow`), payable, under the step the task is for. A save in the content editor belongs to the newest open task for people covering the string's file, language and step; otherwise to the task that produced the translation.
- **Every write to `reporting_analyses` or `reporting_activity` marks its workspace, project and UTC day in `reporting_summary_queue` in the same transaction** (`markSummaryDays`), bumping the mark's generation. New code that records Reports work must do the same, or the summary silently goes stale.
- `refreshSummaryDays` rebuilds a project's marked days from the raw records in one statement, under an advisory lock that is skipped when busy, and clears a mark only if its generation did not change meanwhile.
- By default the summary refreshes at the end of each capture cron run: capture starts no new work after three minutes, and the refresh uses the time left up to four. `REPORTING_SUMMARY_REFRESH=after_write` refreshes straight after each write instead.
- `ensureSummaryBuilt` queues every day of a workspace whose `reporting_workspaces.summary_version` is not `SUMMARY_VERSION`, for the first build and any later rebuild. `vp run reporting:summary rebuild` and `time` do the same locally.
- `reporting_workspaces.started_at` is each workspace's own Reports start, replacing `reporting_rollout`. Dates on the page start there.
- Each analysis stores characters with and without spaces (grapheme clusters, from `countSourceCharacters`). Rows from before have none and show as "not counted".

### Reading

- Each tab has its own endpoint under `/api/orgs/:organizationSlug/reports`: `activity`, `step-times`, `ai-usage`, `words`, `time`, `costs`, `cost-estimate`, `budgets`, `rate-cards` and `tasks/:jobId/report`, with `format=csv` where a table is shown. They are on the typed API client.
- Days are UTC. A headline number is compared with the previous period of the same length.
- `GET /reports?report=activity|words|time|costs` and the MCP `get_report` tool serve one of the page's reports with that tab's own fields, from the same reads (`report-reads.ts`), plus whether recent work is still being counted (`summary`, `stillUpdating`). The old raw-row report (`queryReport`) and the old page's routes (`/word-counts`, `/tasks/:jobId`, `/tasks/:jobId/match-analysis`, `POST /rates`) are removed.
- A cost estimate is for chosen tasks (1 to 50), or for the whole of one project from its current rows, priced by the project budget's card or the one chosen (a task's own card does not apply there).

### Who sees and changes what

- Reports are for `billing:read`: admins and localization managers. Every report, the public endpoint and the MCP tool refuse other roles. Changing rate cards, budgets, expenses and task pricing needs `billing:write`: admins.
- Other members keep their own time: the Reports page shows them only the Time tab with their own entries (no automated time), and a task's Report tab only the time logged on it; they can log, edit and delete their own entries.

### AI

- AI usage is tokens, calls, images and videos only, never money, by where the AI was called and by model. A billing row's origin is its parent row's `source` (`dimensions.parent_operation_key`), or its own for a one-off call with no parent.
- A charge belongs to a task through its own `job_id`, its parent row's, or the connected TMS run its parent stands for, and then to that task's project only. With no task, it belongs to a project of the workspace recorded in its own or its parent's `dimensions.project_id`, else to its automation's project. An id that is not one of the workspace's projects is ignored: some tools record another system's project id under the same key. `ai-attribution.ts` is the one rule for AI usage and costs.
- AI money comes only from billing: `usage_events` rows with `feature_id = 'ai_tokens'` and `credential_source = 'gateway'`, summing `amount_usd`. Calls on a workspace's own key cost it nothing through us and are left out; rows without an amount yet are counted as pending. Reports' own AI cost rows are no longer priced or summed.

### Money

- **Spent** is people's work and expenses as recorded, priced when the work was recorded, plus billed AI. Each charge counts once: on a task, outside tasks in a project, or, on the workspace's view only, outside any project. A budget's spent is all time.
- **Cost estimate** prices every current string of the chosen tasks (1 to 50) when the page reads it; nothing priced is stored.
- **Still to come** is the unfinished part of open tasks (queued, running, waiting for review) assigned to a person or marked payable, plus payable work outside any task.
- **Rate cards** are named sets of lines, one per language pair and step. Each line has its own basis (per word, per character, per character with spaces or per hour) and paid share per match band; the card has a default basis for new lines. Saving a card adds rows for changed lines and retired rows for removed ones, under a lock per card, so work already recorded keeps its rate. The unavailable band is paid as new.
- **Which card prices work:** the task's own card for the step, else the project budget's card, else the card chosen on the page. The first card found prices every language; a language it has no line for has no rate, with no fallback to the next card.
- **A task's own pricing** (`reporting_task_rates`, per step): a rate card, a time estimate and a fixed fee. The card is taken as it was at `priced_at`, set under the card's lock, so later changes to the card leave the task's prices alone. Pricing can change while the task is open and no work is recorded on that step (an analysis, a cost of work or a time entry; deleted ones aside).
- Hourly lines share the task's time estimate evenly across the task's languages on hourly lines. A language filter leaves fixed fees out.

### Pages

- The Reports page, for the workspace and for each project, has six tabs: Activity, Word counts, Time, Costs, Cost estimate and Budgets. The tab, dates and filters are kept in the address.
- Native tasks get a Report tab: their words, match analysis, time logged and, for `billing:read`, their cost and pricing. Native projects get a Reports link in their sidebar.

## Consequences

- On made-up data for 13 workspaces, a large workspace's reads take 0.01 to 0.27 seconds, against 2 to 7 seconds before. Budgets take 0.16 seconds; their AI spend reads all of a workspace's AI charges, so it grows with the workspace's history.
- By default the page lags the work by up to one capture run (2 to 17 minutes after a save).
- Refreshing rewrites the day's rows. Deleting a user leaves their work counted as a person's until the next rebuild of those days.
- A task for people is analysed a few seconds after it is created; until then its Report tab and estimate show no words. Its untouched strings count in still to come from then on.
- A billed AI call that records no project counts only as AI outside any project.
- `reporting_task_rates.rate_id`, the old single rate line, is no longer read but stays as a column so the rework needs one migration; a later clean-up drops it.
- Local databases that applied the rework's interim migrations are brought in line with `bin/mark-migration-applied.sh` in hl-env, which rewrites Drizzle's bookkeeping only.

## Alternatives considered

- **Better indexes on the raw records.** Sections stayed at 2 to 7 seconds for a large workspace, since every finished-word total joins two large tables.
- **One all-time row per task.** Only 2.6 times fewer rows than the daily rows; most rows differ by language, band and payable flag, not by day.
- **Estimating a whole workspace or project.** 2.2 seconds for a large workspace. The estimate takes chosen tasks, as the design asked.
- **Reports' own AI price estimate.** It had no prices for the default models, and billing's charge is what the customer pays.
- **Falling back to the chosen card when the budget's card lacks a language.** The estimate would show a cost that recorded spending never would.
- **One rate line for all of a task's languages.** Prices every language at one language's rate.
- **Pricing a task only while it is queued.** Tasks people work on from the start are never queued, so they could never be priced.
