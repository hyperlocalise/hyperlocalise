import { and, eq, inArray, or, sql } from "drizzle-orm";

import { db, schema } from "@/lib/database";
import type {
  ProviderSyncIntent,
  ProviderSyncIntentCause,
  ProviderSyncIntentStatus,
  ProviderSyncRunKind,
} from "@/lib/database/types";

import type { ExternalTmsProviderKind } from "./organization-external-tms-provider-credentials";
import { buildProviderSyncIntentLeaseKey } from "./provider-sync-intent-lease";
import {
  isProviderSyncIntentKind,
  type ProviderSyncIntentKind,
} from "./provider-sync-intent-kinds";

export const PROVIDER_SYNC_INTENT_LEASE_MS = 5 * 60 * 1000;
export const PROVIDER_SYNC_INTENT_DEFAULT_MAX_ATTEMPTS = 5;
const ACTIVE_INTENT_STATUSES: ProviderSyncIntentStatus[] = ["pending", "running", "retryable"];

export type EnqueueProviderSyncIntentInput = {
  organizationId: string;
  providerKind: ExternalTmsProviderKind;
  syncKind: ProviderSyncRunKind;
  cause: ProviderSyncIntentCause;
  providerCredentialId?: string | null;
  projectId?: string | null;
  resourceId?: string | null;
  resourceIds?: string[];
  eventReferences?: string[];
  priority?: number;
  maxAttempts?: number;
};

export type EnqueueProviderSyncIntentResult = {
  intent: ProviderSyncIntent;
  coalesced: boolean;
};

function mergeUniqueIds(existing: string[], incoming: string[]) {
  return [...new Set([...existing, ...incoming].filter((value) => value.length > 0))];
}

function assertSupportedSyncKind(
  syncKind: ProviderSyncRunKind,
): asserts syncKind is ProviderSyncIntentKind {
  if (!isProviderSyncIntentKind(syncKind)) {
    throw new Error("unsupported_provider_sync_intent_kind");
  }
}

export async function findActiveProviderSyncIntentByLeaseKey(leaseKey: string) {
  const [intent] = await db
    .select()
    .from(schema.providerSyncIntents)
    .where(
      and(
        eq(schema.providerSyncIntents.leaseKey, leaseKey),
        inArray(schema.providerSyncIntents.status, ACTIVE_INTENT_STATUSES),
      ),
    )
    .limit(1);

  return intent ?? null;
}

export async function enqueueProviderSyncIntent(
  input: EnqueueProviderSyncIntentInput,
): Promise<EnqueueProviderSyncIntentResult> {
  assertSupportedSyncKind(input.syncKind);

  const leaseKey = buildProviderSyncIntentLeaseKey({
    organizationId: input.organizationId,
    providerKind: input.providerKind,
    projectId: input.projectId,
    syncKind: input.syncKind,
    resourceId: input.resourceId,
  });

  const eventReferences = input.eventReferences ?? [];
  const resourceIds = mergeUniqueIds(
    input.resourceIds ?? [],
    input.resourceId ? [input.resourceId] : [],
  );

  const existing = await findActiveProviderSyncIntentByLeaseKey(leaseKey);
  if (existing) {
    const mergedEventReferences = mergeUniqueIds(existing.eventReferences, eventReferences);
    const mergedResourceIds = mergeUniqueIds(existing.resourceIds, resourceIds);
    const nextPriority = Math.max(existing.priority, input.priority ?? 0);

    const [intent] = await db
      .update(schema.providerSyncIntents)
      .set({
        eventReferences: mergedEventReferences,
        resourceIds: mergedResourceIds,
        priority: nextPriority,
        ...(input.providerCredentialId !== undefined
          ? { providerCredentialId: input.providerCredentialId }
          : {}),
        updatedAt: new Date(),
      })
      .where(eq(schema.providerSyncIntents.id, existing.id))
      .returning();

    if (!intent) {
      throw new Error("Failed to coalesce provider sync intent");
    }

    return { intent, coalesced: true };
  }

  const [intent] = await db
    .insert(schema.providerSyncIntents)
    .values({
      organizationId: input.organizationId,
      providerCredentialId: input.providerCredentialId ?? null,
      providerKind: input.providerKind,
      projectId: input.projectId ?? null,
      syncKind: input.syncKind,
      resourceId: input.resourceId ?? null,
      resourceIds,
      cause: input.cause,
      eventReferences,
      priority: input.priority ?? 0,
      leaseKey,
      maxAttempts: input.maxAttempts ?? PROVIDER_SYNC_INTENT_DEFAULT_MAX_ATTEMPTS,
      status: "pending",
    })
    .returning();

  if (!intent) {
    throw new Error("Failed to enqueue provider sync intent");
  }

  return { intent, coalesced: false };
}

export async function releaseExpiredProviderSyncIntentLeases(input?: { now?: Date }) {
  const now = input?.now ?? new Date();

  const released = await db
    .update(schema.providerSyncIntents)
    .set({
      status: "retryable",
      leasedUntil: null,
      leasedBy: null,
      nextAttemptAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(schema.providerSyncIntents.status, "running"),
        sql`${schema.providerSyncIntents.leasedUntil} IS NOT NULL`,
        sql`${schema.providerSyncIntents.leasedUntil} < ${now}`,
      ),
    )
    .returning({ id: schema.providerSyncIntents.id });

  return released.length;
}

export async function claimProviderSyncIntent(input: {
  intentId: string;
  organizationId: string;
  workerId: string;
  leaseMs?: number;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const leasedUntil = new Date(now.getTime() + (input.leaseMs ?? PROVIDER_SYNC_INTENT_LEASE_MS));

  await releaseExpiredProviderSyncIntentLeases({ now });

  const [intent] = await db
    .update(schema.providerSyncIntents)
    .set({
      status: "running",
      leasedUntil,
      leasedBy: input.workerId,
      attempts: sql`${schema.providerSyncIntents.attempts} + 1`,
      updatedAt: now,
    })
    .where(
      and(
        eq(schema.providerSyncIntents.id, input.intentId),
        eq(schema.providerSyncIntents.organizationId, input.organizationId),
        or(
          and(
            inArray(schema.providerSyncIntents.status, ["pending", "retryable"]),
            or(
              sql`${schema.providerSyncIntents.nextAttemptAt} IS NULL`,
              sql`${schema.providerSyncIntents.nextAttemptAt} <= ${now}`,
            ),
            or(
              sql`${schema.providerSyncIntents.leasedUntil} IS NULL`,
              sql`${schema.providerSyncIntents.leasedUntil} < ${now}`,
            ),
          ),
          and(
            eq(schema.providerSyncIntents.status, "running"),
            sql`${schema.providerSyncIntents.leasedUntil} IS NOT NULL`,
            sql`${schema.providerSyncIntents.leasedUntil} < ${now}`,
          ),
        ),
      ),
    )
    .returning();

  return intent ?? null;
}

export async function completeProviderSyncIntent(input: {
  intentId: string;
  organizationId: string;
  providerSyncRunId?: string | null;
}) {
  const now = new Date();
  const [intent] = await db
    .update(schema.providerSyncIntents)
    .set({
      status: "succeeded",
      providerSyncRunId: input.providerSyncRunId ?? null,
      leasedUntil: null,
      leasedBy: null,
      nextAttemptAt: null,
      completedAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(schema.providerSyncIntents.id, input.intentId),
        eq(schema.providerSyncIntents.organizationId, input.organizationId),
      ),
    )
    .returning();

  return intent ?? null;
}

export async function failProviderSyncIntent(input: {
  intentId: string;
  organizationId: string;
  errorMessage: string;
  errorDetails?: Record<string, unknown>;
  retryable?: boolean;
  providerSyncRunId?: string | null;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const [current] = await db
    .select()
    .from(schema.providerSyncIntents)
    .where(
      and(
        eq(schema.providerSyncIntents.id, input.intentId),
        eq(schema.providerSyncIntents.organizationId, input.organizationId),
      ),
    )
    .limit(1);

  if (!current) {
    return null;
  }

  const shouldRetry = input.retryable !== false && current.attempts < current.maxAttempts;
  const retryDelayMs = Math.min(60_000, 1_000 * 2 ** Math.max(0, current.attempts - 1));

  const [intent] = await db
    .update(schema.providerSyncIntents)
    .set({
      status: shouldRetry ? "retryable" : "failed",
      lastError: input.errorMessage,
      errorDetails: input.errorDetails ?? {},
      providerSyncRunId: input.providerSyncRunId ?? null,
      leasedUntil: null,
      leasedBy: null,
      nextAttemptAt: shouldRetry ? new Date(now.getTime() + retryDelayMs) : null,
      completedAt: shouldRetry ? null : now,
      updatedAt: now,
    })
    .where(eq(schema.providerSyncIntents.id, current.id))
    .returning();

  return intent ?? null;
}

export async function getProviderSyncIntentById(input: {
  intentId: string;
  organizationId: string;
}) {
  const [intent] = await db
    .select()
    .from(schema.providerSyncIntents)
    .where(
      and(
        eq(schema.providerSyncIntents.id, input.intentId),
        eq(schema.providerSyncIntents.organizationId, input.organizationId),
      ),
    )
    .limit(1);

  return intent ?? null;
}
