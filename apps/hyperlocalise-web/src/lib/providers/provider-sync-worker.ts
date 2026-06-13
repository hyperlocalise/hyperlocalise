import { randomUUID } from "node:crypto";

import { and, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";

import { db, schema } from "@/lib/database";
import { createLogger } from "@/lib/log";
import {
  logReconciliationFailed,
  logReconciliationSucceeded,
} from "@/lib/providers/provider-tms-sync-telemetry";
import { isErr } from "@/lib/primitives/result/results";

import { executeProviderSyncIntent } from "./provider-sync-executor";
import { enqueueProviderCatalogSyncIntent } from "./provider-sync-intent";

const logger = createLogger("provider-sync-worker");

const ACTIVE_INTENT_STATUSES = ["pending", "retryable"] as const;
const LEASE_DURATION_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 5;

export type ProviderSyncWorkerResult = {
  processed: number;
  succeeded: number;
  failed: number;
  skipped: number;
};

type ProviderSyncIntentRow = typeof schema.providerSyncIntents.$inferSelect;

async function leaseProviderSyncIntents(input: {
  limit: number;
  leasedBy: string;
  now?: Date;
}): Promise<ProviderSyncIntentRow[]> {
  const now = input.now ?? new Date();
  const leaseUntil = new Date(now.getTime() + LEASE_DURATION_MS);

  return db.transaction(async (tx) => {
    const candidates = await tx
      .select()
      .from(schema.providerSyncIntents)
      .where(
        and(
          inArray(schema.providerSyncIntents.status, [...ACTIVE_INTENT_STATUSES]),
          or(
            isNull(schema.providerSyncIntents.nextAttemptAt),
            lte(schema.providerSyncIntents.nextAttemptAt, now),
          ),
          or(
            isNull(schema.providerSyncIntents.leasedUntil),
            lte(schema.providerSyncIntents.leasedUntil, now),
          ),
        ),
      )
      .orderBy(
        sql`${schema.providerSyncIntents.priority} desc`,
        schema.providerSyncIntents.createdAt,
      )
      .limit(input.limit)
      .for("update", { skipLocked: true });

    const leased: ProviderSyncIntentRow[] = [];
    for (const intent of candidates) {
      const leaseToken = randomUUID();
      const [updated] = await tx
        .update(schema.providerSyncIntents)
        .set({
          status: "running",
          leasedUntil: leaseUntil,
          leasedBy: input.leasedBy,
          leaseToken,
          attempts: intent.attempts + 1,
        })
        .where(
          and(
            eq(schema.providerSyncIntents.id, intent.id),
            inArray(schema.providerSyncIntents.status, [...ACTIVE_INTENT_STATUSES]),
          ),
        )
        .returning();

      if (updated) {
        leased.push(updated);
      }
    }

    return leased;
  });
}

async function markIntentSucceeded(intent: ProviderSyncIntentRow, runId: string) {
  await db
    .update(schema.providerSyncIntents)
    .set({
      status: "succeeded",
      providerSyncRunId: runId,
      completedAt: new Date(),
      leasedUntil: null,
      leasedBy: null,
      leaseToken: null,
      lastError: null,
      errorDetails: {},
    })
    .where(eq(schema.providerSyncIntents.id, intent.id));
}

async function markIntentFailed(intent: ProviderSyncIntentRow, message: string) {
  const shouldRetry = intent.attempts < MAX_ATTEMPTS;
  const nextAttemptAt = shouldRetry
    ? new Date(Date.now() + Math.min(intent.attempts * 60_000, 15 * 60_000))
    : null;

  await db
    .update(schema.providerSyncIntents)
    .set({
      status: shouldRetry ? "retryable" : "failed",
      lastError: message,
      nextAttemptAt,
      completedAt: shouldRetry ? null : new Date(),
      leasedUntil: null,
      leasedBy: null,
      leaseToken: null,
    })
    .where(eq(schema.providerSyncIntents.id, intent.id));
}

export async function runProviderSyncWorker(input?: {
  limit?: number;
  leasedBy?: string;
}): Promise<ProviderSyncWorkerResult> {
  const limit = input?.limit ?? 25;
  const leasedBy = input?.leasedBy ?? "provider-sync-worker";
  const intents = await leaseProviderSyncIntents({ limit, leasedBy });

  let succeeded = 0;
  let failed = 0;

  for (const intent of intents) {
    try {
      const result = await executeProviderSyncIntent(intent);
      if (isErr(result)) {
        failed += 1;
        await markIntentFailed(intent, result.error.message);
        logReconciliationFailed({
          providerKind: intent.providerKind,
          organizationId: intent.organizationId,
          providerSyncIntentId: intent.id,
          syncKind: intent.syncKind,
          reason: result.error.code,
        });
        continue;
      }

      succeeded += 1;
      await markIntentSucceeded(intent, result.value.runId);
      logReconciliationSucceeded({
        providerKind: intent.providerKind,
        organizationId: intent.organizationId,
        providerSyncIntentId: intent.id,
        providerSyncRunId: result.value.runId,
        syncKind: intent.syncKind,
      });
    } catch (error) {
      failed += 1;
      const message = error instanceof Error ? error.message : "unknown_error";
      await markIntentFailed(intent, message);
      logger.error(
        { intentId: intent.id, syncKind: intent.syncKind, error: message },
        "unexpected error executing sync intent",
      );
    }
  }

  logger.info(
    {
      processed: intents.length,
      succeeded,
      failed,
    },
    "provider sync worker tick completed",
  );

  return {
    processed: intents.length,
    succeeded,
    failed,
    skipped: 0,
  };
}

export async function scheduleIncrementalProviderSyncIntents(input?: {
  limit?: number;
}): Promise<{ enqueued: number; skipped: number }> {
  const limit = input?.limit ?? 100;
  const credentials = await db
    .select({
      organizationId: schema.organizationExternalTmsProviderCredentials.organizationId,
      providerCredentialId: schema.organizationExternalTmsProviderCredentials.id,
      providerKind: schema.organizationExternalTmsProviderCredentials.providerKind,
    })
    .from(schema.organizationExternalTmsProviderCredentials)
    .limit(limit);

  let enqueued = 0;
  let skipped = 0;

  for (const credential of credentials) {
    const result = await enqueueProviderCatalogSyncIntent({
      organizationId: credential.organizationId,
      providerCredentialId: credential.providerCredentialId,
      providerKind: credential.providerKind,
      cause: "scheduled",
    });

    if (result.created) {
      enqueued += 1;
    } else {
      skipped += 1;
    }
  }

  return { enqueued, skipped };
}
