/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
/**
 * Rebuilds Reports' daily summary, or times refreshing it or reading it, for local use and speed
 * checks:
 *
 *   vp run reporting:summary rebuild [--organization <id>]
 *   vp run reporting:summary time --organization <id>
 *   vp run reporting:summary reads --organization <id>
 *
 * `rebuild` works out every day again for the chosen workspace, or for every workspace with
 * records. `time` refreshes the busiest project's busiest day, a typical (median) day of it, and
 * its last 28 days, three times each, and prints the medians. `reads` runs each of the Reports
 * page's reads for the whole workspace once, then three more times, and prints the first run and
 * the median of the rest, in milliseconds.
 */
import { sql } from "drizzle-orm";

import { db } from "@/lib/database/client";

import { queryAiUsage } from "./ai-usage";
import { queryBudgets, queryCostEstimate, queryCosts, queryStillToCome } from "./cost-queries";
import { listRateCards } from "./rate-cards";
import { addDays, resolvePeriod } from "./report-period";
import { reportingStart } from "./reporting-start";
import { ensureSummaryBuilt, refreshPendingSummary, refreshSummaryDays } from "./summary";
import { queryAutomatedTime, queryLoggedTime, queryLoggedTimeBySteps } from "./time-queries";
import {
  queryActivity,
  queryFinishedByLanguage,
  queryFinishedSeries,
  queryTaskWords,
  queryWordCounts,
} from "./word-queries";

function option(name: string) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

async function seconds<T>(run: () => Promise<T>): Promise<[T, number]> {
  const started = performance.now();
  const result = await run();
  return [result, Math.round(performance.now() - started) / 1000];
}

async function rebuild(organizationId: string | undefined) {
  const scope = organizationId ? sql`where organization_id = ${organizationId}` : sql``;
  // Workspaces with records from before the start was kept per workspace have no row yet.
  const workspaces = await db.execute<{ organizationId: string }>(
    sql`select distinct organization_id as "organizationId" from reporting_analyses ${scope}`,
  );
  for (const workspace of workspaces.rows) await reportingStart(workspace.organizationId);
  await db.execute(sql`update reporting_workspaces set summary_version = null ${scope}`);
  const organizationIds = organizationId ? [organizationId] : undefined;
  const [queued, queueSeconds] = await seconds(() => ensureSummaryBuilt({ organizationIds }));
  const [refreshed, refreshSeconds] = await seconds(() =>
    refreshPendingSummary({ organizationIds }),
  );
  console.log(
    JSON.stringify({ workspaces: queued, queueSeconds, ...refreshed, refreshSeconds }, null, 2),
  );
}

async function time(organizationId: string) {
  const days = (
    await db.execute<{ projectId: string; day: string; rows: number }>(sql`
      select project_id as "projectId", (created_at at time zone 'UTC')::date::text as day,
        count(*)::integer as rows
      from reporting_analyses where organization_id = ${organizationId}
        and project_id = (
          select project_id from reporting_analyses
          where organization_id = ${organizationId} and project_id is not null
          group by project_id order by count(*) desc limit 1
        )
      group by 1, 2 order by count(*) desc
    `)
  ).rows;
  const busiest = days[0];
  if (!busiest) throw new Error("the workspace has no records");
  const typical = days[Math.floor(days.length / 2)]!;
  const lastDays = Array.from({ length: 28 }, (_, offset) => {
    const at = new Date(`${busiest.day}T00:00:00Z`);
    at.setUTCDate(at.getUTCDate() - offset);
    return at.toISOString().slice(0, 10);
  });
  const median = async (days: string[]) => {
    const runs: number[] = [];
    for (let run = 0; run < 3; run += 1) {
      const [, taken] = await seconds(() =>
        refreshSummaryDays({ organizationId, projectId: busiest.projectId, days }),
      );
      runs.push(taken);
    }
    return runs.sort((left, right) => left - right)[1];
  };
  console.log(
    JSON.stringify(
      {
        busiestDay: busiest,
        busiestDaySeconds: await median([busiest.day]),
        typicalDay: typical,
        typicalDaySeconds: await median([typical.day]),
        twentyEightDaysSeconds: await median(lastDays),
      },
      null,
      2,
    ),
  );
}

async function reads(organizationId: string) {
  const projectIds = (
    await db.execute<{ id: string }>(sql`
      select distinct project_id as id from reporting_daily_by_project
      where organization_id = ${organizationId}
    `)
  ).rows.map((row) => row.id);
  const largest = (
    await db.execute<{ projectId: string; jobId: string }>(sql`
      select project_id as "projectId", job_id as "jobId" from reporting_daily_by_task
      where organization_id = ${organizationId} and job_id is not null
      group by 1, 2 order by sum(arrived_strings) desc limit 50
    `)
  ).rows;
  const busiest = largest[0];
  if (!busiest) throw new Error("the workspace has no summary rows");
  const today = new Date().toISOString().slice(0, 10);
  const period = (days: number) =>
    resolvePeriod({ from: addDays(today, -(days - 1)), today, startedDay: "2000-01-01" });
  const scope = { organizationId, projectIds, period: period(28) };
  const rateCardName = (await listRateCards(organizationId))[0]?.name ?? null;
  const words = { unit: "words" as const, step: "translation" as const };
  const table = { ...scope, ...words, page: 1 };
  const timings: Record<string, { firstMs: number; medianMs: number }> = {};
  const measure = async (name: string, run: () => Promise<unknown>) => {
    const runs: number[] = [];
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const [, taken] = await seconds(run);
      runs.push(Math.round(taken * 1000));
    }
    const rest = runs.slice(1).sort((left, right) => left - right);
    timings[name] = { firstMs: runs[0], medianMs: rest[1] };
  };
  await measure("activity, 28 days", () => queryActivity({ ...scope, unit: "words" }));
  await measure("activity, a year", () =>
    queryActivity({ ...scope, period: period(365), unit: "words" }),
  );
  await measure("finished per day, 28 days", () => queryFinishedSeries({ ...scope, ...words }));
  await measure("finished per week, a year", () =>
    queryFinishedSeries({ ...scope, ...words, period: period(365) }),
  );
  await measure("finished by language", () => queryFinishedByLanguage({ ...scope, ...words }));
  await measure("word counts by project, arrived", () =>
    queryWordCounts({ ...table, mode: "arrived", groupBy: "project" }),
  );
  await measure("word counts by task, arrived, one page", () =>
    queryWordCounts({ ...table, mode: "arrived", groupBy: "task" }),
  );
  await measure("word counts by task, finished, one page", () =>
    queryWordCounts({ ...table, mode: "finished", groupBy: "task" }),
  );
  await measure("word counts by task, 90 days, one page", () =>
    queryWordCounts({ ...table, period: period(90), mode: "arrived", groupBy: "task" }),
  );
  await measure("word counts by task, a year, one page", () =>
    queryWordCounts({ ...table, period: period(365), mode: "arrived", groupBy: "task" }),
  );
  await measure("busiest task's words", () =>
    queryTaskWords({ organizationId, jobId: busiest.jobId, unit: "words" }),
  );
  await measure("cost estimate, busiest task", () =>
    queryCostEstimate({ ...scope, ...words, jobIds: [busiest.jobId], rateCardName }),
  );
  // The most tasks a person can choose.
  await measure("cost estimate, 50 largest tasks", () =>
    queryCostEstimate({
      ...scope,
      ...words,
      jobIds: largest.map((task) => task.jobId),
      rateCardName,
    }),
  );
  await measure("still to come, whole workspace", () =>
    queryStillToCome({ organizationId, projectIds, rateCardName }),
  );
  await measure("budgets", () => queryBudgets({ organizationId, projectIds }));
  await measure("costs, 28 days", () => queryCosts({ ...scope, includeUnattributed: true }));
  await measure("logged time, one page", () => queryLoggedTime({ ...scope, page: 1 }));
  await measure("logged time by step", () => queryLoggedTimeBySteps(scope));
  await measure("automated time", () =>
    queryAutomatedTime({ ...scope, includeUnattributed: true }),
  );
  await measure("AI usage, 28 days", () => queryAiUsage({ ...scope, includeUnattributed: true }));
  console.log(JSON.stringify({ projects: projectIds.length, busiest, timings }, null, 2));
}

async function main() {
  const command = process.argv[2];
  const organizationId = option("--organization");
  if (command === "rebuild") await rebuild(organizationId);
  else if (command === "time" && organizationId) await time(organizationId);
  else if (command === "reads" && organizationId) await reads(organizationId);
  else {
    console.error(
      "usage: rebuild [--organization <id>] | time --organization <id> | reads --organization <id>",
    );
    process.exitCode = 1;
  }
  await db.$client.end();
}

await main();
