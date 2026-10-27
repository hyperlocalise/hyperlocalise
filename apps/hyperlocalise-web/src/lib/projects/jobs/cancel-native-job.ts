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
import { and, eq, inArray, notExists, type SQL } from "drizzle-orm";

import { enqueueJobCancelledActivity } from "@/lib/activity-log/job-automation-events";
import { db, schema, type DatabaseClient } from "@/lib/database/client";
import { recordJobEvents } from "@/lib/job-events/job-events-writer";
import { err, ok, type Result } from "@/lib/primitives/result/results";
import { captureJobStatus } from "@/lib/reporting/capture";

// waiting_for_review is included so native proofread jobs (and review-gated
// translation jobs) can be cancelled — they count toward the open-job budget
// and otherwise have no completion path.
export const CANCELLABLE_JOB_STATUSES = ["queued", "running", "waiting_for_review"] as const;

export type CancelNativeJobError = { code: "job_not_found" } | { code: "job_action_unavailable" };

/**
 * Cancels an open native job. Provider mirrors are excluded: a local cancel
 * would leave the remote task active until the next sync overwrites it.
 */
export async function cancelNativeJob(input: {
  organizationId: string;
  jobId: string;
  actorUserId: string;
  accessWhere: SQL | undefined;
  database?: DatabaseClient;
}): Promise<Result<{ id: string }, CancelNativeJobError>> {
  const database = input.database ?? db;

  const [cancelled] = await database
    .update(schema.jobs)
    .set({
      status: "cancelled",
      workflowRunId: null,
      lastError: null,
      outcomePayload: {
        code: "cancelled_by_user",
        message: "Cancelled by user",
      },
      completedAt: new Date(),
    })
    .where(
      and(
        eq(schema.jobs.id, input.jobId),
        input.accessWhere,
        inArray(schema.jobs.status, [...CANCELLABLE_JOB_STATUSES]),
        notExists(
          database
            .select({ jobId: schema.externalJobDetails.jobId })
            .from(schema.externalJobDetails)
            .where(eq(schema.externalJobDetails.jobId, schema.jobs.id)),
        ),
      ),
    )
    .returning({ id: schema.jobs.id, kind: schema.jobs.kind });

  if (!cancelled) {
    const [existing] = await database
      .select({ id: schema.jobs.id })
      .from(schema.jobs)
      .where(and(eq(schema.jobs.id, input.jobId), input.accessWhere))
      .limit(1);

    return err({ code: existing ? "job_action_unavailable" : "job_not_found" });
  }

  await recordJobEvents({
    jobId: cancelled.id,
    actorUserId: input.actorUserId,
    events: [{ type: "job_cancelled", payload: {} }],
  });

  await enqueueJobCancelledActivity({
    actorCredentialId: null,
    actorKind: "user",
    actorUserId: input.actorUserId,
    jobId: cancelled.id,
    kind: cancelled.kind,
    organizationId: input.organizationId,
    status: "cancelled",
  });

  // Reports: the task's unfinished strings leave its project's Progress. Never throws.
  await captureJobStatus({
    jobId: cancelled.id,
    status: "cancelled",
    operationKey: `cancel:${cancelled.id}`,
  });

  return ok({ id: cancelled.id });
}
