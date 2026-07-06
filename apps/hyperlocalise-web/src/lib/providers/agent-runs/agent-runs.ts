import { and, desc, eq, inArray, sql, type SQL } from "drizzle-orm";

import {
  formatUsageControlError,
  markUsageEventSucceededByOperationKey,
  reserveUsageEvent,
  trackUsageEventInAutumnByOperationKey,
  usageFeatureIds,
} from "@/lib/billing/usage-control";
import { db, schema } from "@/lib/database";
import type { AgentRunKind, AgentRunStatus } from "@/lib/database/types";
import { isErr } from "@/lib/primitives/result/results";

import type { ExternalTmsProviderKind } from "@/lib/providers/credentials/organization-external-tms-provider-credentials";

type AgentRunInputSnapshot = Record<string, unknown>;
type AgentRunOutputSummary = Record<string, unknown>;
type AgentRunChangedItem = Record<string, unknown>;

export async function createAgentRun(input: {
  organizationId: string;
  providerKind: ExternalTmsProviderKind;
  externalJobId: string;
  externalTaskId?: string | null;
  kind: AgentRunKind;
  actorUserId?: string | null;
  inputSnapshot?: AgentRunInputSnapshot;
  hyperlocaliseJobId?: string | null;
}) {
  const run = await db.transaction(async (tx) => {
    const [createdRun] = await tx
      .insert(schema.agentRuns)
      .values({
        organizationId: input.organizationId,
        providerKind: input.providerKind,
        externalJobId: input.externalJobId,
        externalTaskId: input.externalTaskId ?? null,
        kind: input.kind,
        status: "queued",
        actorUserId: input.actorUserId ?? null,
        inputSnapshot: input.inputSnapshot ?? {},
        hyperlocaliseJobId: input.hyperlocaliseJobId ?? null,
      })
      .returning();

    if (!createdRun) {
      throw new Error("Failed to create agent run");
    }

    const usageEventResult = await reserveUsageEvent({
      db: tx,
      organizationId: input.organizationId,
      featureId: usageFeatureIds.agentRuns,
      operationKey: `agent-run:${createdRun.id}:agent_runs`,
      source: "agent_run_create",
      quantity: 1,
    });

    if (isErr(usageEventResult)) {
      throw new Error(formatUsageControlError(usageEventResult.error));
    }

    return createdRun;
  });

  return run;
}

export async function createOrReuseActivePushApprovedWriteBackAgentRun(input: {
  organizationId: string;
  providerKind: ExternalTmsProviderKind;
  externalJobId: string;
  externalTaskId?: string | null;
  kind: AgentRunKind;
  actorUserId?: string | null;
  inputSnapshot?: AgentRunInputSnapshot;
  hyperlocaliseJobId: string;
}) {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${[
        "push_approved_changes",
        input.organizationId,
        input.hyperlocaliseJobId,
      ].join(":")}, 0))`,
    );

    const [existing] = await tx
      .select()
      .from(schema.agentRuns)
      .where(
        and(
          eq(schema.agentRuns.organizationId, input.organizationId),
          eq(schema.agentRuns.hyperlocaliseJobId, input.hyperlocaliseJobId),
          eq(schema.agentRuns.kind, "translate"),
          inArray(schema.agentRuns.status, ["queued", "running"]),
          sql`${schema.agentRuns.inputSnapshot}->>'action' = 'push_approved_changes'`,
        ),
      )
      .orderBy(desc(schema.agentRuns.createdAt))
      .limit(1);

    if (existing) {
      return { run: existing, reused: true };
    }

    const [run] = await tx
      .insert(schema.agentRuns)
      .values({
        organizationId: input.organizationId,
        providerKind: input.providerKind,
        externalJobId: input.externalJobId,
        externalTaskId: input.externalTaskId ?? null,
        kind: input.kind,
        status: "queued",
        actorUserId: input.actorUserId ?? null,
        inputSnapshot: input.inputSnapshot ?? {},
        hyperlocaliseJobId: input.hyperlocaliseJobId,
      })
      .returning();

    if (!run) {
      throw new Error("Failed to create agent run");
    }

    const usageEventResult = await reserveUsageEvent({
      db: tx,
      organizationId: input.organizationId,
      featureId: usageFeatureIds.agentRuns,
      operationKey: `agent-run:${run.id}:agent_runs`,
      source: "agent_run_create",
      quantity: 1,
    });

    if (isErr(usageEventResult)) {
      throw new Error(formatUsageControlError(usageEventResult.error));
    }

    return { run, reused: false };
  });
}

export async function startAgentRun(input: { runId: string; organizationId: string }) {
  const now = new Date();
  const [run] = await db
    .update(schema.agentRuns)
    .set({
      status: "running",
      startedAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(schema.agentRuns.id, input.runId),
        eq(schema.agentRuns.organizationId, input.organizationId),
        eq(schema.agentRuns.status, "queued"),
      ),
    )
    .returning();

  if (!run) {
    throw new Error("Agent run not found or not in queued state");
  }

  return run;
}

export async function completeAgentRun(input: {
  runId: string;
  organizationId: string;
  outputSummary?: AgentRunOutputSummary;
  changedItems?: AgentRunChangedItem[];
  warnings?: string[];
}) {
  const run = await finishAgentRun({
    runId: input.runId,
    organizationId: input.organizationId,
    status: "succeeded",
    outputSummary: input.outputSummary,
    changedItems: input.changedItems,
    warnings: input.warnings,
  });

  await trackCompletedAgentRunUsage({
    runId: input.runId,
    organizationId: input.organizationId,
    outputSummary: input.outputSummary,
  });

  return run;
}

export async function failAgentRun(input: {
  runId: string;
  organizationId: string;
  outputSummary?: AgentRunOutputSummary;
  changedItems?: AgentRunChangedItem[];
  warnings?: string[];
}) {
  return finishAgentRun({
    runId: input.runId,
    organizationId: input.organizationId,
    status: "failed",
    outputSummary: input.outputSummary,
    changedItems: input.changedItems,
    warnings: input.warnings,
    sourceStatuses: ["queued", "running"],
  });
}

export async function cancelAgentRun(input: { runId: string; organizationId: string }) {
  const now = new Date();
  const [run] = await db
    .update(schema.agentRuns)
    .set({
      status: "cancelled",
      completedAt: now,
      outputSummary: {},
      changedItems: [],
      warnings: [],
      updatedAt: now,
    })
    .where(
      and(
        eq(schema.agentRuns.id, input.runId),
        eq(schema.agentRuns.organizationId, input.organizationId),
        inArray(schema.agentRuns.status, ["queued", "running"]),
      ),
    )
    .returning();

  if (!run) {
    throw new Error("Agent run not found or not in cancellable state");
  }

  return run;
}

async function finishAgentRun(input: {
  runId: string;
  organizationId: string;
  status: Extract<AgentRunStatus, "succeeded" | "failed" | "cancelled">;
  outputSummary?: AgentRunOutputSummary;
  changedItems?: AgentRunChangedItem[];
  warnings?: string[];
  sourceStatuses?: Extract<AgentRunStatus, "queued" | "running">[];
}) {
  const now = new Date();
  const sourceStatuses = input.sourceStatuses ?? ["running"];
  const [run] = await db
    .update(schema.agentRuns)
    .set({
      status: input.status,
      completedAt: now,
      outputSummary: input.outputSummary ?? {},
      changedItems: input.changedItems ?? [],
      warnings: input.warnings ?? [],
      updatedAt: now,
    })
    .where(
      and(
        eq(schema.agentRuns.id, input.runId),
        eq(schema.agentRuns.organizationId, input.organizationId),
        inArray(schema.agentRuns.status, sourceStatuses),
      ),
    )
    .returning();

  if (!run) {
    throw new Error("Agent run not found or not in finishable state");
  }

  return run;
}

async function trackCompletedAgentRunUsage(input: {
  runId: string;
  organizationId: string;
  outputSummary?: AgentRunOutputSummary;
}) {
  const operationKey = `agent-run:${input.runId}:agent_runs`;
  const tokenUsage = extractAgentRunTokenUsage(input.outputSummary);
  const markUsageResult = await markUsageEventSucceededByOperationKey({
    operationKey,
    quantity: tokenUsage?.totalTokens && tokenUsage.totalTokens > 0 ? tokenUsage.totalTokens : 1,
    dimensions: {
      autumn_event_name: "agent_run.completed",
      unit: tokenUsage ? "model_tokens" : "run",
      input_tokens: tokenUsage?.inputTokens ?? null,
      output_tokens: tokenUsage?.outputTokens ?? null,
    },
  });

  if (isErr(markUsageResult)) {
    console.error("[agent-run] Autumn usage event completion failed", {
      runId: input.runId,
      organizationId: input.organizationId,
      operationKey,
      error: formatUsageControlError(markUsageResult.error),
    });
    return;
  }

  const trackUsageResult = await trackUsageEventInAutumnByOperationKey({ operationKey });
  if (isErr(trackUsageResult)) {
    console.error("[agent-run] Autumn usage tracking failed after run succeeded", {
      runId: input.runId,
      organizationId: input.organizationId,
      operationKey,
      error: formatUsageControlError(trackUsageResult.error),
    });
  }
}

function extractAgentRunTokenUsage(outputSummary: AgentRunOutputSummary | undefined) {
  const tokenUsage = outputSummary?.tokenUsage;
  if (!tokenUsage || typeof tokenUsage !== "object") return null;

  const usage = tokenUsage as {
    inputTokens?: unknown;
    outputTokens?: unknown;
    totalTokens?: unknown;
  };
  const inputTokens = typeof usage.inputTokens === "number" ? usage.inputTokens : 0;
  const outputTokens = typeof usage.outputTokens === "number" ? usage.outputTokens : 0;
  const totalTokens =
    typeof usage.totalTokens === "number" ? usage.totalTokens : inputTokens + outputTokens;

  if (totalTokens <= 0) return null;
  return { inputTokens, outputTokens, totalTokens };
}

export async function updateAgentRun(input: {
  runId: string;
  organizationId: string;
  outputSummary?: AgentRunOutputSummary;
  changedItems?: AgentRunChangedItem[];
  warnings?: string[];
  hyperlocaliseJobId?: string | null;
}) {
  const [run] = await db
    .update(schema.agentRuns)
    .set({
      outputSummary: input.outputSummary,
      changedItems: input.changedItems,
      warnings: input.warnings,
      hyperlocaliseJobId: input.hyperlocaliseJobId,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(schema.agentRuns.id, input.runId),
        eq(schema.agentRuns.organizationId, input.organizationId),
        inArray(schema.agentRuns.status, ["queued", "running"]),
      ),
    )
    .returning();

  if (!run) {
    throw new Error("Agent run not found or not in updatable state");
  }

  return run;
}

export async function findActivePushApprovedWriteBackAgentRun(input: {
  organizationId: string;
  hyperlocaliseJobId: string;
}) {
  const [run] = await db
    .select()
    .from(schema.agentRuns)
    .where(
      and(
        eq(schema.agentRuns.organizationId, input.organizationId),
        eq(schema.agentRuns.hyperlocaliseJobId, input.hyperlocaliseJobId),
        eq(schema.agentRuns.kind, "translate"),
        inArray(schema.agentRuns.status, ["queued", "running"]),
        sql`${schema.agentRuns.inputSnapshot}->>'action' = 'push_approved_changes'`,
      ),
    )
    .orderBy(desc(schema.agentRuns.createdAt))
    .limit(1);

  return run ?? null;
}

export async function getAgentRun(input: { runId: string; organizationId: string }) {
  const [run] = await db
    .select()
    .from(schema.agentRuns)
    .where(
      and(
        eq(schema.agentRuns.id, input.runId),
        eq(schema.agentRuns.organizationId, input.organizationId),
      ),
    )
    .limit(1);

  return run ?? null;
}

export async function listAgentRuns(input: {
  organizationId: string;
  providerKind?: ExternalTmsProviderKind;
  externalJobId?: string;
  externalTaskId?: string;
  kind?: AgentRunKind;
  status?: AgentRunStatus;
  actorUserId?: string;
  hyperlocaliseJobId?: string;
  limit?: number;
  offset?: number;
}) {
  const filters: SQL[] = [eq(schema.agentRuns.organizationId, input.organizationId)];

  if (input.providerKind) {
    filters.push(eq(schema.agentRuns.providerKind, input.providerKind));
  }
  if (input.externalJobId) {
    filters.push(eq(schema.agentRuns.externalJobId, input.externalJobId));
  }
  if (input.externalTaskId) {
    filters.push(eq(schema.agentRuns.externalTaskId, input.externalTaskId));
  }
  if (input.kind) {
    filters.push(eq(schema.agentRuns.kind, input.kind));
  }
  if (input.status) {
    filters.push(eq(schema.agentRuns.status, input.status));
  }
  if (input.actorUserId) {
    filters.push(eq(schema.agentRuns.actorUserId, input.actorUserId));
  }
  if (input.hyperlocaliseJobId) {
    filters.push(eq(schema.agentRuns.hyperlocaliseJobId, input.hyperlocaliseJobId));
  }

  return db
    .select()
    .from(schema.agentRuns)
    .where(and(...filters))
    .orderBy(desc(schema.agentRuns.createdAt))
    .limit(input.limit ?? 50)
    .offset(input.offset ?? 0);
}

export async function updateAgentRunChangedItems(input: {
  runId: string;
  organizationId: string;
  changedItems:
    | AgentRunChangedItem[]
    | ((run: typeof schema.agentRuns.$inferSelect) => AgentRunChangedItem[]);
}) {
  return db.transaction(async (tx) => {
    const [currentRun] = await tx
      .select()
      .from(schema.agentRuns)
      .where(
        and(
          eq(schema.agentRuns.id, input.runId),
          eq(schema.agentRuns.organizationId, input.organizationId),
          eq(schema.agentRuns.status, "succeeded"),
        ),
      )
      .limit(1)
      .for("update");

    if (!currentRun) {
      throw new Error("Agent run not found or not in reviewable state");
    }

    const changedItems =
      typeof input.changedItems === "function"
        ? input.changedItems(currentRun)
        : input.changedItems;
    const now = new Date();
    const [run] = await tx
      .update(schema.agentRuns)
      .set({
        changedItems,
        updatedAt: now,
      })
      .where(
        and(
          eq(schema.agentRuns.id, input.runId),
          eq(schema.agentRuns.organizationId, input.organizationId),
          eq(schema.agentRuns.status, "succeeded"),
        ),
      )
      .returning();

    if (!run) {
      throw new Error("Agent run not found or not in reviewable state");
    }

    return run;
  });
}

export async function getAgentRunsByExternalJob(input: {
  organizationId: string;
  providerKind: ExternalTmsProviderKind;
  externalJobId: string;
  externalTaskId?: string | null;
  limit?: number;
}) {
  const filters: SQL[] = [
    eq(schema.agentRuns.organizationId, input.organizationId),
    eq(schema.agentRuns.providerKind, input.providerKind),
    eq(schema.agentRuns.externalJobId, input.externalJobId),
  ];

  if (input.externalTaskId) {
    filters.push(eq(schema.agentRuns.externalTaskId, input.externalTaskId));
  }

  return db
    .select()
    .from(schema.agentRuns)
    .where(and(...filters))
    .orderBy(desc(schema.agentRuns.createdAt))
    .limit(input.limit ?? 50);
}
