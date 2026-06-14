import { getWorkflowMetadata } from "workflow";

import type { ProviderSyncEventData } from "@/lib/workflow/types";

import { executeProviderSyncIntentStep } from "./steps/provider-sync";

export async function providerSyncWorkflow(event: ProviderSyncEventData) {
  "use workflow";

  const { workflowRunId } = getWorkflowMetadata();
  const result = await executeProviderSyncIntentStep(event);

  return {
    workflowRunId,
    ...result,
  };
}
