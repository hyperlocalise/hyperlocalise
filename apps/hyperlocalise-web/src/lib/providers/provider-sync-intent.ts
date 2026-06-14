import { and, eq, inArray, lte } from "drizzle-orm";

import { db, schema } from "@/lib/database";
import type { ProviderSyncIntentCause, ProviderSyncRunKind } from "@/lib/database/types";
import { createLogger } from "@/lib/log";
import type { ExternalTmsProviderKind } from "@/lib/providers/organization-external-tms-provider-credentials";
import { logIntentEnqueued } from "@/lib/providers/provider-tms-sync-telemetry";

const logger = createLogger("provider-sync-intent");

const ACTIVE_INTENT_STATUSES = ["pending", "running", "retryable"] as const;

export function buildProviderSyncLeaseKey(input: {
  organizationId: string;
  providerKind: ExternalTmsProviderKind;
  syncKind: ProviderSyncRunKind;
  projectId?: string | null;
  resourceId?: string | null;
}) {
  return [
    input.organizationId,
    input.providerKind,
    input.syncKind,
    input.projectId ?? "",
    input.resourceId ?? "",
  ].join(":");
}

export type EnqueueProviderSyncIntentInput = {
  organizationId: string;
  providerCredentialId: string;
  providerKind: ExternalTmsProviderKind;
  projectId?: string | null;
  syncKind: ProviderSyncRunKind;
  cause: ProviderSyncIntentCause;
  resourceId?: string | null;
  priority?: number;
};

export type EnqueueProviderSyncIntentResult = {
  intentId: string;
  created: boolean;
};

export async function reclaimExpiredProviderSyncIntentLeases(now = new Date()) {
  const reclaimed = await db
    .update(schema.providerSyncIntents)
    .set({
      status: "retryable",
      leasedUntil: null,
      leasedBy: null,
      leaseToken: null,
      nextAttemptAt: now,
      lastError: "lease_expired",
    })
    .where(
      and(
        eq(schema.providerSyncIntents.status, "running"),
        lte(schema.providerSyncIntents.leasedUntil, now),
      ),
    )
    .returning({ id: schema.providerSyncIntents.id });

  if (reclaimed.length > 0) {
    logger.warn(
      {
        reclaimedCount: reclaimed.length,
        intentIds: reclaimed.map((intent) => intent.id),
      },
      "reclaimed expired provider sync intent leases",
    );
  }

  return reclaimed.length;
}

export async function enqueueProviderSyncIntent(
  input: EnqueueProviderSyncIntentInput,
): Promise<EnqueueProviderSyncIntentResult> {
  await reclaimExpiredProviderSyncIntentLeases();

  const leaseKey = buildProviderSyncLeaseKey({
    organizationId: input.organizationId,
    providerKind: input.providerKind,
    syncKind: input.syncKind,
    projectId: input.projectId,
    resourceId: input.resourceId,
  });

  const [existing] = await db
    .select({ id: schema.providerSyncIntents.id })
    .from(schema.providerSyncIntents)
    .where(
      and(
        eq(schema.providerSyncIntents.leaseKey, leaseKey),
        inArray(schema.providerSyncIntents.status, [...ACTIVE_INTENT_STATUSES]),
      ),
    )
    .limit(1);

  if (existing) {
    return { intentId: existing.id, created: false };
  }

  const [intent] = await db
    .insert(schema.providerSyncIntents)
    .values({
      organizationId: input.organizationId,
      providerCredentialId: input.providerCredentialId,
      providerKind: input.providerKind,
      projectId: input.projectId ?? null,
      syncKind: input.syncKind,
      resourceId: input.resourceId ?? null,
      cause: input.cause,
      priority: input.priority ?? 0,
      leaseKey,
      status: "pending",
    })
    .returning({ id: schema.providerSyncIntents.id });

  logIntentEnqueued({
    providerKind: input.providerKind,
    organizationId: input.organizationId,
    providerSyncIntentId: intent.id,
    syncKind: input.syncKind,
  });

  logger.info(
    {
      organizationId: input.organizationId,
      providerKind: input.providerKind,
      projectId: input.projectId,
      syncKind: input.syncKind,
      intentId: intent.id,
    },
    "provider sync intent enqueued",
  );

  return { intentId: intent.id, created: true };
}

export async function enqueueProviderCatalogSyncIntent(input: {
  organizationId: string;
  providerCredentialId: string;
  providerKind: ExternalTmsProviderKind;
  cause: ProviderSyncIntentCause;
}) {
  return enqueueProviderSyncIntent({
    organizationId: input.organizationId,
    providerCredentialId: input.providerCredentialId,
    providerKind: input.providerKind,
    syncKind: "project_scan",
    cause: input.cause,
    priority: 20,
  });
}

export async function enqueueProviderProjectMaterializationSyncIntents(input: {
  organizationId: string;
  providerCredentialId: string;
  providerKind: ExternalTmsProviderKind;
  projectId: string;
  cause?: ProviderSyncIntentCause;
}) {
  const cause = input.cause ?? "manual";

  await Promise.all([
    enqueueProviderSyncIntent({
      organizationId: input.organizationId,
      providerCredentialId: input.providerCredentialId,
      providerKind: input.providerKind,
      projectId: input.projectId,
      syncKind: "project_scan",
      cause,
      priority: 10,
    }),
    enqueueProviderSyncIntent({
      organizationId: input.organizationId,
      providerCredentialId: input.providerCredentialId,
      providerKind: input.providerKind,
      projectId: input.projectId,
      syncKind: "file_key_scan",
      cause,
      priority: 5,
    }),
    enqueueProviderSyncIntent({
      organizationId: input.organizationId,
      providerCredentialId: input.providerCredentialId,
      providerKind: input.providerKind,
      projectId: input.projectId,
      syncKind: "job_task_scan",
      cause,
      priority: 5,
    }),
  ]);
}

export async function enqueueProviderProjectJobSyncIntent(input: {
  organizationId: string;
  providerCredentialId: string;
  providerKind: ExternalTmsProviderKind;
  projectId: string;
  cause: ProviderSyncIntentCause;
}) {
  return enqueueProviderSyncIntent({
    organizationId: input.organizationId,
    providerCredentialId: input.providerCredentialId,
    providerKind: input.providerKind,
    projectId: input.projectId,
    syncKind: "job_task_scan",
    cause: input.cause,
    priority: 10,
  });
}

export function maybeEnqueueProviderProjectJobSync(input: {
  organizationId: string;
  providerCredentialId: string;
  providerKind: ExternalTmsProviderKind;
  projectId: string;
}) {
  void enqueueProviderProjectJobSyncIntent({
    organizationId: input.organizationId,
    providerCredentialId: input.providerCredentialId,
    providerKind: input.providerKind,
    projectId: input.projectId,
    cause: "manual",
  }).catch((error) => {
    logger.warn(
      {
        organizationId: input.organizationId,
        projectId: input.projectId,
        providerKind: input.providerKind,
        error: error instanceof Error ? error.message : "unknown_error",
      },
      "failed to enqueue provider project job sync intent",
    );
  });
}
