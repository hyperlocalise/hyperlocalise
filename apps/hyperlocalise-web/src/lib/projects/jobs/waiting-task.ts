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
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { schema, type DatabaseClient } from "@/lib/database/client";
import { updateJobs } from "@/lib/job-change-events/job-writes";

/**
 * A post-edit or proofread task can come after another job (`jobs.after_job_id`). Until that job
 * is finished the task waits: it is `queued`, which nothing starts for a proofread job, so it
 * cannot be marked done. It opens (`waiting_for_review`) when the earlier job is marked done or
 * cancelled, at the next run of `openWaitingTasks`; a failed job leaves it waiting. A translate task cannot wait, because Retry starts
 * the AI on a queued translation job. The Go public API creates such tasks by the same rules in
 * `apps/public-api/jobs-create-store.go`: keep the two in step.
 */

/** Statuses of the earlier job that open the tasks waiting for it. */
export const OPENING_JOB_STATUSES = ["succeeded", "cancelled"] as const;

function opensWaitingTasks(status: string): boolean {
  return (OPENING_JOB_STATUSES as readonly string[]).includes(status);
}

/**
 * The status a new task that comes after `afterJobId` starts in, or null when that job is not in
 * the project. If the earlier job finishes just after this read, the task starts waiting and the
 * next run of `openWaitingTasks` opens it.
 */
export async function statusForTaskAfter(
  database: DatabaseClient,
  input: { organizationId: string; projectId: string; afterJobId: string },
): Promise<"queued" | "waiting_for_review" | null> {
  const [earlier] = await database
    .select({ status: schema.jobs.status })
    .from(schema.jobs)
    .where(
      and(
        eq(schema.jobs.id, input.afterJobId),
        eq(schema.jobs.organizationId, input.organizationId),
        eq(schema.jobs.projectId, input.projectId),
      ),
    )
    .limit(1);
  if (!earlier) {
    return null;
  }
  return opensWaitingTasks(earlier.status) ? "waiting_for_review" : "queued";
}

/** How many waiting tasks one sweep opens; the rest open on the next. */
const OPEN_WAITING_TASKS_BATCH = 500;

/**
 * Opens every waiting task whose earlier job is now marked done or cancelled. Run once a minute
 * with the job change events, whichever service finished the earlier job; safe to repeat, and a
 * task missed by one run is found by the next. Each opened task records its own status change, so
 * webhooks and Job changed workflows hear that it can start. Returns how many it opened.
 */
export async function openWaitingTasks(
  database: DatabaseClient,
  input: { organizationId?: string } = {},
): Promise<number> {
  const earlier = alias(schema.jobs, "earlier_job");
  const ready = await database
    .select({ id: schema.jobs.id })
    .from(schema.jobs)
    .innerJoin(earlier, eq(earlier.id, schema.jobs.afterJobId))
    .where(
      and(
        isNotNull(schema.jobs.afterJobId),
        eq(schema.jobs.status, "queued"),
        eq(schema.jobs.kind, "proofread"),
        inArray(earlier.status, [...OPENING_JOB_STATUSES]),
        input.organizationId ? eq(schema.jobs.organizationId, input.organizationId) : undefined,
      ),
    )
    .limit(OPEN_WAITING_TASKS_BATCH);
  if (ready.length === 0) {
    return 0;
  }
  // The update checks the status again: a task cancelled since the read stays cancelled.
  const opened = await updateJobs(database, {
    set: { status: "waiting_for_review" },
    where: and(
      inArray(
        schema.jobs.id,
        ready.map((task) => task.id),
      ),
      eq(schema.jobs.status, "queued"),
    ),
    returning: { id: schema.jobs.id },
  });
  return opened.length;
}
