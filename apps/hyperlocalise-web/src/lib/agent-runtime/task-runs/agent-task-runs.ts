import { and, desc, eq, gt, inArray, sql } from "drizzle-orm";

import {
  formatUsageControlError,
  markUsageEventSucceededByOperationKey,
  reserveUsageEvent,
  trackUsageEventInAutumnByOperationKey,
  usageFeatureIds,
} from "@/lib/billing/usage-control";
import { db, schema, type DatabaseClient } from "@/lib/database";
import type {
  AgentTaskRun,
  AgentTaskRunEvent,
  AgentTaskRunEventType,
  AgentTaskRunKind,
  AgentTaskRunStatus,
  AgentTaskRunSurface,
} from "@/lib/database/types";
import { isErr } from "@/lib/primitives/result/results";

type JsonObject = Record<string, unknown>;

const activeRunStatuses: AgentTaskRunStatus[] = ["queued", "running", "waiting"];

function runUsageOperationKey(runId: string) {
  return `agent-task-run:${runId}:agent_runs`;
}

export function buildAgentTaskRunIdempotencyKey(parts: string[]) {
  return parts.join("\0");
}

export async function createAgentTaskRun(input: {
  organizationId: string;
  projectId?: string | null;
  surface: AgentTaskRunSurface;
  kind: AgentTaskRunKind;
  actorUserId?: string | null;
  inputSnapshot?: JsonObject;
  contextSnapshot?: JsonObject;
  resultRef?: JsonObject;
  idempotencyKey?: string | null;
}): Promise<AgentTaskRun> {
  return db.transaction(async (tx) => {
    const [run] = await tx
      .insert(schema.agentTaskRuns)
      .values({
        organizationId: input.organizationId,
        projectId: input.projectId ?? null,
        surface: input.surface,
        kind: input.kind,
        actorUserId: input.actorUserId ?? null,
        inputSnapshot: input.inputSnapshot ?? {},
        contextSnapshot: input.contextSnapshot ?? {},
        resultRef: input.resultRef ?? {},
        idempotencyKey: input.idempotencyKey ?? null,
      })
      .returning();

    if (!run) {
      throw new Error("Failed to create agent task run");
    }

    const usageEventResult = await reserveUsageEvent({
      db: tx,
      organizationId: input.organizationId,
      featureId: usageFeatureIds.agentRuns,
      operationKey: runUsageOperationKey(run.id),
      source: "agent_task_run_create",
      quantity: 1,
      dimensions: {
        agent_run_id: run.id,
        agent_run_surface: input.surface,
        agent_run_kind: input.kind,
      },
    });

    if (isErr(usageEventResult)) {
      throw new Error(formatUsageControlError(usageEventResult.error));
    }

    return run;
  });
}

export async function createOrReuseActiveAgentTaskRun(input: {
  organizationId: string;
  projectId?: string | null;
  surface: AgentTaskRunSurface;
  kind: AgentTaskRunKind;
  actorUserId?: string | null;
  inputSnapshot?: JsonObject;
  contextSnapshot?: JsonObject;
  resultRef?: JsonObject;
  idempotencyKey: string;
}): Promise<{ run: AgentTaskRun; reused: boolean }> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${[
        "agent_task_run",
        input.organizationId,
        input.idempotencyKey,
      ].join(":")}, 0))`,
    );

    const [existing] = await tx
      .select()
      .from(schema.agentTaskRuns)
      .where(
        and(
          eq(schema.agentTaskRuns.organizationId, input.organizationId),
          eq(schema.agentTaskRuns.idempotencyKey, input.idempotencyKey),
          inArray(schema.agentTaskRuns.status, activeRunStatuses),
        ),
      )
      .orderBy(desc(schema.agentTaskRuns.createdAt))
      .limit(1);

    if (existing) {
      return { run: existing, reused: true };
    }

    const [run] = await tx
      .insert(schema.agentTaskRuns)
      .values({
        organizationId: input.organizationId,
        projectId: input.projectId ?? null,
        surface: input.surface,
        kind: input.kind,
        actorUserId: input.actorUserId ?? null,
        inputSnapshot: input.inputSnapshot ?? {},
        contextSnapshot: input.contextSnapshot ?? {},
        resultRef: input.resultRef ?? {},
        idempotencyKey: input.idempotencyKey,
      })
      .returning();

    if (!run) {
      throw new Error("Failed to create agent task run");
    }

    const usageEventResult = await reserveUsageEvent({
      db: tx,
      organizationId: input.organizationId,
      featureId: usageFeatureIds.agentRuns,
      operationKey: runUsageOperationKey(run.id),
      source: "agent_task_run_create",
      quantity: 1,
      dimensions: {
        agent_run_id: run.id,
        agent_run_surface: input.surface,
        agent_run_kind: input.kind,
      },
    });

    if (isErr(usageEventResult)) {
      throw new Error(formatUsageControlError(usageEventResult.error));
    }

    return { run, reused: false };
  });
}

export async function getAgentTaskRun(input: {
  organizationId: string;
  runId: string;
  database?: DatabaseClient;
}): Promise<AgentTaskRun | null> {
  const database = input.database ?? db;
  const [run] = await database
    .select()
    .from(schema.agentTaskRuns)
    .where(
      and(
        eq(schema.agentTaskRuns.organizationId, input.organizationId),
        eq(schema.agentTaskRuns.id, input.runId),
      ),
    )
    .limit(1);

  return run ?? null;
}

export async function listAgentTaskRunEvents(input: {
  organizationId: string;
  runId: string;
  afterSequence?: number;
  limit?: number;
  database?: DatabaseClient;
}): Promise<AgentTaskRunEvent[]> {
  const database = input.database ?? db;
  const afterSequence = input.afterSequence ?? 0;
  return database
    .select()
    .from(schema.agentTaskRunEvents)
    .where(
      and(
        eq(schema.agentTaskRunEvents.organizationId, input.organizationId),
        eq(schema.agentTaskRunEvents.runId, input.runId),
        gt(schema.agentTaskRunEvents.sequence, afterSequence),
      ),
    )
    .orderBy(schema.agentTaskRunEvents.sequence)
    .limit(input.limit ?? 100);
}

export async function startAgentTaskRun(input: {
  organizationId: string;
  runId: string;
  currentStage?: string | null;
}): Promise<AgentTaskRun> {
  const now = new Date();
  const [run] = await db
    .update(schema.agentTaskRuns)
    .set({
      status: "running",
      currentStage: input.currentStage ?? null,
      startedAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(schema.agentTaskRuns.organizationId, input.organizationId),
        eq(schema.agentTaskRuns.id, input.runId),
        eq(schema.agentTaskRuns.status, "queued"),
      ),
    )
    .returning();

  if (!run) {
    throw new Error("Agent task run not found or not in queued state");
  }

  return run;
}

export async function appendAgentTaskRunEvent(input: {
  organizationId: string;
  runId: string;
  type: AgentTaskRunEventType;
  message: string;
  stage?: string | null;
  payload?: JsonObject;
}): Promise<AgentTaskRunEvent> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${[
        "agent_task_run_event",
        input.organizationId,
        input.runId,
      ].join(":")}, 0))`,
    );

    const [latest] = await tx
      .select({ sequence: schema.agentTaskRunEvents.sequence })
      .from(schema.agentTaskRunEvents)
      .where(
        and(
          eq(schema.agentTaskRunEvents.organizationId, input.organizationId),
          eq(schema.agentTaskRunEvents.runId, input.runId),
        ),
      )
      .orderBy(desc(schema.agentTaskRunEvents.sequence))
      .limit(1);

    const sequence = (latest?.sequence ?? 0) + 1;
    const [event] = await tx
      .insert(schema.agentTaskRunEvents)
      .values({
        organizationId: input.organizationId,
        runId: input.runId,
        sequence,
        type: input.type,
        stage: input.stage ?? null,
        message: input.message,
        payload: input.payload ?? {},
      })
      .returning();

    if (!event) {
      throw new Error("Failed to append agent task run event");
    }

    if (input.type === "stage" && input.stage) {
      await tx
        .update(schema.agentTaskRuns)
        .set({ currentStage: input.stage, updatedAt: new Date() })
        .where(
          and(
            eq(schema.agentTaskRuns.organizationId, input.organizationId),
            eq(schema.agentTaskRuns.id, input.runId),
          ),
        );
    }

    return event;
  });
}

export async function completeAgentTaskRun(input: {
  organizationId: string;
  runId: string;
  outputSummary?: JsonObject;
  resultRef?: JsonObject;
}): Promise<AgentTaskRun> {
  const run = await finishAgentTaskRun({
    organizationId: input.organizationId,
    runId: input.runId,
    status: "succeeded",
    outputSummary: input.outputSummary,
    resultRef: input.resultRef,
  });

  const operationKey = runUsageOperationKey(input.runId);
  const markResult = await markUsageEventSucceededByOperationKey({ operationKey });
  if (!markResult.ok) {
    console.error("[agent-task-run] usage event completion failed", markResult.error);
  }

  const trackResult = await trackUsageEventInAutumnByOperationKey({ operationKey });
  if (!trackResult.ok) {
    console.error("[agent-task-run] Autumn usage tracking failed", trackResult.error);
  }

  return run;
}

export async function failAgentTaskRun(input: {
  organizationId: string;
  runId: string;
  error?: JsonObject;
  outputSummary?: JsonObject;
}): Promise<AgentTaskRun> {
  return finishAgentTaskRun({
    organizationId: input.organizationId,
    runId: input.runId,
    status: "failed",
    error: input.error,
    outputSummary: input.outputSummary,
    sourceStatuses: ["queued", "running", "waiting"],
  });
}

export async function cancelAgentTaskRun(input: {
  organizationId: string;
  runId: string;
}): Promise<AgentTaskRun> {
  return finishAgentTaskRun({
    organizationId: input.organizationId,
    runId: input.runId,
    status: "cancelled",
    sourceStatuses: ["queued", "running", "waiting"],
  });
}

async function finishAgentTaskRun(input: {
  organizationId: string;
  runId: string;
  status: Extract<AgentTaskRunStatus, "succeeded" | "failed" | "cancelled">;
  outputSummary?: JsonObject;
  resultRef?: JsonObject;
  error?: JsonObject;
  sourceStatuses?: AgentTaskRunStatus[];
}): Promise<AgentTaskRun> {
  const now = new Date();
  const sourceStatuses = input.sourceStatuses ?? ["running"];
  const [run] = await db
    .update(schema.agentTaskRuns)
    .set({
      status: input.status,
      outputSummary: input.outputSummary ?? {},
      resultRef: input.resultRef ?? {},
      error: input.error,
      completedAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(schema.agentTaskRuns.organizationId, input.organizationId),
        eq(schema.agentTaskRuns.id, input.runId),
        inArray(schema.agentTaskRuns.status, sourceStatuses),
      ),
    )
    .returning();

  if (!run) {
    throw new Error("Agent task run not found or not in finishable state");
  }

  return run;
}
