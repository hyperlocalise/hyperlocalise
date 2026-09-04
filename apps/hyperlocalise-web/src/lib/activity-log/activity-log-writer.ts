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
import "server-only";

import { randomUUID } from "node:crypto";

import { start } from "workflow/api";

import { createLogger, type Logger } from "@/lib/log";
import {
  assertSafeActivityLogPayload,
  type ActivityLogEventInput,
  type ActivityLogEnqueueError,
  type ActivityLogWorkflowEvent,
} from "@/lib/activity-log/activity-log-contract";
import { mapWithConcurrency } from "@/lib/primitives/map-with-concurrency/map-with-concurrency";
import { err, ok, type Result } from "@/lib/primitives/result/results";

const logger = createLogger("activity-log-writer");

export type ActivityLogWriterLogger = Pick<Logger, "error">;

export type ActivityLogWriterOptions = {
  correlationId?: string;
  logger?: ActivityLogWriterLogger;
};

function logWriteFailure(
  log: ActivityLogWriterLogger,
  input: ActivityLogEventInput,
  correlationId: string,
  failure: "payload_validation" | "workflow_enqueue",
): void {
  log.error(
    {
      correlationId,
      eventType: input.eventType,
      failure,
      organizationId: input.organizationId,
      targetId: input.targetId,
      targetKind: input.targetKind,
    },
    "workspace activity log enqueue failed",
  );
}

export type ActivityLogEnqueueRecord = {
  createdAt: Date;
  id: string;
};

/** Enqueues one validated activity event without writing to the database. */
export async function enqueueActivityLogEvent(
  input: ActivityLogEventInput,
  options: ActivityLogWriterOptions = {},
): Promise<Result<ActivityLogEnqueueRecord, ActivityLogEnqueueError>> {
  const correlationId = options.correlationId ?? randomUUID();
  const log = options.logger ?? logger;

  try {
    assertSafeActivityLogPayload(input.payload);
  } catch {
    logWriteFailure(log, input, correlationId, "payload_validation");
    return err({ code: "activity_log_enqueue_failed" });
  }

  try {
    const event: ActivityLogWorkflowEvent = {
      ...input,
      createdAt: new Date().toISOString(),
      id: randomUUID(),
    };
    const { activityLogWorkflow } = await import("@/workflows/activity-log");
    await start(activityLogWorkflow, [event]);

    return ok({ createdAt: new Date(event.createdAt), id: event.id });
  } catch {
    logWriteFailure(log, input, correlationId, "workflow_enqueue");
    return err({ code: "activity_log_enqueue_failed" });
  }
}

/** Enqueues a bounded number of activity events without blocking on delivery. */
export async function enqueueActivityLogEvents(
  inputs: ActivityLogEventInput[],
  options: ActivityLogWriterOptions = {},
): Promise<Array<Result<ActivityLogEnqueueRecord, ActivityLogEnqueueError>>> {
  return mapWithConcurrency(inputs, 5, (input) => enqueueActivityLogEvent(input, options));
}
