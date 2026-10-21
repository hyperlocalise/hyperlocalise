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
 * Rebuilds Reports' daily summary, or times refreshing it, for local use and speed checks:
 *
 *   vp run reporting:summary rebuild [--organization <id>]
 *   vp run reporting:summary time --organization <id>
 *
 * `rebuild` works out every day again for the chosen workspace, or for every workspace with
 * records. `time` refreshes the busiest project's busiest day, a typical (median) day of it, and
 * its last 28 days, three times each, and prints the medians.
 */
import { sql } from "drizzle-orm";

import { db } from "@/lib/database/client";

import { reportingStart } from "./reporting-start";
import { ensureSummaryBuilt, refreshPendingSummary, refreshSummaryDays } from "./summary";

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

async function main() {
  const command = process.argv[2];
  const organizationId = option("--organization");
  if (command === "rebuild") await rebuild(organizationId);
  else if (command === "time" && organizationId) await time(organizationId);
  else {
    console.error("usage: rebuild [--organization <id>] | time --organization <id>");
    process.exitCode = 1;
  }
  await db.$client.end();
}

await main();
