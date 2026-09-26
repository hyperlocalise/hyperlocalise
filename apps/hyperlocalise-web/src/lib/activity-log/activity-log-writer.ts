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

import { SendMessageCommand, SQSClient } from "@aws-sdk/client-sqs";

import { env } from "@/lib/env";
import { createLogger, type Logger } from "@/lib/log";
import {
  ACTIVITY_LOG_SQS_SCHEMA_VERSION,
  assertSafeActivityLogPayload,
  type ActivityLogEventInput,
  type ActivityLogEnqueueError,
  type ActivityLogSqsMessage,
  type ActivityLogWorkflowEvent,
} from "@/lib/activity-log/activity-log-contract";
import { mapWithConcurrency } from "@/lib/primitives/map-with-concurrency/map-with-concurrency";
import { err, ok, type Result } from "@/lib/primitives/result/results";

const logger = createLogger("activity-log-writer");
const sqsClient = new SQSClient({ region: env.AWS_REGION });
export const ACTIVITY_LOG_SQS_SEND_TIMEOUT_MS = 250;

export type ActivityLogWriterLogger = Pick<Logger, "error">;

export type ActivityLogWriterOptions = {
  correlationId?: string;
  logger?: ActivityLogWriterLogger;
  signal?: AbortSignal;
};

function logWriteFailure(
  log: ActivityLogWriterLogger,
  input: ActivityLogEventInput,
  correlationId: string,
  failure: "payload_validation" | "sqs_enqueue",
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
    const message: ActivityLogSqsMessage = {
      event,
      messageType: "activity_log",
      schemaVersion: ACTIVITY_LOG_SQS_SCHEMA_VERSION,
    };
    const timeoutSignal = AbortSignal.timeout(ACTIVITY_LOG_SQS_SEND_TIMEOUT_MS);
    const abortSignal = options.signal
      ? AbortSignal.any([options.signal, timeoutSignal])
      : timeoutSignal;
    await sqsClient.send(
      new SendMessageCommand({
        MessageBody: JSON.stringify(message),
        QueueUrl: env.ACTIVITY_LOG_SQS_QUEUE_URL,
      }),
      { abortSignal },
    );

    return ok({ createdAt: new Date(event.createdAt), id: event.id });
  } catch {
    logWriteFailure(log, input, correlationId, "sqs_enqueue");
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
