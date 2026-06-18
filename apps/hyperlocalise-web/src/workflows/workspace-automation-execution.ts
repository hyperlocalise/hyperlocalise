import type { WorkspaceAutomationExecutionEventData } from "@/lib/workflow/types";

import { executeWorkspaceAutomationStep } from "./steps/workspace-automation-execution";

export async function workspaceAutomationExecutionWorkflow(
  event: WorkspaceAutomationExecutionEventData,
) {
  "use workflow";

  const result = await executeWorkspaceAutomationStep(event);

  if (!result.ok) {
    return {
      ok: false as const,
      runId: result.error.runId ?? event.workspaceAutomationRunId,
      message: result.error.message,
    };
  }

  return {
    ok: true as const,
    runId: result.value.runId,
    status: result.value.status,
  };
}
