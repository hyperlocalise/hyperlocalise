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

import { visualWorkflowDefinitionSchema } from "./schema/definition-schema";
import type { VisualWorkflowDefinition } from "./schema/types";
import type { VisualWorkflowRecord } from "./visual-workflow-types";
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

const DEFINITION_SNAPSHOT_KEY = "definitionSnapshot";

const TERMINAL_VISUAL_WORKFLOW_RUN_STATUSES = new Set<VisualWorkflowRunStatus>([
  "succeeded",
  "failed",
  "cancelled",
  "skipped",
]);

function buildRunInputSnapshot(input: {
  triggerInput?: Record<string, unknown>;
  definition: VisualWorkflowDefinition;
}): Record<string, unknown> {
  const { [DEFINITION_SNAPSHOT_KEY]: _ignored, ...triggerInput } = input.triggerInput ?? {};
  return {
    ...triggerInput,
    [DEFINITION_SNAPSHOT_KEY]: input.definition,
  };
}

function extractTriggerInputFromRunSnapshot(
  inputSnapshot: Record<string, unknown>,
): Record<string, unknown> {
  const { [DEFINITION_SNAPSHOT_KEY]: _ignored, ...triggerInput } = inputSnapshot;
  return triggerInput;
}

function resolveRunDefinition(input: {
  run: VisualWorkflowRunRecord;
  workflow: VisualWorkflowRecord;
}): VisualWorkflowDefinition | null {
  const snapshot = input.run.inputSnapshot[DEFINITION_SNAPSHOT_KEY];
  const parsedSnapshot = visualWorkflowDefinitionSchema.safeParse(snapshot);
  if (parsedSnapshot.success) {
    return parsedSnapshot.data;
  }

  if (input.run.definitionVersion === input.workflow.definitionVersion) {
    return input.workflow.definition;
  }

  return null;
}

function mergeRunOutputSummary(
  existing: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...existing,
    ...patch,
  };
}

async function claimVisualWorkflowRunForExecution(input: {
  runId: string;
  organizationId: string;
  visualWorkflowId: string;
  dbClient?: DatabaseClient;
}): Promise<
  | { kind: "claimed"; run: VisualWorkflowRunRecord }
  | { kind: "already_finished"; run: VisualWorkflowRunRecord }
  | { kind: "already_running"; run: VisualWorkflowRunRecord }
  | null
> {
  const dbClient = input.dbClient ?? db;
  const now = new Date();
  const [claimed] = await dbClient
    .update(schema.visualWorkflowRuns)
    .set({
      status: "running",
      startedAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(schema.visualWorkflowRuns.id, input.runId),
        eq(schema.visualWorkflowRuns.organizationId, input.organizationId),
        eq(schema.visualWorkflowRuns.visualWorkflowId, input.visualWorkflowId),
        eq(schema.visualWorkflowRuns.status, "queued"),
      ),
    )
    .returning();

  if (claimed) {
    return { kind: "claimed", run: serializeRun(claimed) };
  }

  const run = await getVisualWorkflowRunById({
    organizationId: input.organizationId,
    visualWorkflowId: input.visualWorkflowId,
    runId: input.runId,
    dbClient,
  });
  if (!run) {
    return null;
  }

  if (TERMINAL_VISUAL_WORKFLOW_RUN_STATUSES.has(run.status)) {
    return { kind: "already_finished", run };
  }

  if (run.status === "running") {
    return { kind: "already_running", run };
  }

  return null;
}

async function finishVisualWorkflowRun(input: {
  runId: string;
  organizationId: string;
  status: Extract<VisualWorkflowRunStatus, "succeeded" | "failed">;
  error?: Record<string, unknown> | null;
  outputSummaryPatch?: Record<string, unknown>;
  dbClient?: DatabaseClient;
}): Promise<VisualWorkflowRunRecord | null> {
  const dbClient = input.dbClient ?? db;
  const [current] = await dbClient
    .select({ outputSummary: schema.visualWorkflowRuns.outputSummary })
    .from(schema.visualWorkflowRuns)
    .where(
      and(
        eq(schema.visualWorkflowRuns.id, input.runId),
        eq(schema.visualWorkflowRuns.organizationId, input.organizationId),
        eq(schema.visualWorkflowRuns.status, "running"),
      ),
    )
    .limit(1);

  if (!current) {
    const [row] = await dbClient
      .select()
      .from(schema.visualWorkflowRuns)
      .where(
        and(
          eq(schema.visualWorkflowRuns.id, input.runId),
          eq(schema.visualWorkflowRuns.organizationId, input.organizationId),
        ),
      )
      .limit(1);

    return row ? serializeRun(row) : null;
  }

  const [row] = await dbClient
    .update(schema.visualWorkflowRuns)
    .set({
      status: input.status,
      ...(input.error !== undefined ? { error: input.error } : {}),
      outputSummary: mergeRunOutputSummary(current.outputSummary, input.outputSummaryPatch ?? {}),
      completedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(schema.visualWorkflowRuns.id, input.runId),
        eq(schema.visualWorkflowRuns.organizationId, input.organizationId),
        eq(schema.visualWorkflowRuns.status, "running"),
      ),
    )
    .returning();

  return row ? serializeRun(row) : null;
}

function visualWorkflowRunEnqueueCommitted(outputSummary: Record<string, unknown>): boolean {
  const marker = outputSummary.executionEnqueueCommittedAt;
  return typeof marker === "string" && marker.length > 0;
}

function visualWorkflowRunEnqueueInProgress(outputSummary: Record<string, unknown>): boolean {
  const marker = outputSummary.executionEnqueuedAt;
  return typeof marker === "string" && marker.length > 0;
}

async function clearVisualWorkflowRunEnqueueMarker(input: {
  runId: string;
  organizationId: string;
  dbClient?: DatabaseClient;
}): Promise<void> {
  const dbClient = input.dbClient ?? db;
  const [run] = await dbClient
    .select({ outputSummary: schema.visualWorkflowRuns.outputSummary })
    .from(schema.visualWorkflowRuns)
    .where(
      and(
        eq(schema.visualWorkflowRuns.id, input.runId),
        eq(schema.visualWorkflowRuns.organizationId, input.organizationId),
      ),
    )
    .limit(1);

  if (!run) {
    return;
  }

  const {
    executionEnqueuedAt: _executionEnqueuedAt,
    executionEnqueueCommittedAt: _executionEnqueueCommittedAt,
    ...outputSummaryWithoutEnqueueMarkers
  } = run.outputSummary;

  await dbClient
    .update(schema.visualWorkflowRuns)
    .set({
      outputSummary: outputSummaryWithoutEnqueueMarkers,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(schema.visualWorkflowRuns.id, input.runId),
        eq(schema.visualWorkflowRuns.organizationId, input.organizationId),
      ),
    );
}

async function markVisualWorkflowRunEnqueueCommitted(input: {
  runId: string;
  organizationId: string;
  dbClient?: DatabaseClient;
}): Promise<void> {
  const dbClient = input.dbClient ?? db;
  const [run] = await dbClient
    .select({ outputSummary: schema.visualWorkflowRuns.outputSummary })
    .from(schema.visualWorkflowRuns)
    .where(
      and(
        eq(schema.visualWorkflowRuns.id, input.runId),
        eq(schema.visualWorkflowRuns.organizationId, input.organizationId),
      ),
    )
    .limit(1);

  if (!run) {
    throw new Error("visual_workflow_run_not_found");
  }

  await dbClient
    .update(schema.visualWorkflowRuns)
    .set({
      outputSummary: {
        ...run.outputSummary,
        executionEnqueueCommittedAt: new Date().toISOString(),
      },
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(schema.visualWorkflowRuns.id, input.runId),
        eq(schema.visualWorkflowRuns.organizationId, input.organizationId),
      ),
    );
}

export class VisualWorkflowDispatchMismatchError extends Error {
  readonly reason: "workflow_not_active" | "workflow_definition_changed";

  constructor(reason: "workflow_not_active" | "workflow_definition_changed") {
    super(reason);
    this.name = "VisualWorkflowDispatchMismatchError";
    this.reason = reason;
  }
}

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

export async function getVisualWorkflowRunByIdempotencyKey(input: {
  organizationId: string;
  visualWorkflowId: string;
  idempotencyKey: string;
  dbClient?: DatabaseClient;
}) {
  const dbClient = input.dbClient ?? db;
  const [row] = await dbClient
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
  matchedDefinitionVersion?: number;
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

  if (input.matchedDefinitionVersion !== undefined) {
    if (workflow.status !== "active") {
      throw new VisualWorkflowDispatchMismatchError("workflow_not_active");
    }
    if (workflow.definitionVersion !== input.matchedDefinitionVersion) {
      throw new VisualWorkflowDispatchMismatchError("workflow_definition_changed");
    }
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
      inputSnapshot: buildRunInputSnapshot({
        triggerInput: input.inputSnapshot,
        definition: workflow.definition,
      }),
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

export type EnqueueVisualWorkflowRunOnceResult = {
  enqueuedNow: boolean;
  scheduleSlotCommitted: boolean;
};

export async function enqueueVisualWorkflowRunOnce(input: {
  runId: string;
  organizationId: string;
  enqueue: () => Promise<void>;
  dbClient?: DatabaseClient;
}): Promise<EnqueueVisualWorkflowRunOnceResult> {
  const dbClient = input.dbClient ?? db;
  const claim = await dbClient.transaction(async (tx) => {
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

    if (visualWorkflowRunEnqueueCommitted(run.outputSummary)) {
      return { shouldEnqueue: false, scheduleSlotCommitted: true } as const;
    }

    if (visualWorkflowRunEnqueueInProgress(run.outputSummary)) {
      return { shouldEnqueue: false, scheduleSlotCommitted: false } as const;
    }

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

    return { shouldEnqueue: true, scheduleSlotCommitted: false } as const;
  });

  if (!claim.shouldEnqueue) {
    return {
      enqueuedNow: false,
      scheduleSlotCommitted: claim.scheduleSlotCommitted,
    };
  }

  try {
    await input.enqueue();
    await markVisualWorkflowRunEnqueueCommitted({
      runId: input.runId,
      organizationId: input.organizationId,
      dbClient,
    });
    return { enqueuedNow: true, scheduleSlotCommitted: true };
  } catch (error) {
    await clearVisualWorkflowRunEnqueueMarker({
      runId: input.runId,
      organizationId: input.organizationId,
      dbClient,
    });
    throw error;
  }
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
  const conflictUpdate: Partial<typeof schema.visualWorkflowNodeRuns.$inferInsert> & {
    updatedAt: Date;
  } = {
    status: input.status,
    updatedAt: new Date(),
  };

  if (input.inputSnapshot !== undefined) {
    conflictUpdate.inputSnapshot = input.inputSnapshot;
  }
  if (input.outputSnapshot !== undefined) {
    conflictUpdate.outputSnapshot = input.outputSnapshot;
  }
  if (input.error !== undefined) {
    conflictUpdate.error = input.error;
  }
  if (input.startedAt !== undefined) {
    conflictUpdate.startedAt = input.startedAt;
  }
  if (input.finishedAt !== undefined) {
    conflictUpdate.finishedAt = input.finishedAt;
  }

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
      set: conflictUpdate,
    })
    .returning();

  return serializeNodeRun(row);
}

export async function failInFlightVisualWorkflowRun(input: {
  runId: string;
  organizationId: string;
  visualWorkflowId: string;
  message: string;
}): Promise<void> {
  const run = await getVisualWorkflowRunById({
    organizationId: input.organizationId,
    visualWorkflowId: input.visualWorkflowId,
    runId: input.runId,
  });

  if (!run || run.status !== "running") {
    return;
  }

  await finishVisualWorkflowRun({
    runId: input.runId,
    organizationId: input.organizationId,
    status: "failed",
    error: { message: input.message },
  });
}

export async function executeVisualWorkflowRun(input: {
  runId: string;
  organizationId: string;
  visualWorkflowId: string;
}): Promise<VisualWorkflowRunRecord | null> {
  const claim = await claimVisualWorkflowRunForExecution(input);
  if (!claim) {
    return null;
  }

  if (claim.kind === "already_finished" || claim.kind === "already_running") {
    return claim.run;
  }

  const run = claim.run;

  const workflow = await getVisualWorkflowById({
    organizationId: input.organizationId,
    visualWorkflowId: input.visualWorkflowId,
  });
  if (!workflow) {
    return finishVisualWorkflowRun({
      runId: input.runId,
      organizationId: input.organizationId,
      status: "failed",
      error: { message: "visual_workflow_not_found" },
    });
  }

  const definition = resolveRunDefinition({ run, workflow });
  if (!definition) {
    return finishVisualWorkflowRun({
      runId: input.runId,
      organizationId: input.organizationId,
      status: "failed",
      error: { message: "visual_workflow_definition_snapshot_missing" },
    });
  }

  const { runVisualWorkflowInterpreter } = await import("./runtime/interpreter-server");
  const result = await runVisualWorkflowInterpreter({
    definition,
    organizationId: input.organizationId,
    triggerInput: extractTriggerInputFromRunSnapshot(run.inputSnapshot),
    onNodeUpdate: async (update) => {
      await upsertVisualWorkflowNodeRun({
        runId: input.runId,
        organizationId: input.organizationId,
        nodeId: update.nodeId,
        nodeType: update.nodeType,
        status: update.status,
        ...(update.inputSnapshot !== undefined ? { inputSnapshot: update.inputSnapshot } : {}),
        ...(update.outputSnapshot !== undefined ? { outputSnapshot: update.outputSnapshot } : {}),
        ...(update.error !== undefined ? { error: update.error } : {}),
        ...(update.status === "running" ? { startedAt: new Date() } : {}),
        ...(update.status === "succeeded" || update.status === "failed"
          ? { finishedAt: new Date() }
          : {}),
      });
    },
  });

  if (!result.ok) {
    return finishVisualWorkflowRun({
      runId: input.runId,
      organizationId: input.organizationId,
      status: "failed",
      error: {
        ...result.error,
        failedNodeId: result.failedNodeId,
      },
      outputSummaryPatch: {
        nodeResults: result.nodeResults,
      },
    });
  }

  return finishVisualWorkflowRun({
    runId: input.runId,
    organizationId: input.organizationId,
    status: "succeeded",
    outputSummaryPatch: {
      nodeResults: result.nodeResults,
    },
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

  const { buildVisualWorkflowManualIdempotencyKey } = await import("./dispatch/idempotency");
  const persistedIdempotencyKey = buildVisualWorkflowManualIdempotencyKey({
    visualWorkflowId: input.visualWorkflowId,
    definitionVersion: workflow.definitionVersion,
    idempotencyKey: input.idempotencyKey,
  });

  const run = await createVisualWorkflowRun({
    organizationId: input.organizationId,
    visualWorkflowId: input.visualWorkflowId,
    triggerSource: "manual",
    idempotencyKey: persistedIdempotencyKey,
    inputSnapshot: input.inputSnapshot,
  });

  const { createVisualWorkflowExecutionQueue } = await import("@/workflows/adapters");
  const queue = input.queue ?? createVisualWorkflowExecutionQueue();
  const enqueueResult = await enqueueVisualWorkflowRunOnce({
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

  return { runId: run.id, enqueued: enqueueResult.enqueuedNow };
}
