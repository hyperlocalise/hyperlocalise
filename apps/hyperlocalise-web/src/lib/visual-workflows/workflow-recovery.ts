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
import { createLogger } from "@/lib/log";
import { and, eq, or, isNull, lte, inArray } from "drizzle-orm";
import { db, schema } from "@/lib/database/client";
import { createVisualWorkflowExecutionQueue } from "@/workflows/adapters";
import { getVisualWorkflowRunById } from "./visual-workflow-runs";
const logger = createLogger("visual-workflow-recovery");
type RunIdentity = { organizationId: string; visualWorkflowId: string; runId: string };
export async function requestWorkflowCancellation(input: RunIdentity) {
  await db
    .update(schema.visualWorkflowRuns)
    .set({ cancelRequestedAt: new Date() })
    .where(
      and(
        eq(schema.visualWorkflowRuns.id, input.runId),
        eq(schema.visualWorkflowRuns.organizationId, input.organizationId),
        eq(schema.visualWorkflowRuns.visualWorkflowId, input.visualWorkflowId),
        inArray(schema.visualWorkflowRuns.status, ["queued", "running"]),
      ),
    );
  return getVisualWorkflowRunById(input);
}
export async function retryWorkflowRun(input: RunIdentity) {
  const run = await getVisualWorkflowRunById(input);
  if (!run || !["failed", "needs_attention"].includes(run.status)) return null;
  await db.transaction(async (tx) => {
    const [claimed] = await tx
      .update(schema.visualWorkflowRuns)
      .set({
        status: "queued",
        leaseExpiresAt: null,
        leaseToken: null,
        startedAt: null,
        error: null,
        completedAt: null,
        cancelRequestedAt: null,
      })
      .where(
        and(
          eq(schema.visualWorkflowRuns.id, input.runId),
          eq(schema.visualWorkflowRuns.organizationId, input.organizationId),
          inArray(schema.visualWorkflowRuns.status, ["failed", "needs_attention"]),
        ),
      )
      .returning();
    if (!claimed) return;
    // Preserve old attempts; a new attempt is created by the executor.
    await tx
      .update(schema.visualWorkflowNodeRuns)
      .set({ status: "failed" })
      .where(
        and(
          eq(schema.visualWorkflowNodeRuns.runId, input.runId),
          eq(schema.visualWorkflowNodeRuns.status, "running"),
        ),
      );
    await tx
      .update(schema.visualWorkflowOutbox)
      .set({ dispatchedAt: null, leaseExpiresAt: null })
      .where(eq(schema.visualWorkflowOutbox.runId, input.runId));
  });
  await reconcileWorkflowRuns();
  return getVisualWorkflowRunById(input);
}
export async function reconcileWorkflowRuns() {
  const now = new Date();
  const pending = await db
    .select({ run: schema.visualWorkflowRuns, outbox: schema.visualWorkflowOutbox })
    .from(schema.visualWorkflowOutbox)
    .innerJoin(
      schema.visualWorkflowRuns,
      eq(schema.visualWorkflowRuns.id, schema.visualWorkflowOutbox.runId),
    )
    .where(
      and(
        inArray(schema.visualWorkflowRuns.status, ["queued", "running"]),
        or(
          isNull(schema.visualWorkflowOutbox.dispatchedAt),
          and(
            eq(schema.visualWorkflowRuns.status, "running"),
            isNull(schema.visualWorkflowRuns.leaseExpiresAt),
            lte(schema.visualWorkflowRuns.updatedAt, new Date(now.getTime() - 180000)),
          ),
          lte(schema.visualWorkflowRuns.leaseExpiresAt, now),
          and(
            eq(schema.visualWorkflowRuns.status, "queued"),
            lte(schema.visualWorkflowOutbox.dispatchedAt, new Date(now.getTime() - 180000)),
          ),
        ),
      ),
    )
    .limit(100);
  const queue = createVisualWorkflowExecutionQueue();
  for (const { run } of pending) {
    const [claim] = await db
      .update(schema.visualWorkflowOutbox)
      .set({ leaseExpiresAt: new Date(now.getTime() + 180000) })
      .where(
        and(
          eq(schema.visualWorkflowOutbox.runId, run.id),
          or(
            isNull(schema.visualWorkflowOutbox.leaseExpiresAt),
            lte(schema.visualWorkflowOutbox.leaseExpiresAt, now),
          ),
        ),
      )
      .returning();
    if (!claim) continue;
    logger.info(
      {
        runId: run.id,
        organizationId: run.organizationId,
        queueAgeMs: now.getTime() - run.createdAt.getTime(),
        stalled: run.status === "running",
      },
      "reconciling workflow dispatch",
    );
    try {
      await queue.enqueue({
        visualWorkflowRunId: run.id,
        visualWorkflowId: run.visualWorkflowId,
        organizationId: run.organizationId,
      });
      await db
        .update(schema.visualWorkflowOutbox)
        .set({ dispatchedAt: new Date(), leaseExpiresAt: null })
        .where(eq(schema.visualWorkflowOutbox.runId, run.id));
    } catch {
      await db
        .update(schema.visualWorkflowOutbox)
        .set({ leaseExpiresAt: null })
        .where(eq(schema.visualWorkflowOutbox.runId, run.id));
    }
  }
  return pending.length;
}
