import { and, desc, eq, type SQL } from "drizzle-orm";

import { db, schema } from "@/lib/database";
import type { ProviderSyncRunKind, ProviderSyncRunStatus } from "@/lib/database/types";

import type { ExternalTmsProviderKind } from "./organization-external-tms-provider-credentials";

type ProviderSyncRunCounts = Record<string, number>;
type ProviderSyncRunMetadata = Record<string, unknown>;

export async function startProviderSyncRun(input: {
  organizationId: string;
  providerKind: ExternalTmsProviderKind;
  kind: ProviderSyncRunKind;
  providerCredentialId?: string | null;
  projectId?: string | null;
  externalProjectId?: string | null;
  resourceType?: string | null;
  resourceId?: string | null;
  externalResourceId?: string | null;
  providerMetadata?: ProviderSyncRunMetadata;
}) {
  const [run] = await db
    .insert(schema.providerSyncRuns)
    .values({
      organizationId: input.organizationId,
      providerCredentialId: input.providerCredentialId ?? null,
      providerKind: input.providerKind,
      kind: input.kind,
      status: "running",
      projectId: input.projectId ?? null,
      externalProjectId: input.externalProjectId ?? null,
      resourceType: input.resourceType ?? null,
      resourceId: input.resourceId ?? null,
      externalResourceId: input.externalResourceId ?? null,
      providerMetadata: input.providerMetadata ?? {},
    })
    .returning();

  if (!run) {
    throw new Error("Failed to start provider sync run");
  }

  return run;
}

export async function completeProviderSyncRun(input: {
  runId: string;
  organizationId: string;
  status?: Extract<ProviderSyncRunStatus, "succeeded" | "cancelled">;
  counts?: ProviderSyncRunCounts;
  providerMetadata?: ProviderSyncRunMetadata;
}) {
  return finishProviderSyncRun({
    runId: input.runId,
    organizationId: input.organizationId,
    status: input.status ?? "succeeded",
    counts: input.counts,
    providerMetadata: input.providerMetadata,
  });
}

export async function failProviderSyncRun(input: {
  runId: string;
  organizationId: string;
  errorMessage: string;
  errorDetails?: ProviderSyncRunMetadata;
  counts?: ProviderSyncRunCounts;
  providerMetadata?: ProviderSyncRunMetadata;
}) {
  return finishProviderSyncRun({
    runId: input.runId,
    organizationId: input.organizationId,
    status: "failed",
    errorMessage: input.errorMessage,
    errorDetails: input.errorDetails,
    counts: input.counts,
    providerMetadata: input.providerMetadata,
  });
}

async function finishProviderSyncRun(input: {
  runId: string;
  organizationId: string;
  status: ProviderSyncRunStatus;
  errorMessage?: string | null;
  errorDetails?: ProviderSyncRunMetadata;
  counts?: ProviderSyncRunCounts;
  providerMetadata?: ProviderSyncRunMetadata;
}) {
  const now = new Date();
  const [run] = await db
    .update(schema.providerSyncRuns)
    .set({
      status: input.status,
      completedAt: now,
      errorMessage: input.errorMessage ?? null,
      errorDetails: input.errorDetails ?? {},
      counts: input.counts ?? {},
      providerMetadata: input.providerMetadata ?? {},
      updatedAt: now,
    })
    .where(
      and(
        eq(schema.providerSyncRuns.id, input.runId),
        eq(schema.providerSyncRuns.organizationId, input.organizationId),
      ),
    )
    .returning();

  if (!run) {
    throw new Error("Provider sync run not found");
  }

  return run;
}

export async function recordProviderSyncRun<T>(
  input: Parameters<typeof startProviderSyncRun>[0],
  operation: (run: Awaited<ReturnType<typeof startProviderSyncRun>>) => Promise<{
    result: T;
    counts?: ProviderSyncRunCounts;
    providerMetadata?: ProviderSyncRunMetadata;
  }>,
) {
  const run = await startProviderSyncRun(input);

  try {
    const output = await operation(run);
    await completeProviderSyncRun({
      runId: run.id,
      organizationId: run.organizationId,
      counts: output.counts,
      providerMetadata: output.providerMetadata,
    });

    return output.result;
  } catch (error) {
    try {
      await failProviderSyncRun({
        runId: run.id,
        organizationId: run.organizationId,
        errorMessage: error instanceof Error ? error.message : "provider sync run failed",
        errorDetails: {
          name: error instanceof Error ? error.name : "UnknownError",
          stack: error instanceof Error ? error.stack : undefined,
        },
      });
    } catch {
      // Ignore failure to persist the error record; always re-throw the original error.
    }

    throw error;
  }
}

export async function listProviderSyncRuns(input: {
  organizationId: string;
  providerKind?: ExternalTmsProviderKind;
  kind?: ProviderSyncRunKind;
  projectId?: string;
  resourceType?: string;
  resourceId?: string;
  status?: ProviderSyncRunStatus;
  limit?: number;
}) {
  const filters: SQL[] = [eq(schema.providerSyncRuns.organizationId, input.organizationId)];

  if (input.providerKind) {
    filters.push(eq(schema.providerSyncRuns.providerKind, input.providerKind));
  }
  if (input.kind) {
    filters.push(eq(schema.providerSyncRuns.kind, input.kind));
  }
  if (input.projectId) {
    filters.push(eq(schema.providerSyncRuns.projectId, input.projectId));
  }
  if (input.resourceType) {
    filters.push(eq(schema.providerSyncRuns.resourceType, input.resourceType));
  }
  if (input.resourceId) {
    filters.push(eq(schema.providerSyncRuns.resourceId, input.resourceId));
  }
  if (input.status) {
    filters.push(eq(schema.providerSyncRuns.status, input.status));
  }

  return db
    .select()
    .from(schema.providerSyncRuns)
    .where(and(...filters))
    .orderBy(desc(schema.providerSyncRuns.startedAt))
    .limit(input.limit ?? 20);
}
