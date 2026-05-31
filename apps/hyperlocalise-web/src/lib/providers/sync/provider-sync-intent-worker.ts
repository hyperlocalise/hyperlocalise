import {
  createDefaultProviderSyncIntentDispatcher,
  type ProviderSyncIntentDispatcher,
} from "./provider-sync-intent-dispatch";
import {
  claimProviderSyncIntent,
  completeProviderSyncIntent,
  enqueueProviderSyncIntent,
  failProviderSyncIntent,
  getProviderSyncIntentById,
} from "./provider-sync-intents";
import {
  ProviderWebhookEventNotFoundError,
  updateProviderWebhookEventProcessingStatus,
} from "../webhooks/provider-webhook-storage";
import {
  logReconciliationFailed,
  logReconciliationSucceeded,
} from "../provider-tms-sync-telemetry";
import type { ProviderWebhookEventProcessingStatus } from "@/lib/database/types";

type WebhookEventStatusUpdate = {
  processingStatus: ProviderWebhookEventProcessingStatus;
  errorMessage?: string | null;
  errorDetails?: Record<string, unknown>;
  providerSyncIntentId?: string | null;
  providerSyncRunId?: string | null;
  nextRetryAt?: Date | null;
};

type MarkWebhookEventStatusesResult = {
  ok: boolean;
  updatedEventIds: string[];
};

async function markWebhookEventStatuses(
  organizationId: string,
  eventIds: string[],
  status: WebhookEventStatusUpdate,
  options: { requireAll: boolean },
): Promise<MarkWebhookEventStatusesResult> {
  const updatedEventIds: string[] = [];

  for (const eventId of eventIds) {
    try {
      await updateProviderWebhookEventProcessingStatus({
        eventId,
        organizationId,
        ...status,
      });
      updatedEventIds.push(eventId);
    } catch (error) {
      if (error instanceof ProviderWebhookEventNotFoundError) {
        if (options.requireAll) {
          return { ok: false, updatedEventIds };
        }
        continue;
      }

      throw error;
    }
  }

  return { ok: true, updatedEventIds };
}

export type ProcessProviderSyncIntentInput = {
  intentId: string;
  organizationId: string;
  workerId: string;
  dispatcher?: ProviderSyncIntentDispatcher;
};

export type ProcessProviderSyncIntentResult =
  | { ok: true; intentId: string; providerSyncRunId: string; status: "succeeded" }
  | {
      ok: false;
      intentId: string;
      status: "retryable" | "failed" | "skipped";
      reason: string;
      nextAttemptAt?: Date | null;
    };

export async function processProviderSyncIntent(
  input: ProcessProviderSyncIntentInput,
): Promise<ProcessProviderSyncIntentResult> {
  const dispatcher = input.dispatcher ?? createDefaultProviderSyncIntentDispatcher();

  const claimed = await claimProviderSyncIntent({
    intentId: input.intentId,
    organizationId: input.organizationId,
    workerId: input.workerId,
  });

  if (!claimed) {
    const existing = await getProviderSyncIntentById({
      intentId: input.intentId,
      organizationId: input.organizationId,
    });

    if (!existing) {
      return {
        ok: false,
        intentId: input.intentId,
        status: "skipped",
        reason: "intent_not_found",
      };
    }

    if (existing.status === "succeeded" || existing.status === "failed") {
      return {
        ok: false,
        intentId: input.intentId,
        status: "skipped",
        reason: `intent_already_${existing.status}`,
      };
    }

    return {
      ok: false,
      intentId: input.intentId,
      status: "skipped",
      reason: "intent_not_claimable",
    };
  }

  const webhookEventIds = claimed.eventReferences;

  const markedProcessing = await markWebhookEventStatuses(
    input.organizationId,
    webhookEventIds,
    { processingStatus: "processing" },
    { requireAll: true },
  );

  if (!markedProcessing.ok) {
    const errorMessage = "provider_webhook_event_not_found";
    await markWebhookEventStatuses(
      input.organizationId,
      markedProcessing.updatedEventIds,
      {
        processingStatus: "failed",
        errorMessage,
        providerSyncIntentId: claimed.id,
      },
      { requireAll: false },
    );

    const failedIntent = await failProviderSyncIntent({
      intentId: claimed.id,
      organizationId: input.organizationId,
      workerId: input.workerId,
      leaseToken: claimed.leaseToken!,
      errorMessage,
      retryable: false,
    });

    if (!failedIntent) {
      return {
        ok: false,
        intentId: claimed.id,
        status: "skipped",
        reason: "intent_lease_lost",
      };
    }

    return {
      ok: false,
      intentId: claimed.id,
      status: "failed",
      reason: errorMessage,
      nextAttemptAt: failedIntent.nextAttemptAt,
    };
  }

  try {
    const dispatchResult = await dispatcher.dispatch(claimed);

    if (dispatchResult.status === "failed") {
      const failedIntent = await failProviderSyncIntent({
        intentId: claimed.id,
        organizationId: input.organizationId,
        workerId: input.workerId,
        leaseToken: claimed.leaseToken!,
        errorMessage: "provider_sync_run_failed",
        providerSyncRunId: dispatchResult.runId,
        retryable: true,
      });

      if (!failedIntent) {
        return {
          ok: false,
          intentId: claimed.id,
          status: "skipped",
          reason: "intent_lease_lost",
        };
      }

      await markWebhookEventStatuses(
        input.organizationId,
        webhookEventIds,
        {
          processingStatus: "failed",
          errorMessage: "provider_sync_run_failed",
          providerSyncRunId: dispatchResult.runId,
          providerSyncIntentId: claimed.id,
          nextRetryAt: failedIntent.nextAttemptAt ?? null,
        },
        { requireAll: false },
      );

      logReconciliationFailed({
        providerKind: claimed.providerKind,
        organizationId: input.organizationId,
        providerSyncIntentId: claimed.id,
        providerSyncRunId: dispatchResult.runId,
        processingStatus: failedIntent.status,
        reason: "provider_sync_run_failed",
      });

      return {
        ok: false,
        intentId: claimed.id,
        status: failedIntent.status === "retryable" ? "retryable" : "failed",
        reason: "provider_sync_run_failed",
        nextAttemptAt: failedIntent.nextAttemptAt,
      };
    }

    const completedIntent = await completeProviderSyncIntent({
      intentId: claimed.id,
      organizationId: input.organizationId,
      workerId: input.workerId,
      leaseToken: claimed.leaseToken!,
      providerSyncRunId: dispatchResult.runId,
    });

    if (!completedIntent) {
      return {
        ok: false,
        intentId: claimed.id,
        status: "skipped",
        reason: "intent_lease_lost",
      };
    }

    await markWebhookEventStatuses(
      input.organizationId,
      webhookEventIds,
      {
        processingStatus: "succeeded",
        providerSyncRunId: dispatchResult.runId,
        providerSyncIntentId: claimed.id,
      },
      { requireAll: false },
    );

    logReconciliationSucceeded({
      providerKind: claimed.providerKind,
      organizationId: input.organizationId,
      providerSyncIntentId: claimed.id,
      providerSyncRunId: dispatchResult.runId,
      syncKind: claimed.syncKind,
    });

    return {
      ok: true,
      intentId: claimed.id,
      providerSyncRunId: dispatchResult.runId,
      status: "succeeded",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "provider_sync_intent_dispatch_failed";
    const retryable = message !== "provider_sync_not_implemented";

    const failedIntent = await failProviderSyncIntent({
      intentId: claimed.id,
      organizationId: input.organizationId,
      workerId: input.workerId,
      leaseToken: claimed.leaseToken!,
      errorMessage: message,
      errorDetails: {
        name: error instanceof Error ? error.name : "UnknownError",
      },
      retryable,
    });

    if (!failedIntent) {
      return {
        ok: false,
        intentId: claimed.id,
        status: "skipped",
        reason: "intent_lease_lost",
      };
    }

    await markWebhookEventStatuses(
      input.organizationId,
      webhookEventIds,
      {
        processingStatus: "failed",
        errorMessage: message,
        providerSyncIntentId: claimed.id,
        nextRetryAt: failedIntent.nextAttemptAt ?? null,
      },
      { requireAll: false },
    );

    logReconciliationFailed({
      providerKind: claimed.providerKind,
      organizationId: input.organizationId,
      providerSyncIntentId: claimed.id,
      processingStatus: failedIntent.status,
      reason: message,
    });

    return {
      ok: false,
      intentId: claimed.id,
      status: failedIntent.status === "retryable" ? "retryable" : "failed",
      reason: message,
      nextAttemptAt: failedIntent.nextAttemptAt,
    };
  }
}

export async function enqueueProviderSyncIntentFromWebhookEvent(input: {
  organizationId: string;
  providerKind: import("../organization-external-tms-provider-credentials").ExternalTmsProviderKind;
  providerCredentialId: string;
  projectId?: string | null;
  syncKind: import("./provider-sync-intent-kinds").ProviderSyncIntentKind;
  providerWebhookEventId: string;
  resourceId?: string | null;
  resourceIds?: string[];
  priority?: number;
}) {
  return enqueueProviderSyncIntent({
    organizationId: input.organizationId,
    providerKind: input.providerKind,
    providerCredentialId: input.providerCredentialId,
    projectId: input.projectId,
    syncKind: input.syncKind,
    resourceId: input.resourceId,
    resourceIds: input.resourceIds,
    cause: "webhook",
    eventReferences: [input.providerWebhookEventId],
    priority: input.priority ?? 0,
  });
}
