import { getWorkflowMetadata } from "workflow";

import type { ProviderWebhookReconciliationEventData } from "@/lib/workflow/types";

export async function providerWebhookReconciliationWorkflow(
  event: ProviderWebhookReconciliationEventData,
) {
  "use workflow";

  const { workflowRunId } = getWorkflowMetadata();

  return {
    ok: true,
    workflowRunId,
    providerWebhookEventId: event.providerWebhookEventId,
    organizationId: event.organizationId,
    subscriptionId: event.subscriptionId,
    providerKind: event.providerKind,
  };
}
