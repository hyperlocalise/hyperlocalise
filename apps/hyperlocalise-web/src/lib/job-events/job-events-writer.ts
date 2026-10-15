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
import { eq } from "drizzle-orm";

import { db, schema } from "@/lib/database/client";

import type { JobEventInput } from "./job-events-contract";

export type RecordJobEventsInput = {
  jobId: string;
  workflowRunId?: string | null;
  actorUserId?: string | null;
  events: JobEventInput[];
};

/**
 * Best-effort: progress is informational, so a failed write is logged and
 * never fails the job or the caller's request.
 */
export async function recordJobEvents(
  input: RecordJobEventsInput,
  database: Pick<typeof db, "transaction"> = db,
): Promise<void> {
  if (input.events.length === 0) {
    return;
  }

  try {
    const workflowRunId = input.workflowRunId ?? null;
    await database.transaction(async (tx) => {
      const [job] = await tx
        .select({
          organizationId: schema.jobs.organizationId,
          workflowRunId: schema.jobs.workflowRunId,
        })
        .from(schema.jobs)
        .where(eq(schema.jobs.id, input.jobId))
        .for("update")
        .limit(1);
      if (!job) {
        return;
      }

      if (workflowRunId !== null && job.workflowRunId !== workflowRunId) {
        console.warn("[job-events] ignored events from stale workflow run", {
          jobId: input.jobId,
          workflowRunId,
          currentWorkflowRunId: job.workflowRunId,
          eventTypes: input.events.map((event) => event.type),
        });
        return;
      }

      await tx.insert(schema.jobEvents).values(
        input.events.map((event) => ({
          jobId: input.jobId,
          organizationId: job.organizationId,
          workflowRunId,
          actorUserId: input.actorUserId ?? null,
          type: event.type,
          locale: event.locale ?? null,
          payload: event.payload,
        })),
      );
    });
  } catch (error) {
    console.warn("[job-events] failed to record job events", {
      jobId: input.jobId,
      eventTypes: input.events.map((event) => event.type),
      error: error instanceof Error ? error.name : "unknown",
    });
  }
}
