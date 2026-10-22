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
import { sql } from "drizzle-orm";

import { db, type DatabaseClient } from "@/lib/database/client";

import { OPEN_TASK_STATUSES, REPORT_STEPS, type ReportStep } from "./report-units";

/**
 * A task's own pricing for a step (its rate card, time estimate or fixed fee) can change only
 * before work on that step starts, so the work already recorded keeps one price. Work has
 * started once Reports holds a string, a cost of work (not an expense) or logged time for the
 * task and step, deleted ones aside, or the task has ended. Tasks people work on from the start
 * are never queued, so the task's status alone cannot say.
 */

/** The steps of a task whose pricing can no longer change. */
export async function lockedPricingSteps(
  input: { organizationId: string; jobId: string; status: string },
  database: DatabaseClient = db,
): Promise<Set<ReportStep>> {
  if (!OPEN_TASK_STATUSES.has(input.status)) return new Set(REPORT_STEPS);
  const result = await database.execute<{ step: ReportStep }>(sql`
    select s.step from (values ('translation'), ('review')) s(step)
    where exists(select 1 from reporting_analyses a where a.organization_id = ${input.organizationId}
        and a.job_id = ${input.jobId} and a.step = s.step)
      or exists(select 1 from reporting_costs c where c.organization_id = ${input.organizationId}
        and c.job_id = ${input.jobId} and c.step = s.step and c.kind <> 'expense' and not c.voided)
      or exists(select 1 from reporting_time_entries e where e.organization_id = ${input.organizationId}
        and e.job_id = ${input.jobId} and e.step = s.step and not e.voided)
  `);
  return new Set(result.rows.map((row) => row.step));
}
