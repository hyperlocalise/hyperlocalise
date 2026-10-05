/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import type {
  WorkspaceOrchestratorExecutionError,
  WorkspaceOrchestratorExecutionSuccess,
  WorkspaceOrchestratorPrepared,
  WorkspaceOrchestratorToolOutcome,
  WorkspaceOrchestratorToolState,
} from "@/agents/automations/workspace/agent/run-workspace-orchestrator";
import type {
  GithubWorkflowsJobPoll,
  GithubWorkflowsStartOutcome,
  RepositoryAgentStartOutcome,
  RepositoryAgentToolOutcome,
} from "@/agents/automations/workspace/agent/durable-tools";
import type { WorkspaceOrchestratorToolName } from "@/agents/automations/workspace/agent/plan";
import type {
  RepositoryAgentStart,
  RepositoryAgentToolName,
} from "@/agents/automations/workspace/agent/repository-agent";
import type { AgentTodoItem } from "@/lib/agent-contracts/tool-context";
import type { WorkspaceAutomationExecutionEventData } from "@/lib/workflow/types";

/*
 * This file is statically imported by a `"use workflow"` module. Only type imports at module
 * scope; runtime modules are imported inside each step so the orchestrator, database, and tool
 * graph never enter the workflow sandbox bundle.
 */

export type WorkspaceAutomationStepResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: WorkspaceOrchestratorExecutionError };

function stepFailure(
  event: WorkspaceAutomationExecutionEventData,
  error: unknown,
): WorkspaceAutomationStepResult<never> {
  return {
    ok: false,
    error: {
      code: "workspace_orchestrator_failed",
      message: error instanceof Error ? error.message : "workspace_orchestrator_step_failed",
      runId: event.workspaceAutomationRunId,
    },
  };
}

function plainResult<T>(
  result: { ok: true; value: T } | { ok: false; error: WorkspaceOrchestratorExecutionError },
): WorkspaceAutomationStepResult<T> {
  return result.ok ? { ok: true, value: result.value } : { ok: false, error: result.error };
}

export async function prepareWorkspaceAutomationStep(
  event: WorkspaceAutomationExecutionEventData,
): Promise<WorkspaceAutomationStepResult<WorkspaceOrchestratorPrepared>> {
  "use step";

  const { createLogger } = await import("@/lib/log");
  const logger = createLogger("workspace-automation-step");
  const stepContext = {
    workspaceAutomationRunId: event.workspaceAutomationRunId,
    organizationId: event.organizationId,
  };

  try {
    const { getWorkspaceAutomationRunById, getWorkspaceAutomationById } =
      await import("@/lib/agents/workspace-automations");
    const { isContentSyncAutomation } = await import("@/lib/agents/workspace-automation-types");
    const run = await getWorkspaceAutomationRunById({
      organizationId: event.organizationId,
      runId: event.workspaceAutomationRunId,
    });
    if (run) {
      const automation = await getWorkspaceAutomationById({
        organizationId: event.organizationId,
        automationId: run.automationId,
      });
      if (automation && isContentSyncAutomation(automation)) {
        const { executeContentSyncRun } =
          await import("@/lib/agents/content-sync/execute-content-sync");
        const result = await executeContentSyncRun({
          organizationId: event.organizationId,
          workspaceAutomationRunId: event.workspaceAutomationRunId,
        });
        return result.ok
          ? { ok: true, value: { kind: "completed", result: result.value } }
          : { ok: false, error: result.error };
      }
    }

    const { prepareWorkspaceOrchestratorRun } =
      await import("@/agents/automations/workspace/agent/run-workspace-orchestrator");
    const result = plainResult(await prepareWorkspaceOrchestratorRun(event));
    logger.info(
      { ...stepContext, ok: result.ok, kind: result.ok ? result.value.kind : undefined },
      "workspace automation orchestrator prepared",
    );
    return result;
  } catch (error) {
    logger.error(
      { ...stepContext, message: error instanceof Error ? error.message : String(error) },
      "workspace automation prepare step threw",
    );
    return stepFailure(event, error);
  }
}

export async function executeWorkspaceOrchestratorToolStep(input: {
  event: WorkspaceAutomationExecutionEventData;
  planTools: WorkspaceOrchestratorToolName[];
  toolName: WorkspaceOrchestratorToolName;
  toolInput: unknown;
  state: WorkspaceOrchestratorToolState;
}): Promise<WorkspaceOrchestratorToolOutcome> {
  "use step";

  const { executeWorkspaceOrchestratorTool } =
    await import("@/agents/automations/workspace/agent/run-workspace-orchestrator");
  return executeWorkspaceOrchestratorTool({
    workspaceAutomationRunId: input.event.workspaceAutomationRunId,
    organizationId: input.event.organizationId,
    planTools: input.planTools,
    toolName: input.toolName,
    toolInput: input.toolInput,
    state: input.state,
  });
}

type DurableToolStepInput = {
  event: WorkspaceAutomationExecutionEventData;
  planTools: WorkspaceOrchestratorToolName[];
  state: WorkspaceOrchestratorToolState;
};

function durableToolInput(input: DurableToolStepInput) {
  return {
    workspaceAutomationRunId: input.event.workspaceAutomationRunId,
    organizationId: input.event.organizationId,
    planTools: input.planTools,
    state: input.state,
  };
}

export async function startRepositoryAgentStep(
  input: DurableToolStepInput & { toolName: RepositoryAgentToolName },
): Promise<RepositoryAgentStartOutcome> {
  "use step";

  const { startDurableRepositoryAgent } =
    await import("@/agents/automations/workspace/agent/durable-tools");
  return startDurableRepositoryAgent({ ...durableToolInput(input), toolName: input.toolName });
}

export async function executeRepositoryAgentToolStep(input: {
  event: WorkspaceAutomationExecutionEventData;
  start: Pick<RepositoryAgentStart, "sandboxId" | "gitlabContext">;
  toolName: string;
  toolCallId: string;
  toolInput: unknown;
  todos: AgentTodoItem[];
}): Promise<RepositoryAgentToolOutcome> {
  "use step";

  const { executeDurableRepositoryAgentTool } =
    await import("@/agents/automations/workspace/agent/durable-tools");
  return executeDurableRepositoryAgentTool({
    workspaceAutomationRunId: input.event.workspaceAutomationRunId,
    organizationId: input.event.organizationId,
    start: input.start,
    toolName: input.toolName,
    toolCallId: input.toolCallId,
    toolInput: input.toolInput,
    todos: input.todos,
  });
}

export async function finishRepositoryAgentStep(
  input: DurableToolStepInput & { start: RepositoryAgentStart; text: string; usage: unknown },
): Promise<WorkspaceOrchestratorToolOutcome> {
  "use step";

  const { finishDurableRepositoryAgent } =
    await import("@/agents/automations/workspace/agent/durable-tools");
  return finishDurableRepositoryAgent({
    ...durableToolInput(input),
    start: input.start,
    text: input.text,
    usage: input.usage,
  });
}

export async function failRepositoryAgentStep(
  input: DurableToolStepInput & {
    toolName: RepositoryAgentToolName;
    sandboxId: string;
    message: string;
    cancelled: boolean;
  },
): Promise<WorkspaceOrchestratorToolOutcome> {
  "use step";

  const { failDurableRepositoryAgent } =
    await import("@/agents/automations/workspace/agent/durable-tools");
  return failDurableRepositoryAgent({
    ...durableToolInput(input),
    toolName: input.toolName,
    sandboxId: input.sandboxId,
    message: input.message,
    cancelled: input.cancelled,
  });
}

export async function startGithubWorkflowsStep(
  input: DurableToolStepInput & { toolInput: unknown },
): Promise<GithubWorkflowsStartOutcome> {
  "use step";

  const { startDurableGithubWorkflows } =
    await import("@/agents/automations/workspace/agent/durable-tools");
  return startDurableGithubWorkflows({ ...durableToolInput(input), toolInput: input.toolInput });
}

export async function pollGithubWorkflowsJobStep(input: {
  event: WorkspaceAutomationExecutionEventData;
  jobId: string;
}): Promise<GithubWorkflowsJobPoll> {
  "use step";

  const { pollDurableGithubWorkflowsJob } =
    await import("@/agents/automations/workspace/agent/durable-tools");
  return pollDurableGithubWorkflowsJob({
    workspaceAutomationRunId: input.event.workspaceAutomationRunId,
    organizationId: input.event.organizationId,
    jobId: input.jobId,
  });
}

export async function finishGithubWorkflowsStep(
  input: DurableToolStepInput & { jobId: string; operatorNote: string | null },
): Promise<WorkspaceOrchestratorToolOutcome> {
  "use step";

  const { finishDurableGithubWorkflows } =
    await import("@/agents/automations/workspace/agent/durable-tools");
  return finishDurableGithubWorkflows({
    ...durableToolInput(input),
    jobId: input.jobId,
    operatorNote: input.operatorNote,
  });
}

export async function completeWorkspaceAutomationStep(input: {
  event: WorkspaceAutomationExecutionEventData;
  planTools: WorkspaceOrchestratorToolName[];
  state: WorkspaceOrchestratorToolState;
  usage: unknown;
}): Promise<WorkspaceAutomationStepResult<WorkspaceOrchestratorExecutionSuccess>> {
  "use step";

  try {
    const { completeWorkspaceOrchestratorRun } =
      await import("@/agents/automations/workspace/agent/run-workspace-orchestrator");
    return plainResult(
      await completeWorkspaceOrchestratorRun({
        workspaceAutomationRunId: input.event.workspaceAutomationRunId,
        organizationId: input.event.organizationId,
        planTools: input.planTools,
        state: input.state,
        usage: input.usage,
      }),
    );
  } catch (error) {
    return stepFailure(input.event, error);
  }
}

export async function failWorkspaceAutomationStep(input: {
  event: WorkspaceAutomationExecutionEventData;
  state: WorkspaceOrchestratorToolState;
  message: string;
}): Promise<WorkspaceOrchestratorExecutionError> {
  "use step";

  const { failWorkspaceOrchestratorRun } =
    await import("@/agents/automations/workspace/agent/run-workspace-orchestrator");
  return failWorkspaceOrchestratorRun({
    workspaceAutomationRunId: input.event.workspaceAutomationRunId,
    organizationId: input.event.organizationId,
    state: input.state,
    message: input.message,
  });
}
