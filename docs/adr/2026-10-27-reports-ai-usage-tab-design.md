# Reports: the AI usage tab

**Status:** Accepted

Builds on [Reports rework](./2026-10-23-reports-rework-design.md), whose rule for placing each AI call in a task and project (`ai-attribution.ts`) it reuses. No migration and no change to billing's code.

## Context

AI is part of every paid plan, so admins and localization managers need to see where it goes. The Activity tab had a small AI usage section, grouped by one of area or model, with tokens only. It added calls on the workspace's own provider key to calls through Hyperlocalise, and it filed some calls under the wrong area: GitHub commit and pull request reviews under "Other", text read from images as images made.

## Decision

- **Its own tab**, after Time: Activity, Word counts, Time, AI usage, Costs, Cost estimate, Budgets. For `billing:read`, like the rest of Reports. Activity no longer shows AI.
- **Only what billing already records** (`usage_events`). Recording more for each call (who started it, which API key, cached tokens, language) would touch about 30 callers of billing's recorders and is left for its own change.
- **Details.** Each call can be grouped and narrowed by area, feature (billing's `source`, with a plain name for each known one), model, provider (the part of the model id before `/`), channel, key (Hyperlocalise AI, the workspace's own key, or not recorded), project, task and automation (`a.id`, newly exposed by `attributedUsage`). The table groups by one detail and optionally a second, 50 first-level groups a page; the chart stacks the five largest groups per day (per week above 45 days) and the rest as "Other"; the headline numbers compare with the period before.
- **Billing's charge, never an estimate.** Each group shows `amount_usd` summed over calls through our gateway, as Costs does. Calls on the workspace's own key show "Own key" and count apart. A call with no charge recorded (not received yet, failed, or no key type recorded) is counted as "not recorded", never as $0. Images and videos have no charge of their own here. This revises the rework's "tokens only, never money" for AI usage, within its own condition that money comes only from billing.
- **One set of rules for where a call came from.** The area and channel rules are data (`ORIGIN_RULES`, `CHANNEL_RULES` in `ai-usage-origins.ts`); the page's functions and the SQL that groups and filters by them are built from the same rules, and a test checks every named source gives the same answer in both.
- **Corrected placements** (from reading every place that writes a source): GitHub commit and pull request reviews are Review and QA, channel GitHub; answering a person's mention in a GitHub pull request is Assistants and chat, channel GitHub; a connected TMS's "leave a comment" run is Review and QA; reading the text in an image is a call with tokens, not an image made. Three source names no code writes were dropped.
- **API and MCP match the page:** `GET /reports/ai-usage` and `GET /reports?report=ai` take `groupBy`, `thenBy`, the filters and `page`, with `format=csv` for every group; the MCP `get_report` tool takes `report: "ai"` with the same fields.
- **The parent lookup skips token rows.** A token row is only ever a child (`<parent>:ai_tokens`), so `attributedUsage` no longer looks for parents among them. This halves the rows it searches, for Costs and Budgets too.

## Consequences

- On the large benchmark workspace (240,000 AI calls a year), the tab reads in about 0.09 s for 28 days and 0.19 s for 90 days, but about 0.75 s for a year grouped by task, against the 0.2 s mark of the other tabs. The three reads (totals with the period before, table, chart) run side by side; reading the billing rows once for all three was slower (1.3 s), because it lost that and held two years of rows. A daily AI summary table would meet the mark; it needs a migration and a way to see billing's later changes to a row (its charge arrives after the call).
- The channel of `chat_translate_string`, and of translation tasks started from Slack, an automation or an integration, shows App: the source does not say where the call started.
- Changing a source name in billing's callers, or adding one, needs its area and channel set in `ai-usage-origins.ts` and a plain name on the page; an unknown source shows under "Other" with its raw name.

## Alternatives considered

- **Links only, tokens only:** keep the tab without money and link to Costs and the billing page. Chosen against by the user: no tab showed AI money by area, model, task or automation.
- **Grouping in the app after reading every combination:** simpler SQL, but grouping by task over a year would send hundreds of thousands of rows to the app, and paging and filtering by area or channel would have to happen there too.
- **One statement for all three reads:** slower, as above.
