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
import { updateProviderWebhookEventProcessingStatus } from "./provider-webhook-storage";

export type ProcessProviderSyncIntentInput = {
  intentId: string;
  organizationId: string;
  workerId: string;
  dispatcher?: ProviderSyncIntentDispatcher;
};

export type ProcessProviderSyncIntentResult =
  | { ok: true; intentId: string; providerSyncRunId: string; status: "succeeded" }
  | { ok: false; intentId: string; status: "retryable" | "failed" | "skipped"; reason: string };

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

  for (const eventId of webhookEventIds) {
    await updateProviderWebhookEventProcessingStatus({
      eventId,
      organizationId: input.organizationId,
      processingStatus: "processing",
    });
  }

  try {
    const dispatchResult = await dispatcher.dispatch(claimed);

    if (dispatchResult.status === "failed") {
      const failedIntent = await failProviderSyncIntent({
        intentId: claimed.id,
        organizationId: input.organizationId,
        errorMessage: "provider_sync_run_failed",
        providerSyncRunId: dispatchResult.runId,
        retryable: true,
      });

      for (const eventId of webhookEventIds) {
        await updateProviderWebhookEventProcessingStatus({
          eventId,
          organizationId: input.organizationId,
          processingStatus: "failed",
          errorMessage: "provider_sync_run_failed",
          providerSyncRunId: dispatchResult.runId,
          providerSyncIntentId: claimed.id,
          nextRetryAt: failedIntent?.nextAttemptAt ?? null,
        });
      }

      return {
        ok: false,
        intentId: claimed.id,
        status: failedIntent?.status === "retryable" ? "retryable" : "failed",
        reason: "provider_sync_run_failed",
      };
    }

    await completeProviderSyncIntent({
      intentId: claimed.id,
      organizationId: input.organizationId,
      providerSyncRunId: dispatchResult.runId,
    });

    for (const eventId of webhookEventIds) {
      await updateProviderWebhookEventProcessingStatus({
        eventId,
        organizationId: input.organizationId,
        processingStatus: "succeeded",
        providerSyncRunId: dispatchResult.runId,
        providerSyncIntentId: claimed.id,
      });
    }

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
      errorMessage: message,
      errorDetails: {
        name: error instanceof Error ? error.name : "UnknownError",
      },
      retryable,
    });

    for (const eventId of webhookEventIds) {
      await updateProviderWebhookEventProcessingStatus({
        eventId,
        organizationId: input.organizationId,
        processingStatus: "failed",
        errorMessage: message,
        providerSyncIntentId: claimed.id,
        nextRetryAt: failedIntent?.nextAttemptAt ?? null,
      });
    }

    return {
      ok: false,
      intentId: claimed.id,
      status: failedIntent?.status === "retryable" ? "retryable" : "failed",
      reason: message,
    };
  }
}

export async function enqueueProviderSyncIntentFromWebhookEvent(input: {
  organizationId: string;
  providerKind: import("./organization-external-tms-provider-credentials").ExternalTmsProviderKind;
  providerCredentialId: string;
  projectId?: string | null;
  syncKind: import("./provider-sync-intent-kinds").ProviderSyncIntentKind;
  providerWebhookEventId: string;
  resourceId?: string | null;
  priority?: number;
}) {
  return enqueueProviderSyncIntent({
    organizationId: input.organizationId,
    providerKind: input.providerKind,
    providerCredentialId: input.providerCredentialId,
    projectId: input.projectId,
    syncKind: input.syncKind,
    resourceId: input.resourceId,
    cause: "webhook",
    eventReferences: [input.providerWebhookEventId],
    priority: input.priority ?? 0,
  });
}
