import { getWorkflowMetadata, sleep } from "workflow";

import { processProviderSyncIntent } from "@/lib/providers/provider-sync-intent-worker";
import type { ProviderWebhookReconciliationEventData } from "@/lib/workflow/types";

export async function providerWebhookReconciliationWorkflow(
  event: ProviderWebhookReconciliationEventData,
) {
  "use workflow";

  const { workflowRunId } = getWorkflowMetadata();

  let result = await processProviderSyncIntent({
    intentId: event.providerSyncIntentId,
    organizationId: event.organizationId,
    workerId: workflowRunId,
  });

  while (!result.ok && result.status === "retryable" && result.nextAttemptAt) {
    await sleep(result.nextAttemptAt);
    result = await processProviderSyncIntent({
      intentId: event.providerSyncIntentId,
      organizationId: event.organizationId,
      workerId: workflowRunId,
    });
  }

  return {
    ok: result.ok,
    workflowRunId,
    providerWebhookEventId: event.providerWebhookEventId,
    providerSyncIntentId: event.providerSyncIntentId,
    organizationId: event.organizationId,
    subscriptionId: event.subscriptionId,
    providerKind: event.providerKind,
    processResult: result,
  };
}
