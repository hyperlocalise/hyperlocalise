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

import { and, desc, eq, sql } from "drizzle-orm";

import { db, schema, type DatabaseClient } from "@/lib/database/client";

import { getVisualWorkflowById } from "./visual-workflows";
import type {
  VisualWorkflowNodeRunRecord,
  VisualWorkflowNodeRunStatus,
  VisualWorkflowRunRecord,
  VisualWorkflowRunStatus,
  VisualWorkflowRunTriggerSource,
} from "./visual-workflow-run-types";

type VisualWorkflowRunRow = typeof schema.visualWorkflowRuns.$inferSelect;
type VisualWorkflowNodeRunRow = typeof schema.visualWorkflowNodeRuns.$inferSelect;

function toIsoString(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function serializeNodeRun(row: VisualWorkflowNodeRunRow): VisualWorkflowNodeRunRecord {
  return {
    id: row.id,
    runId: row.runId,
    organizationId: row.organizationId,
    nodeId: row.nodeId,
    nodeType: row.nodeType,
    status: row.status,
    inputSnapshot: row.inputSnapshot,
    outputSnapshot: row.outputSnapshot,
    error: row.error ?? null,
    startedAt: toIsoString(row.startedAt),
    finishedAt: toIsoString(row.finishedAt),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function serializeRun(
  row: VisualWorkflowRunRow,
  nodeRuns?: VisualWorkflowNodeRunRecord[],
): VisualWorkflowRunRecord {
  return {
    id: row.id,
    visualWorkflowId: row.visualWorkflowId,
    organizationId: row.organizationId,
    triggerSource: row.triggerSource,
    status: row.status,
    idempotencyKey: row.idempotencyKey,
    definitionVersion: row.definitionVersion,
    inputSnapshot: row.inputSnapshot,
    outputSummary: row.outputSummary,
    error: row.error ?? null,
    startedAt: toIsoString(row.startedAt),
    completedAt: toIsoString(row.completedAt),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    ...(nodeRuns ? { nodeRuns } : {}),
  };
}

export async function getVisualWorkflowRunById(input: {
  organizationId: string;
  visualWorkflowId: string;
  runId: string;
  includeNodeRuns?: boolean;
  dbClient?: DatabaseClient;
}): Promise<VisualWorkflowRunRecord | null> {
  const dbClient = input.dbClient ?? db;
  const [row] = await dbClient
    .select()
    .from(schema.visualWorkflowRuns)
    .where(
      and(
        eq(schema.visualWorkflowRuns.id, input.runId),
        eq(schema.visualWorkflowRuns.organizationId, input.organizationId),
        eq(schema.visualWorkflowRuns.visualWorkflowId, input.visualWorkflowId),
      ),
    )
    .limit(1);

  if (!row) {
    return null;
  }

  if (!input.includeNodeRuns) {
    return serializeRun(row);
  }

  const nodeRuns = await listVisualWorkflowNodeRuns({
    organizationId: input.organizationId,
    runId: input.runId,
    dbClient,
  });

  return serializeRun(row, nodeRuns);
}

export async function listVisualWorkflowRuns(input: {
  organizationId: string;
  visualWorkflowId: string;
  limit?: number;
  offset?: number;
  dbClient?: DatabaseClient;
}): Promise<VisualWorkflowRunRecord[]> {
  const dbClient = input.dbClient ?? db;
  const rows = await dbClient
    .select()
    .from(schema.visualWorkflowRuns)
    .where(
      and(
        eq(schema.visualWorkflowRuns.organizationId, input.organizationId),
        eq(schema.visualWorkflowRuns.visualWorkflowId, input.visualWorkflowId),
      ),
    )
    .orderBy(desc(schema.visualWorkflowRuns.createdAt))
    .limit(input.limit ?? 20)
    .offset(input.offset ?? 0);

  return rows.map((row) => serializeRun(row));
}

export async function listVisualWorkflowNodeRuns(input: {
  organizationId: string;
  runId: string;
  dbClient?: DatabaseClient;
}): Promise<VisualWorkflowNodeRunRecord[]> {
  const dbClient = input.dbClient ?? db;
  const rows = await dbClient
    .select()
    .from(schema.visualWorkflowNodeRuns)
    .where(
      and(
        eq(schema.visualWorkflowNodeRuns.organizationId, input.organizationId),
        eq(schema.visualWorkflowNodeRuns.runId, input.runId),
      ),
    )
    .orderBy(schema.visualWorkflowNodeRuns.createdAt);

  return rows.map((row) => serializeNodeRun(row));
}

async function getVisualWorkflowRunByIdempotencyKey(input: {
  organizationId: string;
  visualWorkflowId: string;
  idempotencyKey: string;
  dbClient: DatabaseClient;
}) {
  const [row] = await input.dbClient
    .select()
    .from(schema.visualWorkflowRuns)
    .where(
      and(
        eq(schema.visualWorkflowRuns.organizationId, input.organizationId),
        eq(schema.visualWorkflowRuns.visualWorkflowId, input.visualWorkflowId),
        eq(schema.visualWorkflowRuns.idempotencyKey, input.idempotencyKey),
      ),
    )
    .limit(1);

  return row ? serializeRun(row) : null;
}

export async function createVisualWorkflowRun(input: {
  organizationId: string;
  visualWorkflowId: string;
  triggerSource: VisualWorkflowRunTriggerSource;
  idempotencyKey?: string | null;
  inputSnapshot?: Record<string, unknown>;
  status?: VisualWorkflowRunStatus;
  dbClient?: DatabaseClient;
}): Promise<VisualWorkflowRunRecord> {
  const dbClient = input.dbClient ?? db;
  const workflow = await getVisualWorkflowById({
    organizationId: input.organizationId,
    visualWorkflowId: input.visualWorkflowId,
    dbClient,
  });
  if (!workflow) {
    throw new Error("visual_workflow_not_found");
  }

  if (input.idempotencyKey) {
    const existing = await getVisualWorkflowRunByIdempotencyKey({
      organizationId: input.organizationId,
      visualWorkflowId: input.visualWorkflowId,
      idempotencyKey: input.idempotencyKey,
      dbClient,
    });
    if (existing) {
      return existing;
    }
  }

  const [row] = await dbClient
    .insert(schema.visualWorkflowRuns)
    .values({
      organizationId: input.organizationId,
      visualWorkflowId: input.visualWorkflowId,
      triggerSource: input.triggerSource,
      status: input.status ?? "queued",
      idempotencyKey: input.idempotencyKey ?? null,
      definitionVersion: workflow.definitionVersion,
      inputSnapshot: input.inputSnapshot ?? {},
    })
    .onConflictDoNothing({
      target: [
        schema.visualWorkflowRuns.organizationId,
        schema.visualWorkflowRuns.visualWorkflowId,
        schema.visualWorkflowRuns.idempotencyKey,
      ],
      where: sql`${schema.visualWorkflowRuns.idempotencyKey} IS NOT NULL`,
    })
    .returning();

  if (!row && input.idempotencyKey) {
    const existing = await getVisualWorkflowRunByIdempotencyKey({
      organizationId: input.organizationId,
      visualWorkflowId: input.visualWorkflowId,
      idempotencyKey: input.idempotencyKey,
      dbClient,
    });
    if (existing) {
      return existing;
    }
  }

  if (!row) {
    throw new Error("failed_to_create_visual_workflow_run");
  }

  return serializeRun(row);
}

export async function enqueueVisualWorkflowRunOnce(input: {
  runId: string;
  organizationId: string;
  enqueue: () => Promise<void>;
  dbClient?: DatabaseClient;
}): Promise<boolean> {
  const dbClient = input.dbClient ?? db;
  return dbClient.transaction(async (tx) => {
    const [run] = await tx
      .select({
        outputSummary: schema.visualWorkflowRuns.outputSummary,
      })
      .from(schema.visualWorkflowRuns)
      .where(
        and(
          eq(schema.visualWorkflowRuns.id, input.runId),
          eq(schema.visualWorkflowRuns.organizationId, input.organizationId),
        ),
      )
      .limit(1)
      .for("update");

    if (!run) {
      throw new Error("visual_workflow_run_not_found");
    }

    if (
      typeof run.outputSummary.executionEnqueuedAt === "string" &&
      run.outputSummary.executionEnqueuedAt.length > 0
    ) {
      return false;
    }

    await input.enqueue();

    await tx
      .update(schema.visualWorkflowRuns)
      .set({
        outputSummary: {
          ...run.outputSummary,
          executionEnqueuedAt: new Date().toISOString(),
        },
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.visualWorkflowRuns.id, input.runId),
          eq(schema.visualWorkflowRuns.organizationId, input.organizationId),
        ),
      );

    return true;
  });
}

export async function updateVisualWorkflowRun(input: {
  runId: string;
  organizationId: string;
  status?: VisualWorkflowRunStatus;
  outputSummary?: Record<string, unknown>;
  error?: Record<string, unknown> | null;
  startedAt?: Date | null;
  completedAt?: Date | null;
  dbClient?: DatabaseClient;
}): Promise<VisualWorkflowRunRecord | null> {
  const dbClient = input.dbClient ?? db;
  const [row] = await dbClient
    .update(schema.visualWorkflowRuns)
    .set({
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.outputSummary !== undefined ? { outputSummary: input.outputSummary } : {}),
      ...(input.error !== undefined ? { error: input.error } : {}),
      ...(input.startedAt !== undefined ? { startedAt: input.startedAt } : {}),
      ...(input.completedAt !== undefined ? { completedAt: input.completedAt } : {}),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(schema.visualWorkflowRuns.id, input.runId),
        eq(schema.visualWorkflowRuns.organizationId, input.organizationId),
      ),
    )
    .returning();

  return row ? serializeRun(row) : null;
}

export async function upsertVisualWorkflowNodeRun(input: {
  runId: string;
  organizationId: string;
  nodeId: string;
  nodeType: string;
  status: VisualWorkflowNodeRunStatus;
  inputSnapshot?: Record<string, unknown>;
  outputSnapshot?: Record<string, unknown>;
  error?: Record<string, unknown> | null;
  startedAt?: Date | null;
  finishedAt?: Date | null;
  dbClient?: DatabaseClient;
}): Promise<VisualWorkflowNodeRunRecord> {
  const dbClient = input.dbClient ?? db;
  const [row] = await dbClient
    .insert(schema.visualWorkflowNodeRuns)
    .values({
      runId: input.runId,
      organizationId: input.organizationId,
      nodeId: input.nodeId,
      nodeType: input.nodeType,
      status: input.status,
      inputSnapshot: input.inputSnapshot ?? {},
      outputSnapshot: input.outputSnapshot ?? {},
      error: input.error ?? null,
      startedAt: input.startedAt ?? null,
      finishedAt: input.finishedAt ?? null,
    })
    .onConflictDoUpdate({
      target: [schema.visualWorkflowNodeRuns.runId, schema.visualWorkflowNodeRuns.nodeId],
      set: {
        status: input.status,
        inputSnapshot: input.inputSnapshot ?? {},
        outputSnapshot: input.outputSnapshot ?? {},
        error: input.error ?? null,
        startedAt: input.startedAt ?? null,
        finishedAt: input.finishedAt ?? null,
        updatedAt: new Date(),
      },
    })
    .returning();

  return serializeNodeRun(row);
}

export async function executeVisualWorkflowRun(input: {
  runId: string;
  organizationId: string;
  visualWorkflowId: string;
}): Promise<VisualWorkflowRunRecord | null> {
  const workflow = await getVisualWorkflowById({
    organizationId: input.organizationId,
    visualWorkflowId: input.visualWorkflowId,
  });
  if (!workflow) {
    await updateVisualWorkflowRun({
      runId: input.runId,
      organizationId: input.organizationId,
      status: "failed",
      error: { message: "visual_workflow_not_found" },
      completedAt: new Date(),
    });
    return null;
  }

  const run = await getVisualWorkflowRunById({
    organizationId: input.organizationId,
    visualWorkflowId: input.visualWorkflowId,
    runId: input.runId,
  });
  if (!run) {
    return null;
  }

  await updateVisualWorkflowRun({
    runId: input.runId,
    organizationId: input.organizationId,
    status: "running",
    startedAt: new Date(),
  });

  const { runVisualWorkflowInterpreter } = await import("./runtime/interpreter");
  const result = await runVisualWorkflowInterpreter({
    definition: workflow.definition,
    organizationId: input.organizationId,
    triggerInput: run.inputSnapshot,
    onNodeUpdate: async (update) => {
      await upsertVisualWorkflowNodeRun({
        runId: input.runId,
        organizationId: input.organizationId,
        nodeId: update.nodeId,
        nodeType: update.nodeType,
        status: update.status,
        inputSnapshot: update.inputSnapshot,
        outputSnapshot: update.outputSnapshot,
        error: update.error ?? null,
        startedAt: update.status === "running" ? new Date() : undefined,
        finishedAt: update.status === "succeeded" || update.status === "failed" ? new Date() : null,
      });
    },
  });

  if (!result.ok) {
    return updateVisualWorkflowRun({
      runId: input.runId,
      organizationId: input.organizationId,
      status: "failed",
      error: {
        ...result.error,
        failedNodeId: result.failedNodeId,
      },
      outputSummary: {
        nodeResults: result.nodeResults,
      },
      completedAt: new Date(),
    });
  }

  return updateVisualWorkflowRun({
    runId: input.runId,
    organizationId: input.organizationId,
    status: "succeeded",
    outputSummary: {
      nodeResults: result.nodeResults,
    },
    completedAt: new Date(),
  });
}

export async function dispatchManualVisualWorkflowRun(input: {
  organizationId: string;
  visualWorkflowId: string;
  idempotencyKey: string;
  inputSnapshot?: Record<string, unknown>;
  queue?: import("@/lib/workflow/types").VisualWorkflowExecutionQueue;
}): Promise<{ runId: string; enqueued: boolean } | null> {
  const workflow = await getVisualWorkflowById({
    organizationId: input.organizationId,
    visualWorkflowId: input.visualWorkflowId,
  });
  if (!workflow) {
    return null;
  }

  const run = await createVisualWorkflowRun({
    organizationId: input.organizationId,
    visualWorkflowId: input.visualWorkflowId,
    triggerSource: "manual",
    idempotencyKey: input.idempotencyKey,
    inputSnapshot: input.inputSnapshot,
  });

  const { createVisualWorkflowExecutionQueue } = await import("@/workflows/adapters");
  const queue = input.queue ?? createVisualWorkflowExecutionQueue();
  const enqueued = await enqueueVisualWorkflowRunOnce({
    runId: run.id,
    organizationId: input.organizationId,
    enqueue: async () => {
      await queue.enqueue({
        visualWorkflowRunId: run.id,
        visualWorkflowId: input.visualWorkflowId,
        organizationId: input.organizationId,
      });
    },
  });

  return { runId: run.id, enqueued };
}
