import { and, eq, sql } from "drizzle-orm";

import { getAutumnSecretKey } from "@/lib/billing/autumn-config";
import {
  getWorkspaceResourceUsage,
  workspaceResourceFeatureIds,
  type WorkspaceResourceFeatureId,
} from "@/lib/billing/workspace-resource-limits";
import type { DatabaseTransaction } from "@/lib/database";
import { db, schema } from "@/lib/database";

const AUTUMN_API_VERSION = "2.2.0";
const AUTUMN_TRACK_USAGE_URL = "https://api.useautumn.com/v1/balances.track";

type SyncStatus = "synced" | "up_to_date" | "failed" | "skipped";

export type WorkspaceResourceUsageSyncResult = {
  featureId: WorkspaceResourceFeatureId;
  localUsage: number;
  previousSyncedUsage: number;
  delta: number;
  status: SyncStatus;
  operationKey: string | null;
  error: string | null;
};

function workspaceResourceFeatureIdValues(): WorkspaceResourceFeatureId[] {
  return [
    workspaceResourceFeatureIds.seats,
    workspaceResourceFeatureIds.projects,
    workspaceResourceFeatureIds.automations,
    workspaceResourceFeatureIds.integrations,
  ];
}

function syncErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message.slice(0, 500);
  return "workspace_resource_usage_sync_failed";
}

async function lockWorkspaceResourceUsageSync(
  tx: DatabaseTransaction,
  organizationId: string,
  featureId: WorkspaceResourceFeatureId,
) {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${[
      "workspace_resource_usage_sync",
      organizationId,
      featureId,
    ].join(":")}, 0))`,
  );
}

async function getOrCreateSyncState(input: {
  tx: DatabaseTransaction;
  organizationId: string;
  featureId: WorkspaceResourceFeatureId;
}) {
  const [insertedState] = await input.tx
    .insert(schema.workspaceResourceUsageSyncStates)
    .values({
      organizationId: input.organizationId,
      featureId: input.featureId,
      syncedUsage: 0,
    })
    .onConflictDoNothing()
    .returning();

  if (insertedState) return insertedState;

  const [state] = await input.tx
    .select()
    .from(schema.workspaceResourceUsageSyncStates)
    .where(
      and(
        eq(schema.workspaceResourceUsageSyncStates.organizationId, input.organizationId),
        eq(schema.workspaceResourceUsageSyncStates.featureId, input.featureId),
      ),
    )
    .limit(1);

  if (!state) {
    throw new Error("workspace_resource_usage_sync_state_missing");
  }

  return state;
}

async function trackWorkspaceResourceUsageDelta(input: {
  organizationId: string;
  featureId: WorkspaceResourceFeatureId;
  delta: number;
  operationKey: string;
  autumnApiKey: string;
  fetchFn: typeof fetch;
}) {
  const response = await input.fetchFn(AUTUMN_TRACK_USAGE_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.autumnApiKey}`,
      "Content-Type": "application/json",
      "x-api-version": AUTUMN_API_VERSION,
    },
    body: JSON.stringify({
      customer_id: input.organizationId,
      feature_id: input.featureId,
      value: input.delta,
      idempotency_key: input.operationKey,
      properties: {
        source: "workspace_resource_usage_sync",
        feature_id: input.featureId,
      },
    }),
  });

  if (response.ok || response.status === 409) return;
  throw new Error(`Autumn resource usage sync failed with HTTP ${response.status}`);
}

async function syncWorkspaceResourceFeatureUsage(input: {
  organizationId: string;
  featureId: WorkspaceResourceFeatureId;
  localUsage: number;
  autumnApiKey: string;
  fetchFn: typeof fetch;
}): Promise<WorkspaceResourceUsageSyncResult> {
  return db.transaction(async (tx) => {
    await lockWorkspaceResourceUsageSync(tx, input.organizationId, input.featureId);

    const state = await getOrCreateSyncState({
      tx,
      organizationId: input.organizationId,
      featureId: input.featureId,
    });
    const delta = input.localUsage - state.syncedUsage;
    const nextSequence = state.syncSequence + 1;
    const operationKey = [
      "workspace_resource_usage_sync",
      input.organizationId,
      input.featureId,
      nextSequence,
    ].join(":");

    if (delta === 0) {
      await tx
        .update(schema.workspaceResourceUsageSyncStates)
        .set({
          status: "synced",
          lastSyncError: null,
          lastSyncedAt: new Date(),
        })
        .where(eq(schema.workspaceResourceUsageSyncStates.id, state.id));

      return {
        featureId: input.featureId,
        localUsage: input.localUsage,
        previousSyncedUsage: state.syncedUsage,
        delta,
        status: "up_to_date",
        operationKey: null,
        error: null,
      };
    }

    try {
      await trackWorkspaceResourceUsageDelta({
        organizationId: input.organizationId,
        featureId: input.featureId,
        delta,
        operationKey,
        autumnApiKey: input.autumnApiKey,
        fetchFn: input.fetchFn,
      });
    } catch (error) {
      const message = syncErrorMessage(error);
      await tx
        .update(schema.workspaceResourceUsageSyncStates)
        .set({
          status: "failed",
          lastSyncError: message,
        })
        .where(eq(schema.workspaceResourceUsageSyncStates.id, state.id));

      return {
        featureId: input.featureId,
        localUsage: input.localUsage,
        previousSyncedUsage: state.syncedUsage,
        delta,
        status: "failed",
        operationKey,
        error: message,
      };
    }

    await tx
      .update(schema.workspaceResourceUsageSyncStates)
      .set({
        syncedUsage: input.localUsage,
        syncSequence: nextSequence,
        status: "synced",
        lastSyncError: null,
        lastSyncedAt: new Date(),
      })
      .where(eq(schema.workspaceResourceUsageSyncStates.id, state.id));

    return {
      featureId: input.featureId,
      localUsage: input.localUsage,
      previousSyncedUsage: state.syncedUsage,
      delta,
      status: "synced",
      operationKey,
      error: null,
    };
  });
}

export async function syncWorkspaceResourceUsageToAutumn(input: {
  organizationId: string;
  autumnApiKey?: string;
  fetchFn?: typeof fetch;
}) {
  const localUsage = await getWorkspaceResourceUsage({ organizationId: input.organizationId });
  const autumnApiKey = input.autumnApiKey ?? getAutumnSecretKey();

  if (!autumnApiKey) {
    return {
      status: "skipped" as const,
      resourceUsage: localUsage,
      results: workspaceResourceFeatureIdValues().map((featureId) => ({
        featureId,
        localUsage: localUsage[featureId],
        previousSyncedUsage: 0,
        delta: 0,
        status: "skipped" as const,
        operationKey: null,
        error: "autumn_not_configured",
      })),
    };
  }

  const results = [];
  for (const featureId of workspaceResourceFeatureIdValues()) {
    results.push(
      await syncWorkspaceResourceFeatureUsage({
        organizationId: input.organizationId,
        featureId,
        localUsage: localUsage[featureId],
        autumnApiKey,
        fetchFn: input.fetchFn ?? fetch,
      }),
    );
  }

  return {
    status: results.some((result) => result.status === "failed")
      ? ("partial_failed" as const)
      : ("synced" as const),
    resourceUsage: localUsage,
    results,
  };
}
