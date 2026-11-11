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
import { and, eq, inArray, isNotNull, lt, sql } from "drizzle-orm";

import { db, schema } from "@/lib/database/client";
import { createLogger } from "@/lib/log";
import {
  deliverDueWebhooks,
  enqueueWebhookDeliveriesForEvent,
  type DeliverDueWebhooksResult,
  type WebhookSender,
} from "@/lib/outbound-webhooks/webhook-deliveries";
import {
  dispatchVisualWorkflowsForJobChange,
  type ActiveVisualWorkflowCache,
} from "@/lib/visual-workflows/visual-workflow-dispatcher";
import type { VisualWorkflowExecutionQueue } from "@/lib/workflow/types";

import type { JobChangeEventRecord } from "./job-change-events-contract";

const logger = createLogger("job-change-events");

// Longer than the cron function can run (300s), so a slow tick never overlaps the next.
const EVENT_CLAIM_LEASE_MS = 6 * 60_000;
/** Claims after which an event that keeps failing to fan out is given up, so it cannot block. */
export const JOB_CHANGE_EVENT_MAX_CLAIMS = 10;
export const JOB_CHANGE_EVENT_RETENTION_MS = 30 * 24 * 60 * 60_000;
const PRUNE_BATCH_SIZE = 1_000;

type JobChangeEventRow = typeof schema.jobChangeEvents.$inferSelect;

function toRecord(row: JobChangeEventRow): JobChangeEventRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    jobId: row.jobId,
    projectId: row.projectId,
    kind: row.kind,
    type: row.type,
    fromStatus: row.fromStatus,
    toStatus: row.toStatus,
    assigneeType: row.assigneeType,
    occurredAt: row.occurredAt,
  };
}

/** Leases the oldest undispatched events. Rows another tick holds are skipped, not waited on. */
async function claimJobChangeEvents(
  limit: number,
  now: Date,
  organizationId?: string,
): Promise<JobChangeEventRow[]> {
  const pending = db
    .select({ id: schema.jobChangeEvents.id })
    .from(schema.jobChangeEvents)
    .where(
      and(
        organizationId ? eq(schema.jobChangeEvents.organizationId, organizationId) : undefined,
        sql`${schema.jobChangeEvents.dispatchedAt} IS NULL`,
        sql`(${schema.jobChangeEvents.claimedUntil} IS NULL OR ${schema.jobChangeEvents.claimedUntil} <= ${now})`,
      ),
    )
    .orderBy(schema.jobChangeEvents.occurredAt)
    .limit(limit)
    .for("update", { skipLocked: true });

  const rows = await db
    .update(schema.jobChangeEvents)
    .set({
      claimedUntil: new Date(now.getTime() + EVENT_CLAIM_LEASE_MS),
      claimAttempts: sql`${schema.jobChangeEvents.claimAttempts} + 1`,
    })
    .where(inArray(schema.jobChangeEvents.id, pending))
    .returning();
  // Keep a job's changes in the order they happened.
  return rows.sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
}

async function markDispatched(eventId: string, now: Date, abandoned = false) {
  await db
    .update(schema.jobChangeEvents)
    .set({
      dispatchedAt: now,
      claimedUntil: null,
      ...(abandoned ? { abandonedAt: now } : {}),
    })
    .where(eq(schema.jobChangeEvents.id, eventId));
}

export type DispatchJobChangeEventsResult = {
  claimed: number;
  dispatched: number;
  failed: number;
  abandoned: number;
  workflowRuns: number;
  webhookDeliveries: number;
};

/** Fans claimed job changes out to matching visual workflows and outbound webhook endpoints. */
export async function dispatchJobChangeEvents(input?: {
  limit?: number;
  now?: Date;
  queue?: VisualWorkflowExecutionQueue;
  /** Only this workspace's events, for replays and tests; every workspace when unset. */
  organizationId?: string;
  enqueueWebhooks?: typeof enqueueWebhookDeliveriesForEvent;
}): Promise<DispatchJobChangeEventsResult> {
  const now = input?.now ?? new Date();
  const rows = await claimJobChangeEvents(input?.limit ?? 200, now, input?.organizationId);
  const result: DispatchJobChangeEventsResult = {
    claimed: rows.length,
    dispatched: 0,
    failed: 0,
    abandoned: 0,
    workflowRuns: 0,
    webhookDeliveries: 0,
  };
  const workflowCache: ActiveVisualWorkflowCache = new Map();

  for (const row of rows) {
    const event = toRecord(row);
    try {
      // Webhooks first: queuing them is one cheap insert, and both steps are safe to repeat.
      result.webhookDeliveries += await (
        input?.enqueueWebhooks ?? enqueueWebhookDeliveriesForEvent
      )(event);
      const runs = await dispatchVisualWorkflowsForJobChange({
        event,
        cache: workflowCache,
        queue: input?.queue,
        now,
      });
      result.workflowRuns += runs.filter((run) => run.outcome === "enqueued").length;
      await markDispatched(event.id, now);
      result.dispatched += 1;
    } catch (error) {
      if (row.claimAttempts >= JOB_CHANGE_EVENT_MAX_CLAIMS) {
        await markDispatched(event.id, now, true);
        result.abandoned += 1;
        logger.error(
          { jobChangeEventId: event.id, jobId: event.jobId, claimAttempts: row.claimAttempts },
          "job change event abandoned after repeated dispatch failures",
        );
        continue;
      }
      result.failed += 1;
      logger.warn(
        {
          jobChangeEventId: event.id,
          jobId: event.jobId,
          claimAttempts: row.claimAttempts,
          error: error instanceof Error ? error.name : "unknown",
        },
        "job change event dispatch failed; will retry",
      );
    }
  }

  return result;
}

/** Deletes dispatched events and finished deliveries past the retention window, a batch a tick. */
export async function pruneJobChangeEvents(now = new Date()): Promise<{
  events: number;
  deliveries: number;
}> {
  const cutoff = new Date(now.getTime() - JOB_CHANGE_EVENT_RETENTION_MS);
  const oldEvents = db
    .select({ id: schema.jobChangeEvents.id })
    .from(schema.jobChangeEvents)
    .where(
      and(
        isNotNull(schema.jobChangeEvents.dispatchedAt),
        lt(schema.jobChangeEvents.occurredAt, cutoff),
      ),
    )
    .limit(PRUNE_BATCH_SIZE);
  const events = await db
    .delete(schema.jobChangeEvents)
    .where(inArray(schema.jobChangeEvents.id, oldEvents))
    .returning({ id: schema.jobChangeEvents.id });

  const oldDeliveries = db
    .select({ id: schema.webhookDeliveries.id })
    .from(schema.webhookDeliveries)
    .where(
      and(
        isNotNull(schema.webhookDeliveries.completedAt),
        lt(schema.webhookDeliveries.createdAt, cutoff),
      ),
    )
    .limit(PRUNE_BATCH_SIZE);
  const deliveries = await db
    .delete(schema.webhookDeliveries)
    .where(inArray(schema.webhookDeliveries.id, oldDeliveries))
    .returning({ id: schema.webhookDeliveries.id });

  return { events: events.length, deliveries: deliveries.length };
}

export type JobChangeEventPumpResult = {
  events: DispatchJobChangeEventsResult;
  webhooks: DeliverDueWebhooksResult;
  pruned: { events: number; deliveries: number };
};

/** One tick: fan out new job changes, send due webhooks, prune old rows. */
export async function runJobChangeEventPump(input?: {
  eventLimit?: number;
  deliveryLimit?: number;
  now?: Date;
  queue?: VisualWorkflowExecutionQueue;
  sender?: WebhookSender;
}): Promise<JobChangeEventPumpResult> {
  const now = input?.now ?? new Date();
  const events = await dispatchJobChangeEvents({
    limit: input?.eventLimit,
    now,
    queue: input?.queue,
  });
  const webhooks = await deliverDueWebhooks({
    limit: input?.deliveryLimit,
    now,
    sender: input?.sender,
  });
  const pruned = await pruneJobChangeEvents(now);

  logger.info({ events, webhooks, pruned }, "job change event pump tick completed");
  return { events, webhooks, pruned };
}
