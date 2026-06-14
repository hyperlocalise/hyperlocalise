import { and, inArray, isNull, lte, or, sql } from "drizzle-orm";

import { db, schema } from "@/lib/database";
import { createLogger } from "@/lib/log";
import type { ProviderSyncQueue } from "@/lib/workflow/types";
import { createProviderSyncQueue } from "@/workflows/adapters";

const logger = createLogger("provider-sync-workflow-dispatcher");

const WORKFLOW_DISPATCH_STATUSES = ["pending", "retryable"] as const;

export type ProviderSyncWorkflowDispatcherResult = {
  processed: number;
  started: number;
  skipped: number;
};

type ProviderSyncWorkflowIntent = {
  id: string;
  organizationId: string;
};

async function listDueProviderSyncWorkflowIntents(input: {
  limit: number;
  now?: Date;
}): Promise<ProviderSyncWorkflowIntent[]> {
  const now = input.now ?? new Date();

  return db
    .select({
      id: schema.providerSyncIntents.id,
      organizationId: schema.providerSyncIntents.organizationId,
    })
    .from(schema.providerSyncIntents)
    .where(
      and(
        inArray(schema.providerSyncIntents.status, [...WORKFLOW_DISPATCH_STATUSES]),
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
    .orderBy(sql`${schema.providerSyncIntents.priority} desc`, schema.providerSyncIntents.createdAt)
    .limit(input.limit);
}

export async function runProviderSyncWorkflowDispatcher(input?: {
  limit?: number;
  now?: Date;
  queue?: ProviderSyncQueue;
}): Promise<ProviderSyncWorkflowDispatcherResult> {
  const limit = input?.limit ?? 25;
  const queue = input?.queue ?? createProviderSyncQueue();
  const intents = await listDueProviderSyncWorkflowIntents({ limit, now: input?.now });

  let started = 0;
  let skipped = 0;

  for (const intent of intents) {
    try {
      const result = await queue.enqueue({
        providerSyncIntentId: intent.id,
        organizationId: intent.organizationId,
      });
      if (result.ids.length > 0) {
        started += 1;
      } else {
        skipped += 1;
      }
    } catch {
      logger.warn({ intentId: intent.id }, "failed to enqueue provider sync workflow");
      skipped += 1;
    }
  }

  logger.info(
    {
      processed: intents.length,
      started,
      skipped,
    },
    "provider sync workflow dispatcher tick completed",
  );

  return {
    processed: intents.length,
    started,
    skipped,
  };
}
