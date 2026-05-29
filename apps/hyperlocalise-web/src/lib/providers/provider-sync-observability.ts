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

function projectScopeKey(projectId: string | null | undefined) {
  return projectId ?? "__all_projects__";
}

async function latestWebhookEventsForSubscriptions(input: {
  organizationId: string;
  subscriptionIds: string[];
}) {
  if (input.subscriptionIds.length === 0) {
    return new Map<string, ProviderSyncObservabilityWebhookEventSummary>();
  }

  const rows = await db
    .selectDistinctOn([schema.providerWebhookEvents.subscriptionId])
    .from(schema.providerWebhookEvents)
    .where(
      and(
        eq(schema.providerWebhookEvents.organizationId, input.organizationId),
        inArray(schema.providerWebhookEvents.subscriptionId, input.subscriptionIds),
      ),
    )
    .orderBy(
      schema.providerWebhookEvents.subscriptionId,
      desc(schema.providerWebhookEvents.receivedAt),
    );

  return new Map(rows.map((row) => [row.subscriptionId, toWebhookEventSummary(row)]));
}

async function latestSyncIntentsForScopes(input: {
  organizationId: string;
  providerKind: ExternalTmsProviderKind;
  providerCredentialId: string;
  projectIds: string[];
  includeGlobalScope: boolean;
}) {
  const filters = [
    eq(schema.providerSyncIntents.organizationId, input.organizationId),
    eq(schema.providerSyncIntents.providerKind, input.providerKind),
    eq(schema.providerSyncIntents.providerCredentialId, input.providerCredentialId),
  ];

  if (!input.includeGlobalScope) {
    if (input.projectIds.length === 0) {
      return new Map<string, ProviderSyncObservabilityIntentSummary>();
    }

    filters.push(inArray(schema.providerSyncIntents.projectId, input.projectIds));
  }

  const rows = await db
    .select()
    .from(schema.providerSyncIntents)
    .where(and(...filters))
    .orderBy(desc(schema.providerSyncIntents.createdAt));

  const latestByScope = new Map<string, ProviderSyncObservabilityIntentSummary>();
  for (const row of rows) {
    if (!latestByScope.has(projectScopeKey(null))) {
      latestByScope.set(projectScopeKey(null), toIntentSummary(row));
    }

    if (row.projectId && input.projectIds.includes(row.projectId)) {
      const key = projectScopeKey(row.projectId);
      if (!latestByScope.has(key)) {
        latestByScope.set(key, toIntentSummary(row));
      }
    }
  }

  return latestByScope;
}

async function latestSyncRunsForScopes(input: {
  organizationId: string;
  providerKind: ExternalTmsProviderKind;
  projectIds: string[];
  providerSyncRunIds: string[];
  includeGlobalScope: boolean;
}) {
  if (
    input.providerSyncRunIds.length === 0 &&
    input.projectIds.length === 0 &&
    !input.includeGlobalScope
  ) {
    return {
      byId: new Map<string, ProviderSyncObservabilityRunSummary>(),
      byScope: new Map<string, ProviderSyncObservabilityRunSummary>(),
    };
  }

  const scopedRunFilters = [
    eq(schema.providerSyncRuns.organizationId, input.organizationId),
    eq(schema.providerSyncRuns.providerKind, input.providerKind),
  ];
  if (!input.includeGlobalScope) {
    scopedRunFilters.push(inArray(schema.providerSyncRuns.projectId, input.projectIds));
  }

  const rows = await db
    .select()
    .from(schema.providerSyncRuns)
    .where(
      and(
        eq(schema.providerSyncRuns.organizationId, input.organizationId),
        or(
          input.providerSyncRunIds.length > 0
            ? inArray(schema.providerSyncRuns.id, input.providerSyncRunIds)
            : undefined,
          and(...scopedRunFilters),
        ),
      ),
    )
    .orderBy(desc(schema.providerSyncRuns.startedAt));

  const byId = new Map<string, ProviderSyncObservabilityRunSummary>();
  const byScope = new Map<string, ProviderSyncObservabilityRunSummary>();
  for (const row of rows) {
    const summary = toRunSummary(row);
    byId.set(row.id, summary);

    if (!byScope.has(projectScopeKey(null))) {
      byScope.set(projectScopeKey(null), summary);
    }

    if (row.projectId && input.projectIds.includes(row.projectId)) {
      const key = projectScopeKey(row.projectId);
      if (!byScope.has(key)) {
        byScope.set(key, summary);
      }
    }
  }

  return { byId, byScope };
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

  const subscriptionIds = scopedSubscriptions.map((subscription) => subscription.id);
  const projectIds = [
    ...new Set(
      scopedSubscriptions
        .map((subscription) => subscription.projectId)
        .filter((projectId): projectId is string => Boolean(projectId)),
    ),
  ];
  const includeGlobalScope = scopedSubscriptions.some((subscription) => !subscription.projectId);

  const latestWebhookEvents = await latestWebhookEventsForSubscriptions({
    organizationId: input.organizationId,
    subscriptionIds,
  });

  const latestSyncIntents = await latestSyncIntentsForScopes({
    organizationId: input.organizationId,
    providerKind: input.providerKind,
    providerCredentialId: input.providerCredentialId,
    projectIds,
    includeGlobalScope,
  });

  const providerSyncRunIds = [
    ...new Set(
      scopedSubscriptions
        .map((subscription) => {
          const latestWebhookEvent = latestWebhookEvents.get(subscription.id) ?? null;
          const latestSyncIntent =
            latestSyncIntents.get(projectScopeKey(subscription.projectId)) ?? null;

          return latestWebhookEvent?.providerSyncRunId ?? latestSyncIntent?.providerSyncRunId;
        })
        .filter((providerSyncRunId): providerSyncRunId is string => Boolean(providerSyncRunId)),
    ),
  ];

  const latestSyncRuns = await latestSyncRunsForScopes({
    organizationId: input.organizationId,
    providerKind: input.providerKind,
    projectIds,
    providerSyncRunIds,
    includeGlobalScope,
  });

  const entries = scopedSubscriptions.map((subscription) => {
    const latestWebhookEvent = latestWebhookEvents.get(subscription.id) ?? null;
    const latestSyncIntent = latestSyncIntents.get(projectScopeKey(subscription.projectId)) ?? null;
    const providerSyncRunId =
      latestWebhookEvent?.providerSyncRunId ?? latestSyncIntent?.providerSyncRunId ?? null;
    const latestSyncRun = providerSyncRunId
      ? (latestSyncRuns.byId.get(providerSyncRunId) ?? null)
      : (latestSyncRuns.byScope.get(projectScopeKey(subscription.projectId)) ?? null);

    return buildEntry({
      subscription,
      latestWebhookEvent,
      latestSyncIntent,
      latestSyncRun,
    });
  });

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

  const webhookEventId = intent.eventReferences[0];
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
