# Reports: closing the gaps before launch

Date: 2026-11-14

**Status:** Implemented on `feat/reports-gap-closing` (migration `0189_equal_the_twelve`; `0188` on `main` is user preferences), with these differences from the plan below:

- 0a: the service allows 3 Reports queries at once per copy (was 2) and one workspace at most 2, so another workspace always finds a slot.
- 0b: the Reports e2e flow (`src/e2e/flows/reports.e2e.ts`) runs only with `E2E_REPORTS_ENABLED=1`: the WorkOS emulator serves no feature flags, so it needs an environment with `workspace-reports` on.
- 0c: charts draw bars from the day Reports started; the period itself is unchanged, so earlier logged time still counts.
- 1: spend and time per person are read live, as the Costs and Time tabs read them; only words are in `reporting_daily_by_person`. Members see their own row without pay. Post-edit bands are on the Contributors tab and the task Report tab, not the Word counts tab.
- 2: the text a person was given is the latest version before theirs written by someone else (a reviewer is compared with the translator's draft); an approval of the text as given scores 100. A post-edit line pays by memory band when there is no score.
- 3: the quote is an Excel workbook from go-svc; PDF is the browser's print of a quote page, which handles every script, rather than a PDF built in go-svc.
- 4: Reports reads live in `internal/reporting`. go-svc and public-api both import that package. public-api reads PostgreSQL directly (no go-svc proxy, no `GO_SVC_INTERNAL_URL`). go-svc's `POST /internal/reports/{kind}` stays for the MCP `get_report` tool. `reports:read` must still be added to WorkOS Agent Registration's trusted permissions in the dashboard.

## Context

Reports is built and served from go-svc ([Reports reads and writes in go-svc](../adr/2026-10-29-reports-go-svc-design.md)). It is behind the `workspace-reports` flag with no customer users. Compared with what Crowdin and Phrase customers expect, it is already strong on match analysis, rate cards, time, budgets and AI usage. It is missing:

- Words and cost **per person**, which agencies need to pay freelancers. Crowdin calls this Top members and Translation costs; Phrase has per-linguist reports.
- **Post-edit analysis**: pay by how much a person changed the MT or AI text they were given, rather than by memory match. Phrase calls this post-editing analysis; Crowdin calls it pre-translation accuracy.
- A **client quote** from a cost estimate (Phrase quotes).
- **Reports in the public API.** Both Crowdin and Phrase expose reports over REST so customers can feed BI tools and vendor payment systems. Ours are reachable only from the page and the MCP `get_report` tool.
- Two launch blockers in our own design: one Reports admission limit shared by every workspace, and no end-to-end coverage.

Repetitions are already their own paid band on rate cards and in the match table. Only the Word counts chart folds them into "exact" (`reportingBandTierOf` in `apps/go-svc/reporting-words.go`). No work is needed there beyond an optional chart tier.

## Plan

Five phases, each its own pull request (or a short series). Phase 0 gates turning the flag on for the first customer; phases 1 to 4 can follow in any order, but 1 is the one customers will ask about first.

### Phase 0: launch blockers

**0a. Admission limit per workspace** (`apps/go-svc/reporting-safeguards.go`)

- Today at most 2 Reports requests query the database at once per go-svc copy, shared by all workspaces, so one workspace's slow report delays every other.
- Keep the global cap (raise it to what go-svc's pool can bear once its production size is known) and add a cap per workspace of 1 to 2 concurrent reads, keyed by organization id. A request over its workspace cap waits briefly, then answers `report_busy` as today.
- Tests: two workspaces each saturating their cap do not block each other; the global cap still holds.

**0b. End-to-end smoke** (`apps/hyperlocalise-web/e2e`)

- One flow on the local stack: enable the flag for a seeded workspace, create a native task, save a few strings in the editor, run the capture cron route, open Reports and check Activity, Word counts and the task's Report tab show the words; download one CSV.
- One flow for a translator: sees only the Time tab, can log and delete their own time.

**0c. D194**: cap the bars drawn before the workspace's Reports start, as the go-svc ADR leaves open, so a range reaching far back does not draw empty weeks.

**0d. Rollout checklist**: flag on for one design partner; watch go-svc Reports latency and `report_timed_out` rates for a week; confirm summary lag stays under one capture run.

### Phase 1: contributions per person

**Goal.** For a date range, per person: words, strings and characters finished, by step, language, project and match band; how many they kept unchanged; and what they earned, priced as Costs prices it. Plus a CSV a manager can pay from.

**Data.** `reporting_activity.actor_user_id` already records who finished each string, and the summary already reads it (`by_person` in `summary.ts`). Neither daily table keeps the person, so:

- Add `reporting_daily_by_person`: workspace, project, task, actor, source and target language, step, match band, UTC day; finished, finished unchanged (words, strings, characters, characters with spaces); and spent (USD, from the person's `reporting_costs` rows joined by operation key).
- Fill it in `refreshSummaryDays` alongside the other two tables, from the same marks, under the same lock. Bump `SUMMARY_VERSION` so existing workspaces rebuild.
- A deleted user's rows keep the id (`on delete set null` on activity becomes "Deleted member" in the report), as deleted tasks do today.

**Read.** `GET /v1/orgs/{slug}/reports/contributors` in go-svc (new `reporting-contributors.go`), with the usual filters plus `person`; `format=csv`. Add `contributors` to the MCP `get_report` kinds.

**Page.** A **Contributors** tab: one row per person (finished words, unchanged share, logged time, spent), expandable by language and band. Time comes from `reporting_time_entries.contributor_id`, so a row shows words and hours together.

**Access.** `billing:read` as every other tab. Open question: whether a translator sees their own row (their own earnings) the way they see their own time. Recommend yes, earnings hidden until a later setting allows it.

### Phase 2: post-edit analysis

**Goal.** Price a person's edit of MT or AI text by how much they changed it, as Phrase does: compare the text they were given with what they saved, and band the similarity the same way a memory match is banded (100, 95–99, 85–94, 75–84, 50–74, new).

**Data.**

- `editor-save-capture.ts` already finds the text a person was given (the latest version not written by a person) to set `unchanged`. At the same point, compute a similarity score between that text and the saved text: a normalised character edit distance, the same scale the memory matcher uses so the bands mean the same thing. Store `post_edit_score` and `post_edit_bucket` on `reporting_activity`, set only for a save over AI, MT or memory text.
- Add `post_edit_bucket` as a dimension of `reporting_daily_by_person` (phase 1). Leaving the by-task and by-project tables alone keeps their row counts unchanged.

**Pricing.**

- A rate card line gains a `pricing` setting: `memory_match` (today) or `post_edit`. For a `post_edit` line, a person's finished work is priced by `post_edit_bucket` and the same per-band shares, at finish, as Costs does today. Estimates keep using memory match, since the edit is not known in advance; the Cost estimate tab says so for `post_edit` lines.
- Versioning stays as it is: a changed line is a new row.

**Page.** In Word counts, a "Post-edit" split beside "Band" (finished mode only), and post-edit bands on the Contributors tab and the task Report tab.

**Open questions.** Character or word distance (Phrase uses characters; word distance is fairer for CJK-free languages but breaks for CJK). Recommend characters on grapheme clusters, matching `countSourceCharacters`.

### Phase 3: quote export

- From the Cost estimate tab, **Download quote** as XLSX and PDF: workspace name and logo, client and reference fields typed in the dialog, a line per language and step with words per band, rate, share and amount, totals, and a validity date. Nothing stored, as today's estimate.
- Build in go-svc beside the CSV writer (`reporting-csv.go`), so CSV, XLSX and PDF share one row source. XLSX also becomes an option on every tab that has CSV.

### Phase 4: Reports in the public API

**Goal.** A customer with a personal access token (or a registered agent) reads the same reports the page shows, as JSON or CSV, from `https://public-api.hyperlocalise.com/v1/reports/...`, to load into a BI tool or a vendor payment system.

**Where it runs.** `apps/public-api` is a standalone service that reads PostgreSQL directly. Reports queries live in `internal/reporting`, which both go-svc and public-api import:

- public-api calls `reporting.API.Report` as the token's member, so team and project visibility match the page.
- The same safeguards (statement limit, admission caps from phase 0a) run in both services. One customer's nightly export must not hold up everyone's Reports page.
- go-svc keeps `POST /internal/reports/{kind}` for the MCP `get_report` tool, implemented with the same package.

**Scope and access.**

- New PAT scope `reports:read`, mapped to the `billing:read` capability (admins and localization managers), as every report is today. Add it in each place the scope list lives: `apps/go-svc/api-key-permissions.go`, `apps/public-api/permissions.go` (`apiKeyScopeCapability` and `roleAllowsCapability`), `apps/hyperlocalise-web/src/api/routes/api-key/api-key.schema.ts` and `api-key.permissions.ts`, `src/api/auth/policy.ts`, and `go-svc-client.types.ts`; plus the API key dialog's scope picker.
- Add `reports:read` to the WorkOS Agent Registration trusted permissions (the list in the root `AGENTS.md`), so registered agents can claim it.
- The `workspace-reports` flag still gates go-svc's page routes and the MCP internal route (fail closed when WorkOS flags are missing). public-api has no WorkOS client; `reporting.API` with `Flags` unset allows the read so a PAT can still load reports when the page flag is on. A workspace without the flag still gets `403 reports_not_enabled` from go-svc and MCP.

**Endpoints** (all `GET`, the page's query fields: `from`, `to`, `projectId`, `jobId`, `targetLocale`, `step`, `unit`, plus each report's own):

| Endpoint | Page equivalent |
| --- | --- |
| `/v1/reports/activity` | Activity tab |
| `/v1/reports/words` and `/v1/reports/words/series` | Word counts table and chart |
| `/v1/reports/time` | Time tab |
| `/v1/reports/ai-usage` | AI usage tab |
| `/v1/reports/costs` | Costs tab |
| `/v1/reports/budgets` | Budgets tab |
| `/v1/reports/contributors` | Contributors tab (after phase 1) |
| `/v1/tasks/{jobId}/report` | A task's Report tab |

- `Accept: text/csv` or `format=csv` streams the same CSV as the page's download; JSON otherwise.
- Every answer carries `summary.stillUpdating` and the period actually read, so an export job knows whether to retry later.
- Cost estimates stay page-only in v1: they take a task list in the body and are a quoting tool, not a feed.
- Writes (rate cards, budgets, task pricing, time entries) are out of scope for v1. Logging time from an external timesheet tool is the likely v2 ask (`reports:write`).

**Rate limits.** Reports reads are the heaviest queries public-api would serve. Apply public-api's per-token limit, plus a lower per-workspace limit for `/v1/reports/*` (for example 30 requests a minute) in front of the package's admission caps, answering `429` with `Retry-After`.

**Docs and contract.**

- Add the endpoints and schemas to `apps/public-api/openapi.yaml` and the `/docs` page; the answer shapes are go-svc's, written down once there.
- Extend [Reports](../platform/workspace/reports.mdx) with an API section and update the README's capability list.
- Contract tests in public-api with a stub `reportsReader` (scope missing, role without billing, flag off, busy → 503/429, CSV passthrough) and package tests against PostgreSQL.

## Later

Not needed for the first customers; revisit once Reports has users.

- **Currency**: a workspace currency and rate cards in that currency (USD only today). AI spend stays in USD from billing, converted at a stored daily rate for display.
- **Saved and scheduled reports**: a saved view (the URL state already holds it) and a weekly email or Slack post of a saved view.
- **Delivery analytics**: on-time rate and turnaround per task, language and vendor, from job due dates and completion times.
- **Public API writes**: `reports:write` for logging time from external timesheet tools and managing rate cards.
- **Report webhooks**: notify when a period's summary is final, so exports need not poll `stillUpdating`.
- **Quality in Reports**: QA report issue counts and review scores beside volume per person.

## Order and size

| Phase | Size | Blocks launch |
| --- | --- | --- |
| 0a Admission limit per workspace | S | Yes |
| 0b E2E smoke | S | Yes |
| 0c D194 bar cap | XS | No |
| 1 Contributors | L (new summary table, rebuild, read, tab) | No, but the first ask |
| 2 Post-edit analysis | L (capture, pricing, two UI places) | No |
| 3 Quote export | M | No |
| 4 Public API (read) | M (shared package, scope, OpenAPI, limits) | No |

Phase 2 depends on phase 1's table. Phase 4 depends on 0a (admission caps) and ships `/v1/reports/contributors` once phase 1 lands; its other endpoints can go first. Phases 0, 1 and 3 are independent.
