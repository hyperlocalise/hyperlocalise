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

import { and, desc, eq, sql, or, isNull, lte } from "drizzle-orm";

import { db, schema, type DatabaseClient } from "@/lib/database/client";

import { encryptWorkflowPayload, decryptWorkflowPayload } from "./workflow-credentials";
import { redactWorkflowSnapshot, collectWorkflowSecrets } from "./runtime/snapshots";
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

const EXECUTION_PLAN_VERSION = 2;
const DEFINITION_SNAPSHOT_KEY = "definitionSnapshot";

const TERMINAL_VISUAL_WORKFLOW_RUN_STATUSES = new Set<VisualWorkflowRunStatus>([
  "succeeded",
  "failed",
  "cancelled",
  "skipped",
  "needs_attention",
]);

function buildRunInputSnapshot(input: {
  triggerInput?: Record<string, unknown>;
  definition: VisualWorkflowDefinition;
}): Record<string, unknown> {
  const { [DEFINITION_SNAPSHOT_KEY]: _ignored, ...triggerInput } = input.triggerInput ?? {};
  return {
    ...triggerInput,
    [DEFINITION_SNAPSHOT_KEY]: input.definition,
    executionPlanVersion: EXECUTION_PLAN_VERSION,
  };
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
  | { kind: "claimed"; run: VisualWorkflowRunRecord; leaseToken: string }
  | { kind: "already_finished"; run: VisualWorkflowRunRecord }
  | { kind: "already_running"; run: VisualWorkflowRunRecord }
  | null
> {
  const dbClient = input.dbClient ?? db;
  const now = new Date();
  const leaseToken = randomUUID();
  const [claimed] = await dbClient
    .update(schema.visualWorkflowRuns)
    .set({
      status: "running",
      leaseToken,
      leaseExpiresAt: new Date(now.getTime() + 180000),
      startedAt: sql`coalesce(${schema.visualWorkflowRuns.startedAt}, ${now})`,
      updatedAt: now,
    })
    .where(
      and(
        eq(schema.visualWorkflowRuns.id, input.runId),
        eq(schema.visualWorkflowRuns.organizationId, input.organizationId),
        eq(schema.visualWorkflowRuns.visualWorkflowId, input.visualWorkflowId),
        or(
          eq(schema.visualWorkflowRuns.status, "queued"),
          and(
            eq(schema.visualWorkflowRuns.status, "running"),
            or(
              isNull(schema.visualWorkflowRuns.leaseExpiresAt),
              lte(schema.visualWorkflowRuns.leaseExpiresAt, now),
            ),
          ),
        ),
      ),
    )
    .returning();

  if (claimed) {
    return { kind: "claimed", run: serializeRun(claimed), leaseToken };
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
  leaseToken?: string;
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
        ...(input.leaseToken ? [eq(schema.visualWorkflowRuns.leaseToken, input.leaseToken)] : []),
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
        ...(input.leaseToken ? [eq(schema.visualWorkflowRuns.leaseToken, input.leaseToken)] : []),
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
  return typeof marker === "string" && Date.now() - Date.parse(marker) < 180000;
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
    iteration: row.iteration,
    attempt: row.attempt,
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
    mode: row.mode as "live" | "mock",
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
  testDefinition?: VisualWorkflowDefinition;
  mode?: "mock" | "live";
  mockOutputs?: Record<string, Record<string, unknown>>;
  dbClient?: DatabaseClient;
}): Promise<VisualWorkflowRunRecord> {
  if (!input.dbClient)
    return db.transaction((tx) => createVisualWorkflowRun({ ...input, dbClient: tx }));
  const dbClient = input.dbClient;
  const workflow = await getVisualWorkflowById({
    organizationId: input.organizationId,
    visualWorkflowId: input.visualWorkflowId,
    dbClient,
  });
  if (!workflow || workflow.status === "archived") {
    throw new Error("visual_workflow_not_found");
  }

  if (input.matchedDefinitionVersion !== undefined) {
    if (workflow.status !== "active") {
      throw new VisualWorkflowDispatchMismatchError("workflow_not_active");
    }
    if (workflow.publishedVersion !== input.matchedDefinitionVersion) {
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

  const definition = input.testDefinition ?? workflow.publishedDefinition;
  if (!definition) throw new Error("workflow_not_published");
  const payload = buildRunInputSnapshot({ triggerInput: input.inputSnapshot, definition });
  const [row] = await dbClient
    .insert(schema.visualWorkflowRuns)
    .values({
      organizationId: input.organizationId,
      visualWorkflowId: input.visualWorkflowId,
      triggerSource: input.triggerSource,
      status: input.status ?? "queued",
      idempotencyKey: input.idempotencyKey ?? null,
      definitionVersion: input.testDefinition
        ? workflow.definitionVersion
        : workflow.publishedVersion!,
      mode: input.mode ?? "live",
      encryptedPayload: encryptWorkflowPayload({
        ...payload,
        mockOutputs: input.mockOutputs ?? {},
      }),
      inputSnapshot: redactWorkflowSnapshot(payload, collectWorkflowSecrets(payload)) as Record<
        string,
        unknown
      >,
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

  await dbClient
    .insert(schema.visualWorkflowOutbox)
    .values({ runId: row.id, organizationId: row.organizationId, workflowId: row.visualWorkflowId })
    .onConflictDoNothing();
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
    await dbClient
      .update(schema.visualWorkflowOutbox)
      .set({ dispatchedAt: new Date(), leaseExpiresAt: null })
      .where(eq(schema.visualWorkflowOutbox.runId, input.runId));
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
  leaseToken?: string;
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
        ...(input.leaseToken ? [eq(schema.visualWorkflowRuns.leaseToken, input.leaseToken)] : []),
        eq(schema.visualWorkflowRuns.organizationId, input.organizationId),
      ),
    )
    .returning();

  return row ? serializeRun(row) : null;
}

export async function upsertVisualWorkflowNodeRun(input: {
  runId: string;
  leaseToken?: string;
  organizationId: string;
  nodeId: string;
  nodeType: string;
  iteration?: number;
  attempt?: number;
  encryptedOutput?: Record<string, unknown>;
  status: VisualWorkflowNodeRunStatus;
  inputSnapshot?: Record<string, unknown>;
  outputSnapshot?: Record<string, unknown>;
  error?: Record<string, unknown> | null;
  startedAt?: Date | null;
  finishedAt?: Date | null;
  dbClient?: DatabaseClient;
}): Promise<VisualWorkflowNodeRunRecord> {
  if (input.leaseToken && !input.dbClient)
    return db.transaction(async (tx) => {
      const [run] = await tx
        .select({ id: schema.visualWorkflowRuns.id })
        .from(schema.visualWorkflowRuns)
        .where(
          and(
            eq(schema.visualWorkflowRuns.id, input.runId),
            eq(schema.visualWorkflowRuns.organizationId, input.organizationId),
            eq(schema.visualWorkflowRuns.leaseToken, input.leaseToken!),
          ),
        )
        .for("update");
      if (!run) throw new Error("workflow_lease_lost");
      return upsertVisualWorkflowNodeRun({ ...input, dbClient: tx });
    });
  const dbClient = input.dbClient ?? db;
  const conflictUpdate: Partial<typeof schema.visualWorkflowNodeRuns.$inferInsert> & {
    updatedAt: Date;
  } = {
    status: input.status,
    ...(input.encryptedOutput ? { encryptedOutput: input.encryptedOutput } : {}),
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
      iteration: input.iteration ?? -1,
      attempt: input.attempt ?? 1,
      encryptedOutput: input.encryptedOutput,
      status: input.status,
      inputSnapshot: input.inputSnapshot ?? {},
      outputSnapshot: input.outputSnapshot ?? {},
      error: input.error ?? null,
      startedAt: input.startedAt ?? null,
      finishedAt: input.finishedAt ?? null,
    })
    .onConflictDoUpdate({
      target: [
        schema.visualWorkflowNodeRuns.runId,
        schema.visualWorkflowNodeRuns.nodeId,
        schema.visualWorkflowNodeRuns.iteration,
        schema.visualWorkflowNodeRuns.attempt,
      ],
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
}): Promise<(VisualWorkflowRunRecord & { executionLeaseBusy?: boolean }) | null> {
  const claim = await claimVisualWorkflowRunForExecution(input);
  if (!claim) {
    return null;
  }

  if (claim.kind === "already_finished" || claim.kind === "already_running") {
    return { ...claim.run, executionLeaseBusy: claim.kind === "already_running" };
  }

  const run = claim.run;
  const leaseToken = claim.leaseToken;

  const workflow = await getVisualWorkflowById({
    organizationId: input.organizationId,
    visualWorkflowId: input.visualWorkflowId,
  });
  if (!workflow) {
    return finishVisualWorkflowRun({
      leaseToken,
      runId: input.runId,
      organizationId: input.organizationId,
      status: "failed",
      error: { message: "visual_workflow_not_found" },
    });
  }

  const [stored] = await db
    .select()
    .from(schema.visualWorkflowRuns)
    .where(
      and(
        eq(schema.visualWorkflowRuns.id, run.id),
        eq(schema.visualWorkflowRuns.organizationId, input.organizationId),
      ),
    )
    .limit(1);
  const payload = stored?.encryptedPayload
    ? (decryptWorkflowPayload(stored.encryptedPayload) as Record<string, unknown>)
    : run.inputSnapshot;
  const definition = resolveRunDefinition({ run: { ...run, inputSnapshot: payload }, workflow });
  if (!definition || payload.executionPlanVersion !== EXECUTION_PLAN_VERSION)
    return finishVisualWorkflowRun({
      leaseToken,
      runId: run.id,
      organizationId: input.organizationId,
      status: "failed",
      error: { code: "invalid_definition", message: "Recreate this workflow using schema v2." },
    });
  if (stored?.cancelRequestedAt) {
    return updateVisualWorkflowRun({
      leaseToken,
      runId: run.id,
      organizationId: input.organizationId,
      status: "cancelled",
      completedAt: new Date(),
    });
  }
  if (run.startedAt && Date.now() - Date.parse(run.startedAt) > 900000)
    return finishVisualWorkflowRun({
      leaseToken,
      runId: run.id,
      organizationId: input.organizationId,
      status: "failed",
      error: { code: "execution_limit", message: "Run deadline exceeded." },
    });
  const { executeDurableWorkflowSlice } = await import("./runtime/durable-slice");
  const result = await executeDurableWorkflowSlice({
    leaseToken,
    run,
    definition,
    payload,
    organizationId: input.organizationId,
  }).catch(async (error: unknown) => {
    if (error instanceof Error && error.message === "workflow_lease_lost") throw error;
    await updateVisualWorkflowRun({
      leaseToken,
      runId: run.id,
      organizationId: input.organizationId,
      status: "needs_attention",
      completedAt: new Date(),
      error: {
        code: "recovery_failed",
        message:
          "Execution could not be recovered. Check credentials and provider delivery before retrying.",
      },
    });
    return null;
  });
  if (!result)
    return getVisualWorkflowRunById({
      organizationId: input.organizationId,
      visualWorkflowId: input.visualWorkflowId,
      runId: run.id,
    });
  if (!result.ok && result.error.code === "yield_execution") {
    await db
      .update(schema.visualWorkflowRuns)
      .set({ leaseExpiresAt: null })
      .where(
        and(
          eq(schema.visualWorkflowRuns.id, run.id),
          eq(schema.visualWorkflowRuns.leaseToken, leaseToken),
        ),
      );
    return getVisualWorkflowRunById({
      organizationId: input.organizationId,
      visualWorkflowId: input.visualWorkflowId,
      runId: run.id,
    });
  }
  if (!result.ok && ["needs_attention", "cancelled"].includes(String(result.error.code)))
    return updateVisualWorkflowRun({
      leaseToken,
      runId: run.id,
      organizationId: input.organizationId,
      status: result.error.code as "needs_attention" | "cancelled",
      error: result.error,
      completedAt: new Date(),
    });

  if (!result.ok) {
    return finishVisualWorkflowRun({
      leaseToken,
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
    leaseToken,
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
    definitionVersion: workflow.publishedVersion ?? workflow.definitionVersion,
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
