import { createLogger } from "@/lib/log";
import type { WorkspaceAutomationExecutionEventData } from "@/lib/workflow/types";
import type {
  WorkspaceOrchestratorExecutionError,
  WorkspaceOrchestratorExecutionSuccess,
} from "@/agents/automations/workspace/agent/run-workspace-orchestrator";

const logger = createLogger("workspace-automation-step");

export type WorkspaceAutomationStepResult =
  | {
      ok: true;
      value: WorkspaceOrchestratorExecutionSuccess;
    }
  | {
      ok: false;
      error: WorkspaceOrchestratorExecutionError;
    };

export async function executeWorkspaceAutomationStep(
  event: WorkspaceAutomationExecutionEventData,
): Promise<WorkspaceAutomationStepResult> {
  "use step";

  const stepContext = {
    workspaceAutomationRunId: event.workspaceAutomationRunId,
    organizationId: event.organizationId,
  };

  logger.info(stepContext, "workspace automation orchestrator step started");

  const { runWorkspaceOrchestrator } =
    await import("@/agents/automations/workspace/agent/run-workspace-orchestrator");

  try {
    const result = await runWorkspaceOrchestrator({
      workspaceAutomationRunId: event.workspaceAutomationRunId,
      organizationId: event.organizationId,
    });

    if (!result.ok) {
      logger.warn(
        { ...stepContext, message: result.error.message },
        "workspace automation orchestrator step completed with execution error",
      );
      return { ok: false, error: result.error };
    }

    logger.info(
      { ...stepContext, status: result.value.status },
      "workspace automation orchestrator step completed successfully",
    );
    return { ok: true, value: result.value };
  } catch (error) {
    const message = error instanceof Error ? error.message : "workspace_orchestrator_step_failed";
    logger.error({ ...stepContext, message }, "workspace automation orchestrator step threw");
    return {
      ok: false,
      error: {
        code: "workspace_orchestrator_failed",
        message,
        runId: event.workspaceAutomationRunId,
      },
    };
  }
}
