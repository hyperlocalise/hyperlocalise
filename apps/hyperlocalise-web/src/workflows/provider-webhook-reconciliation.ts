import { getWorkflowMetadata, sleep } from "workflow";

import type { ProviderWebhookReconciliationEventData } from "@/lib/workflow/types";

async function processProviderSyncIntentStep(input: {
  intentId: string;
  organizationId: string;
  workerId: string;
}) {
  "use step";
  const { processProviderSyncIntent } = await import(
    "@/lib/providers/provider-sync-intent-worker"
  );
  return processProviderSyncIntent(input);
}

export async function providerWebhookReconciliationWorkflow(
  event: ProviderWebhookReconciliationEventData,
) {
  "use workflow";

  const { workflowRunId } = getWorkflowMetadata();

  let result = await processProviderSyncIntentStep({
    intentId: event.providerSyncIntentId,
    organizationId: event.organizationId,
    workerId: workflowRunId,
  });

  while (!result.ok && result.status === "retryable" && result.nextAttemptAt) {
    await sleep(result.nextAttemptAt);
    result = await processProviderSyncIntentStep({
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
