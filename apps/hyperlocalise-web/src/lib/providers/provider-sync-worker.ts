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
import { reclaimExpiredProviderSyncIntentLeases } from "./provider-sync-intent";

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

async function leaseProviderSyncIntentById(input: {
  intentId: string;
  organizationId: string;
  leasedBy: string;
  now?: Date;
}): Promise<ProviderSyncIntentRow | null> {
  const now = input.now ?? new Date();
  const leaseUntil = new Date(now.getTime() + LEASE_DURATION_MS);
  const leaseToken = randomUUID();

  const [updated] = await db
    .update(schema.providerSyncIntents)
    .set({
      status: "running",
      leasedUntil: leaseUntil,
      leasedBy: input.leasedBy,
      leaseToken,
      attempts: sql`${schema.providerSyncIntents.attempts} + 1`,
    })
    .where(
      and(
        eq(schema.providerSyncIntents.id, input.intentId),
        eq(schema.providerSyncIntents.organizationId, input.organizationId),
        inArray(schema.providerSyncIntents.status, [...ACTIVE_INTENT_STATUSES]),
        or(
          isNull(schema.providerSyncIntents.leasedUntil),
          lte(schema.providerSyncIntents.leasedUntil, now),
        ),
      ),
    )
    .returning();

  return updated ?? null;
}

async function markIntentSucceeded(intent: ProviderSyncIntentRow, runId: string): Promise<boolean> {
  const leaseToken = intent.leaseToken;
  if (!leaseToken) {
    return false;
  }

  const updated = await db
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
    .where(
      and(
        eq(schema.providerSyncIntents.id, intent.id),
        eq(schema.providerSyncIntents.leaseToken, leaseToken),
        eq(schema.providerSyncIntents.status, "running"),
      ),
    )
    .returning({ id: schema.providerSyncIntents.id });

  return updated.length > 0;
}

async function markIntentFailed(intent: ProviderSyncIntentRow, message: string): Promise<boolean> {
  const leaseToken = intent.leaseToken;
  if (!leaseToken) {
    return false;
  }

  const shouldRetry = intent.attempts < MAX_ATTEMPTS;
  const nextAttemptAt = shouldRetry
    ? new Date(Date.now() + Math.min(intent.attempts * 60_000, 15 * 60_000))
    : null;

  const updated = await db
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
    .where(
      and(
        eq(schema.providerSyncIntents.id, intent.id),
        eq(schema.providerSyncIntents.leaseToken, leaseToken),
        eq(schema.providerSyncIntents.status, "running"),
      ),
    )
    .returning({ id: schema.providerSyncIntents.id });

  return updated.length > 0;
}

export async function runProviderSyncIntentById(input: {
  intentId: string;
  organizationId: string;
  leasedBy?: string;
  now?: Date;
}): Promise<{
  processed: boolean;
  succeeded: boolean;
  runId: string | null;
  skippedReason?: string;
  error?: string;
}> {
  const leasedBy = input.leasedBy ?? "provider-sync-workflow";
  await reclaimExpiredProviderSyncIntentLeases(input.now);
  const intent = await leaseProviderSyncIntentById({
    intentId: input.intentId,
    organizationId: input.organizationId,
    leasedBy,
    now: input.now,
  });

  if (!intent) {
    logger.info(
      {
        intentId: input.intentId,
        organizationId: input.organizationId,
      },
      "provider sync workflow found no claimable intent",
    );
    return {
      processed: false,
      succeeded: false,
      runId: null,
      skippedReason: "intent_not_claimable",
    };
  }

  try {
    const result = await executeProviderSyncIntent(intent);
    if (isErr(result)) {
      const marked = await markIntentFailed(intent, result.error.message);
      if (marked) {
        logReconciliationFailed({
          providerKind: intent.providerKind,
          organizationId: intent.organizationId,
          providerSyncIntentId: intent.id,
          syncKind: intent.syncKind,
          reason: result.error.code,
        });
      } else {
        logger.info(
          { intentId: intent.id, syncKind: intent.syncKind },
          "skipped stale provider sync intent failure update",
        );
      }
      return {
        processed: true,
        succeeded: false,
        runId: null,
        error: result.error.message,
      };
    }

    const marked = await markIntentSucceeded(intent, result.value.runId);
    if (marked) {
      logReconciliationSucceeded({
        providerKind: intent.providerKind,
        organizationId: intent.organizationId,
        providerSyncIntentId: intent.id,
        providerSyncRunId: result.value.runId,
        syncKind: intent.syncKind,
      });
    } else {
      logger.info(
        { intentId: intent.id, syncKind: intent.syncKind },
        "skipped stale provider sync intent success update",
      );
    }
    return {
      processed: true,
      succeeded: marked,
      runId: marked ? result.value.runId : null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_error";
    const marked = await markIntentFailed(intent, message);
    if (!marked) {
      logger.info(
        { intentId: intent.id, syncKind: intent.syncKind },
        "skipped stale provider sync intent failure update",
      );
    }
    logger.error(
      { intentId: intent.id, syncKind: intent.syncKind, error: message },
      "unexpected error executing provider sync workflow intent",
    );
    return {
      processed: true,
      succeeded: false,
      runId: null,
      error: message,
    };
  }
}

export async function runProviderSyncWorker(input?: {
  limit?: number;
  leasedBy?: string;
  now?: Date;
}): Promise<ProviderSyncWorkerResult> {
  const limit = input?.limit ?? 25;
  const leasedBy = input?.leasedBy ?? "provider-sync-worker";
  await reclaimExpiredProviderSyncIntentLeases(input?.now);
  const intents = await leaseProviderSyncIntents({ limit, leasedBy, now: input?.now });

  let succeeded = 0;
  let failed = 0;

  for (const intent of intents) {
    try {
      const result = await executeProviderSyncIntent(intent);
      if (isErr(result)) {
        const marked = await markIntentFailed(intent, result.error.message);
        if (marked) {
          failed += 1;
          logReconciliationFailed({
            providerKind: intent.providerKind,
            organizationId: intent.organizationId,
            providerSyncIntentId: intent.id,
            syncKind: intent.syncKind,
            reason: result.error.code,
          });
        } else {
          logger.info(
            { intentId: intent.id, syncKind: intent.syncKind },
            "skipped stale provider sync intent failure update",
          );
        }
        continue;
      }

      const marked = await markIntentSucceeded(intent, result.value.runId);
      if (marked) {
        succeeded += 1;
        logReconciliationSucceeded({
          providerKind: intent.providerKind,
          organizationId: intent.organizationId,
          providerSyncIntentId: intent.id,
          providerSyncRunId: result.value.runId,
          syncKind: intent.syncKind,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown_error";
      const marked = await markIntentFailed(intent, message);
      if (marked) {
        failed += 1;
        logger.error(
          { intentId: intent.id, syncKind: intent.syncKind, error: message },
          "unexpected error executing sync intent",
        );
      } else {
        logger.info(
          { intentId: intent.id, syncKind: intent.syncKind },
          "skipped stale provider sync intent failure update",
        );
      }
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
