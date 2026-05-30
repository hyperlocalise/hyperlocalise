import { randomUUID } from "node:crypto";

import { and, eq, getTableColumns, inArray, or, sql } from "drizzle-orm";

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

type ProviderSyncIntentJsonbStringArrayColumn =
  | typeof schema.providerSyncIntents.eventReferences
  | typeof schema.providerSyncIntents.resourceIds;

function mergeJsonbStringArray(
  column: ProviderSyncIntentJsonbStringArrayColumn,
  excludedColumn: string,
) {
  return sql<string[]>`(
    select coalesce(jsonb_agg(value order by first_ordinal), '[]'::jsonb)
    from (
      select value, min(ordinality) as first_ordinal
      from jsonb_array_elements_text(${column} || excluded.${sql.identifier(excludedColumn)}) with ordinality as merged(value, ordinality)
      where length(value) > 0
      group by value
    ) unique_values
  )`;
}

function assertSupportedSyncKind(
  syncKind: ProviderSyncRunKind,
): asserts syncKind is ProviderSyncIntentKind {
  if (!isProviderSyncIntentKind(syncKind)) {
    throw new Error("unsupported_provider_sync_intent_kind");
  }
}

function activeIntentTargetWhere() {
  return sql`${schema.providerSyncIntents.status} in ('pending', 'running', 'retryable')`;
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

  const [row] = await db
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
    .onConflictDoUpdate({
      target: schema.providerSyncIntents.leaseKey,
      targetWhere: activeIntentTargetWhere(),
      set: {
        eventReferences: mergeJsonbStringArray(
          schema.providerSyncIntents.eventReferences,
          "event_references",
        ),
        resourceIds: mergeJsonbStringArray(schema.providerSyncIntents.resourceIds, "resource_ids"),
        priority: sql`greatest(${schema.providerSyncIntents.priority}, excluded.priority)`,
        ...(input.providerCredentialId !== undefined
          ? { providerCredentialId: sql`excluded.provider_credential_id` }
          : {}),
        updatedAt: new Date(),
      },
    })
    .returning({
      ...getTableColumns(schema.providerSyncIntents),
      inserted: sql<boolean>`xmax = 0`,
    });

  if (!row) {
    throw new Error("Failed to enqueue provider sync intent");
  }

  const { inserted, ...intent } = row;
  return { intent, coalesced: !inserted };
}

export async function releaseExpiredProviderSyncIntentLeases(input?: { now?: Date }) {
  const now = input?.now ?? new Date();

  const released = await db
    .update(schema.providerSyncIntents)
    .set({
      status: "retryable",
      leasedUntil: null,
      leasedBy: null,
      leaseToken: null,
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

  const leaseToken = randomUUID();

  const [intent] = await db
    .update(schema.providerSyncIntents)
    .set({
      status: "running",
      leasedUntil,
      leasedBy: input.workerId,
      leaseToken,
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
  workerId: string;
  leaseToken: string;
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
      leaseToken: null,
      nextAttemptAt: null,
      completedAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(schema.providerSyncIntents.id, input.intentId),
        eq(schema.providerSyncIntents.organizationId, input.organizationId),
        eq(schema.providerSyncIntents.status, "running"),
        eq(schema.providerSyncIntents.leasedBy, input.workerId),
        eq(schema.providerSyncIntents.leaseToken, input.leaseToken),
      ),
    )
    .returning();

  return intent ?? null;
}

export async function failProviderSyncIntent(input: {
  intentId: string;
  organizationId: string;
  workerId: string;
  leaseToken: string;
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
        eq(schema.providerSyncIntents.status, "running"),
        eq(schema.providerSyncIntents.leasedBy, input.workerId),
        eq(schema.providerSyncIntents.leaseToken, input.leaseToken),
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
      leaseToken: null,
      nextAttemptAt: shouldRetry ? new Date(now.getTime() + retryDelayMs) : null,
      completedAt: shouldRetry ? null : now,
      updatedAt: now,
    })
    .where(
      and(
        eq(schema.providerSyncIntents.id, current.id),
        eq(schema.providerSyncIntents.organizationId, input.organizationId),
        eq(schema.providerSyncIntents.status, "running"),
        eq(schema.providerSyncIntents.leasedBy, input.workerId),
        eq(schema.providerSyncIntents.leaseToken, input.leaseToken),
      ),
    )
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
