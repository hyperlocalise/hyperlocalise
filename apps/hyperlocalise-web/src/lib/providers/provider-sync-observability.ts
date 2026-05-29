import { and, desc, eq, inArray, or, sql } from "drizzle-orm";

import { db, schema } from "@/lib/database";
import type { ProviderSyncIntent } from "@/lib/database/types";

import type { ExternalTmsProviderKind } from "./organization-external-tms-provider-credentials";
import {
  isAutomaticSyncActive,
  type ProviderSyncObservability,
  type ProviderSyncObservabilityEntry,
  type ProviderSyncObservabilityIntentSummary,
  type ProviderSyncObservabilityRunSummary,
  type ProviderSyncObservabilityWebhookEventSummary,
} from "./provider-sync-observability-types";
import { getProviderSyncIntentById } from "./provider-sync-intents";
import { logIntentEnqueued } from "./provider-tms-sync-telemetry";
import { listProviderWebhookSubscriptionSummaries } from "./provider-webhook-subscription-manager";
import type { ProviderWebhookSubscriptionSummary } from "./provider-webhook-subscription-types";
import { updateProviderWebhookEventProcessingStatus } from "./provider-webhook-storage";
import { createProviderWebhookReconciliationQueue } from "@/workflows/adapters";

export class ProviderSyncIntentNotRetryableError extends Error {
  constructor() {
    super("provider_sync_intent_not_retryable");
    this.name = "ProviderSyncIntentNotRetryableError";
  }
}

export class ProviderSyncIntentNotFoundError extends Error {
  constructor() {
    super("provider_sync_intent_not_found");
    this.name = "ProviderSyncIntentNotFoundError";
  }
}

function canRetrySyncIntent(intent: Pick<ProviderSyncIntent, "status">) {
  return intent.status === "failed" || intent.status === "retryable";
}

function toWebhookEventSummary(
  row: typeof schema.providerWebhookEvents.$inferSelect,
): ProviderSyncObservabilityWebhookEventSummary {
  return {
    id: row.id,
    eventType: row.eventType,
    processingStatus: row.processingStatus,
    providerSyncIntentId: row.providerSyncIntentId,
    providerSyncRunId: row.providerSyncRunId,
    receivedAt: row.receivedAt.toISOString(),
    processedAt: row.processedAt?.toISOString() ?? null,
    errorMessage: row.errorMessage,
  };
}

function toIntentSummary(intent: ProviderSyncIntent): ProviderSyncObservabilityIntentSummary {
  return {
    id: intent.id,
    syncKind: intent.syncKind,
    status: intent.status,
    cause: intent.cause,
    attempts: intent.attempts,
    maxAttempts: intent.maxAttempts,
    lastError: intent.lastError,
    providerSyncRunId: intent.providerSyncRunId,
    createdAt: intent.createdAt.toISOString(),
    updatedAt: intent.updatedAt.toISOString(),
    completedAt: intent.completedAt?.toISOString() ?? null,
    canRetry: canRetrySyncIntent(intent),
  };
}

function toRunSummary(
  row: typeof schema.providerSyncRuns.$inferSelect,
): ProviderSyncObservabilityRunSummary {
  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    startedAt: row.startedAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
    errorMessage: row.errorMessage,
  };
}

async function latestWebhookEventForSubscription(input: {
  organizationId: string;
  subscriptionId: string;
  projectId?: string | null;
}) {
  const filters = [
    eq(schema.providerWebhookEvents.organizationId, input.organizationId),
    eq(schema.providerWebhookEvents.subscriptionId, input.subscriptionId),
  ];

  if (input.projectId) {
    filters.push(eq(schema.providerWebhookEvents.projectId, input.projectId));
  }

  const [row] = await db
    .select()
    .from(schema.providerWebhookEvents)
    .where(and(...filters))
    .orderBy(desc(schema.providerWebhookEvents.receivedAt))
    .limit(1);

  return row ? toWebhookEventSummary(row) : null;
}

async function latestSyncIntentForScope(input: {
  organizationId: string;
  providerKind: ExternalTmsProviderKind;
  providerCredentialId: string;
  projectId?: string | null;
}) {
  const filters = [
    eq(schema.providerSyncIntents.organizationId, input.organizationId),
    eq(schema.providerSyncIntents.providerKind, input.providerKind),
    eq(schema.providerSyncIntents.providerCredentialId, input.providerCredentialId),
  ];

  if (input.projectId) {
    filters.push(eq(schema.providerSyncIntents.projectId, input.projectId));
  }

  const [row] = await db
    .select()
    .from(schema.providerSyncIntents)
    .where(and(...filters))
    .orderBy(desc(schema.providerSyncIntents.createdAt))
    .limit(1);

  return row ? toIntentSummary(row) : null;
}

async function latestSyncRunForScope(input: {
  organizationId: string;
  providerKind: ExternalTmsProviderKind;
  projectId?: string | null;
  providerSyncRunId?: string | null;
}) {
  if (input.providerSyncRunId) {
    const [row] = await db
      .select()
      .from(schema.providerSyncRuns)
      .where(
        and(
          eq(schema.providerSyncRuns.id, input.providerSyncRunId),
          eq(schema.providerSyncRuns.organizationId, input.organizationId),
        ),
      )
      .limit(1);

    return row ? toRunSummary(row) : null;
  }

  const filters = [
    eq(schema.providerSyncRuns.organizationId, input.organizationId),
    eq(schema.providerSyncRuns.providerKind, input.providerKind),
  ];

  if (input.projectId) {
    filters.push(eq(schema.providerSyncRuns.projectId, input.projectId));
  }

  const [row] = await db
    .select()
    .from(schema.providerSyncRuns)
    .where(and(...filters))
    .orderBy(desc(schema.providerSyncRuns.startedAt))
    .limit(1);

  return row ? toRunSummary(row) : null;
}

function buildEntry(input: {
  subscription: ProviderWebhookSubscriptionSummary;
  latestWebhookEvent: ProviderSyncObservabilityWebhookEventSummary | null;
  latestSyncIntent: ProviderSyncObservabilityIntentSummary | null;
  latestSyncRun: ProviderSyncObservabilityRunSummary | null;
}): ProviderSyncObservabilityEntry {
  return {
    projectId: input.subscription.projectId,
    subscription: input.subscription,
    automaticSyncActive: isAutomaticSyncActive(input.subscription.status),
    latestWebhookEvent: input.latestWebhookEvent,
    latestSyncIntent: input.latestSyncIntent,
    latestSyncRun: input.latestSyncRun,
  };
}

export async function getProviderSyncObservability(input: {
  organizationId: string;
  providerKind: ExternalTmsProviderKind;
  providerCredentialId: string;
  projectId?: string | null;
}): Promise<ProviderSyncObservability> {
  const subscriptions = await listProviderWebhookSubscriptionSummaries({
    organizationId: input.organizationId,
    providerCredentialId: input.providerCredentialId,
  });

  const scopedSubscriptions = subscriptions.filter((subscription) => {
    if (subscription.providerKind !== input.providerKind) {
      return false;
    }

    if (input.projectId === undefined) {
      return true;
    }

    if (input.projectId === null) {
      return subscription.projectId === null;
    }

    return subscription.projectId === input.projectId;
  });

  const entries = await Promise.all(
    scopedSubscriptions.map(async (subscription) => {
      const latestWebhookEvent = await latestWebhookEventForSubscription({
        organizationId: input.organizationId,
        subscriptionId: subscription.id,
        projectId: subscription.projectId,
      });

      const latestSyncIntent = await latestSyncIntentForScope({
        organizationId: input.organizationId,
        providerKind: input.providerKind,
        providerCredentialId: input.providerCredentialId,
        projectId: subscription.projectId,
      });

      const latestSyncRun = await latestSyncRunForScope({
        organizationId: input.organizationId,
        providerKind: input.providerKind,
        projectId: subscription.projectId,
        providerSyncRunId:
          latestWebhookEvent?.providerSyncRunId ?? latestSyncIntent?.providerSyncRunId ?? null,
      });

      return buildEntry({
        subscription,
        latestWebhookEvent,
        latestSyncIntent,
        latestSyncRun,
      });
    }),
  );

  return {
    providerKind: input.providerKind,
    entries,
  };
}

export async function retryProviderSyncIntent(input: {
  organizationId: string;
  providerKind: ExternalTmsProviderKind;
  intentId: string;
  providerWebhookReconciliationQueue?: ReturnType<typeof createProviderWebhookReconciliationQueue>;
}) {
  const intent = await getProviderSyncIntentById({
    intentId: input.intentId,
    organizationId: input.organizationId,
  });

  if (!intent) {
    throw new ProviderSyncIntentNotFoundError();
  }

  if (intent.providerKind !== input.providerKind) {
    throw new ProviderSyncIntentNotFoundError();
  }

  if (!canRetrySyncIntent(intent)) {
    throw new ProviderSyncIntentNotRetryableError();
  }

  const now = new Date();
  const [requeued] = await db
    .update(schema.providerSyncIntents)
    .set({
      status: "pending",
      leasedUntil: null,
      leasedBy: null,
      nextAttemptAt: now,
      completedAt: null,
      lastError: null,
      errorDetails: {},
      updatedAt: now,
    })
    .where(
      and(
        eq(schema.providerSyncIntents.id, intent.id),
        eq(schema.providerSyncIntents.organizationId, input.organizationId),
        inArray(schema.providerSyncIntents.status, ["failed", "retryable"]),
        or(
          sql`${schema.providerSyncIntents.leasedUntil} IS NULL`,
          sql`${schema.providerSyncIntents.leasedUntil} < ${now}`,
        ),
      ),
    )
    .returning();

  if (!requeued) {
    throw new ProviderSyncIntentNotRetryableError();
  }

  const webhookEventId = requeued.eventReferences[0];
  if (!webhookEventId) {
    throw new ProviderSyncIntentNotRetryableError();
  }

  const [webhookEvent] = await db
    .select()
    .from(schema.providerWebhookEvents)
    .where(
      and(
        eq(schema.providerWebhookEvents.id, webhookEventId),
        eq(schema.providerWebhookEvents.organizationId, input.organizationId),
      ),
    )
    .limit(1);

  if (!webhookEvent) {
    throw new ProviderSyncIntentNotFoundError();
  }

  await updateProviderWebhookEventProcessingStatus({
    eventId: webhookEvent.id,
    organizationId: input.organizationId,
    processingStatus: "pending",
    providerSyncIntentId: requeued.id,
    errorMessage: null,
    errorDetails: {},
    nextRetryAt: null,
  });

  const queue =
    input.providerWebhookReconciliationQueue ?? createProviderWebhookReconciliationQueue();

  await queue.enqueue({
    providerWebhookEventId: webhookEvent.id,
    providerSyncIntentId: requeued.id,
    organizationId: input.organizationId,
    subscriptionId: webhookEvent.subscriptionId,
    providerKind: input.providerKind,
  });

  logIntentEnqueued({
    providerKind: input.providerKind,
    organizationId: input.organizationId,
    subscriptionId: webhookEvent.subscriptionId,
    providerWebhookEventId: webhookEvent.id,
    providerSyncIntentId: requeued.id,
    reason: "manual_retry",
  });

  return {
    providerSyncIntent: toIntentSummary(requeued),
  };
}
