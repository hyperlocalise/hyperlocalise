import { and, desc, eq, inArray, type SQL } from "drizzle-orm";

import { db, schema } from "@/lib/database";
import type { AgentRunKind, AgentRunStatus } from "@/lib/database/types";

import type { ExternalTmsProviderKind } from "./organization-external-tms-provider-credentials";

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
  const [run] = await db
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

  if (!run) {
    throw new Error("Failed to create agent run");
  }

  return run;
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
  return finishAgentRun({
    runId: input.runId,
    organizationId: input.organizationId,
    status: "succeeded",
    outputSummary: input.outputSummary,
    changedItems: input.changedItems,
    warnings: input.warnings,
  });
}

export async function failAgentRun(input: {
  runId: string;
  organizationId: string;
  outputSummary?: AgentRunOutputSummary;
  warnings?: string[];
}) {
  return finishAgentRun({
    runId: input.runId,
    organizationId: input.organizationId,
    status: "failed",
    outputSummary: input.outputSummary,
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
    .limit(input.limit ?? 50);
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
