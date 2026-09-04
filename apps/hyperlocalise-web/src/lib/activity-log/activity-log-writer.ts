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

import { sql } from "drizzle-orm";

import { db, schema, type DatabaseClient } from "@/lib/database/client";
import { createLogger, type Logger } from "@/lib/log";
import {
  assertSafeActivityLogPayload,
  type ActivityLogEventInput,
  type ActivityLogEventRecord,
  type ActivityLogWriteError,
} from "@/lib/activity-log/activity-log-contract";
import { err, ok, type Result } from "@/lib/primitives/result/results";

const logger = createLogger("activity-log-writer");

export type ActivityLogWriterLogger = Pick<Logger, "error">;

export type ActivityLogWriterOptions = {
  correlationId?: string;
  database?: DatabaseClient;
  logger?: ActivityLogWriterLogger;
};

function logWriteFailure(
  log: ActivityLogWriterLogger,
  input: ActivityLogEventInput,
  correlationId: string,
  failure: "payload_validation" | "database_insert",
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
    "workspace activity log write failed",
  );
}

/**
 * Persists one workspace activity event. When called with an existing
 * transaction, Drizzle uses a savepoint so an activity failure does not abort
 * the user mutation that owns the transaction.
 */
export async function writeActivityLogEvent(
  input: ActivityLogEventInput,
  options: ActivityLogWriterOptions = {},
): Promise<Result<ActivityLogEventRecord, ActivityLogWriteError>> {
  const correlationId = options.correlationId ?? randomUUID();
  const log = options.logger ?? logger;

  try {
    assertSafeActivityLogPayload(input.payload);
  } catch {
    logWriteFailure(log, input, correlationId, "payload_validation");
    return err({ code: "activity_log_write_failed" });
  }

  try {
    const database = options.database ?? db;
    const [event] = await database.transaction(async (transaction) =>
      transaction
        .insert(schema.organizationActivityEvents)
        .values({
          actorCredentialId: input.actorCredentialId,
          actorKind: input.actorKind,
          actorUserId: input.actorUserId,
          createdAt: sql`clock_timestamp()`,
          eventType: input.eventType,
          organizationId: input.organizationId,
          payload: input.payload,
          targetId: input.targetId,
          targetKind: input.targetKind,
        })
        .returning(),
    );

    if (!event) {
      logWriteFailure(log, input, correlationId, "database_insert");
      return err({ code: "activity_log_write_failed" });
    }

    return ok({
      ...input,
      createdAt: event.createdAt,
      id: event.id,
    });
  } catch {
    logWriteFailure(log, input, correlationId, "database_insert");
    return err({ code: "activity_log_write_failed" });
  }
}
