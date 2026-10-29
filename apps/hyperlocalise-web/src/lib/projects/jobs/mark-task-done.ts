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
import { and, eq, inArray, isNotNull, isNull, ne, notExists, or, type SQL } from "drizzle-orm";

import { db, schema, type DatabaseClient } from "@/lib/database/client";
import { recordJobEvents } from "@/lib/job-events/job-events-writer";
import { err, ok, type Result } from "@/lib/primitives/result/results";
import { captureJobStatus } from "@/lib/reporting/capture";

/** Kinds of task a person works through in the editor; nothing else finishes them. */
export const PERSON_TASK_KINDS = ["proofread", "translation"] as const;

export type MarkTaskDoneError =
  | { code: "job_not_found" }
  | { code: "job_action_unavailable" }
  | { code: "not_task_assignee" };

/**
 * Marks a task for people done: an open proofread, post-edit or translation task waiting
 * on a person. Agent jobs and provider mirrors finish on their own and are excluded.
 * Reviewers and managers may finish any such task; anyone else only a task assigned to them.
 */
export async function markTaskDone(input: {
  organizationId: string;
  jobId: string;
  actorUserId: string;
  actorMayFinishAnyTask: boolean;
  accessWhere: SQL | undefined;
  database?: DatabaseClient;
}): Promise<Result<{ id: string }, MarkTaskDoneError>> {
  const database = input.database ?? db;

  const [done] = await database
    .update(schema.jobs)
    .set({
      status: "succeeded",
      lastError: null,
      // No message: lists show an outcome message as a failure reason.
      outcomePayload: { code: "marked_done_by_user" },
      completedAt: new Date(),
    })
    .where(
      and(
        eq(schema.jobs.id, input.jobId),
        eq(schema.jobs.organizationId, input.organizationId),
        input.accessWhere,
        input.actorMayFinishAnyTask ? undefined : eq(schema.jobs.ownerUserId, input.actorUserId),
        eq(schema.jobs.status, "waiting_for_review"),
        inArray(schema.jobs.kind, [...PERSON_TASK_KINDS]),
        or(isNull(schema.jobs.assigneeType), ne(schema.jobs.assigneeType, "agent")),
        notExists(
          database
            .select({ jobId: schema.externalJobDetails.jobId })
            .from(schema.externalJobDetails)
            .where(eq(schema.externalJobDetails.jobId, schema.jobs.id)),
        ),
        // A job that produced files keeps them: its outcome payload is not overwritten.
        notExists(
          database
            .select({ jobId: schema.translationJobDetails.jobId })
            .from(schema.translationJobDetails)
            .where(
              and(
                eq(schema.translationJobDetails.jobId, schema.jobs.id),
                isNotNull(schema.translationJobDetails.outcomeKind),
              ),
            ),
        ),
      ),
    )
    .returning({ id: schema.jobs.id });

  if (!done) {
    const [existing] = await database
      .select({
        ownerUserId: schema.jobs.ownerUserId,
        status: schema.jobs.status,
        kind: schema.jobs.kind,
        assigneeType: schema.jobs.assigneeType,
      })
      .from(schema.jobs)
      .where(
        and(
          eq(schema.jobs.id, input.jobId),
          eq(schema.jobs.organizationId, input.organizationId),
          input.accessWhere,
        ),
      )
      .limit(1);

    if (!existing) {
      return err({ code: "job_not_found" });
    }

    const isOpenPersonTask =
      existing.status === "waiting_for_review" &&
      (PERSON_TASK_KINDS as readonly string[]).includes(existing.kind) &&
      existing.assigneeType !== "agent";
    return err({
      code:
        isOpenPersonTask &&
        !input.actorMayFinishAnyTask &&
        existing.ownerUserId !== input.actorUserId
          ? "not_task_assignee"
          : "job_action_unavailable",
    });
  }

  await recordJobEvents({
    jobId: done.id,
    actorUserId: input.actorUserId,
    events: [{ type: "job_marked_done", payload: {} }],
  });

  // Reports charges the task's fixed fee and stops matching later saves to it. The status
  // must already be succeeded when this runs. Never throws.
  await captureJobStatus({
    jobId: done.id,
    status: "succeeded",
    operationKey: `done:${done.id}`,
  });

  return ok({ id: done.id });
}
