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
import { WorkflowAgent } from "@ai-sdk/workflow";
import { isStepCount, jsonSchema, tool, type ToolSet } from "ai";
import { getWorkflowMetadata, sleep } from "workflow";

import {
  isRepositoryAgentToolName,
  WORKSPACE_AUTOMATION_RUN_CANCELLED,
  workspaceOrchestratorDeadlineMs,
} from "@/agents/automations/workspace/agent/durable-tool-budget";
import { forcedWorkspaceOrchestratorStep } from "@/agents/automations/workspace/agent/forced-tool-step";
import type { WorkspaceOrchestratorToolName } from "@/agents/automations/workspace/agent/plan";
import type { RepositoryAgentToolName } from "@/agents/automations/workspace/agent/repository-agent";
import {
  workflowAgentLogCallbacks,
  type WorkflowAgentLogContext,
} from "@/agents/automations/workspace/agent/workflow-agent-logging";
import type {
  WorkspaceOrchestratorToolOutcome,
  WorkspaceOrchestratorToolState,
} from "@/agents/automations/workspace/agent/run-workspace-orchestrator";
import type { AgentTodoItem } from "@/lib/agent-contracts/tool-context";
import {
  REPOSITORY_AGENT_DURABLE_STEP_LIMIT,
  REPOSITORY_AGENT_DURABLE_TIMEOUT_MS,
  WORKSPACE_GITHUB_JOB_DURABLE_POLL_INTERVAL_MS,
  WORKSPACE_GITHUB_JOB_DURABLE_POLL_MAX_MS,
} from "@/lib/agent-runtime/subagents/constants";
import type { WorkspaceAutomationExecutionEventData } from "@/lib/workflow/types";

import {
  completeWorkspaceAutomationStep,
  executeRepositoryAgentToolStep,
  executeWorkspaceOrchestratorToolStep,
  failRepositoryAgentStep,
  failWorkspaceAutomationStep,
  finishGithubWorkflowsStep,
  finishRepositoryAgentStep,
  pollGithubWorkflowsJobStep,
  prepareWorkspaceAutomationStep,
  startGithubWorkflowsStep,
  startRepositoryAgentStep,
} from "./steps/workspace-automation-execution";

type PlannedToolInput = {
  event: WorkspaceAutomationExecutionEventData;
  workflowRunId: string;
  planTools: WorkspaceOrchestratorToolName[];
  state: WorkspaceOrchestratorToolState;
  toolInput: unknown;
};

const LOG_PREFIX = "[workspace-automation-agent]";

function agentLogContext(
  event: WorkspaceAutomationExecutionEventData,
  workflowRunId: string,
  agent: WorkflowAgentLogContext["agent"],
): WorkflowAgentLogContext {
  return {
    agent,
    workspaceAutomationRunId: event.workspaceAutomationRunId,
    organizationId: event.organizationId,
    workflowRunId,
  };
}

const GITHUB_JOB_MAX_POLLS = Math.ceil(
  WORKSPACE_GITHUB_JOB_DURABLE_POLL_MAX_MS / WORKSPACE_GITHUB_JOB_DURABLE_POLL_INTERVAL_MS,
);

/**
 * Run a repository agent as a nested durable loop: one step per model call and per repository
 * tool call, so a long review is bounded by the agent deadline rather than one function call.
 */
async function runRepositoryAgentTool(
  input: PlannedToolInput & { toolName: RepositoryAgentToolName },
): Promise<WorkspaceOrchestratorToolOutcome> {
  const started = await startRepositoryAgentStep({
    event: input.event,
    planTools: input.planTools,
    state: input.state,
    toolName: input.toolName,
  });
  if (!started.ok) {
    return started;
  }

  const { start } = started;
  let todos: AgentTodoItem[] = [];
  let cancelled = false;

  const tools: ToolSet = {};
  for (const spec of started.toolSpecs) {
    tools[spec.name] = tool({
      description: spec.description,
      inputSchema: jsonSchema(spec.inputJsonSchema),
      execute: async (toolInput: unknown, { toolCallId }) => {
        const outcome = await executeRepositoryAgentToolStep({
          event: input.event,
          start: { sandboxId: start.sandboxId, gitlabContext: start.gitlabContext },
          toolName: spec.name,
          toolCallId,
          toolInput,
          todos,
        });
        todos = outcome.todos;
        if (!outcome.ok) {
          cancelled ||= outcome.cancelled === true;
          throw new Error(outcome.message);
        }
        return outcome.output;
      },
    });
  }

  const fail = (message: string) =>
    failRepositoryAgentStep({
      event: input.event,
      planTools: input.planTools,
      state: started.state,
      toolName: input.toolName,
      sandboxId: start.sandboxId,
      message,
      cancelled,
    });

  const logContext = agentLogContext(input.event, input.workflowRunId, input.toolName);
  try {
    const agent = new WorkflowAgent({
      model: start.model,
      instructions: start.instructions,
      tools,
      ...workflowAgentLogCallbacks(logContext),
    });
    const result = await agent.generate({
      messages: [{ role: "user", content: start.prompt }],
      stopWhen: [isStepCount(REPOSITORY_AGENT_DURABLE_STEP_LIMIT), () => cancelled],
      timeout: REPOSITORY_AGENT_DURABLE_TIMEOUT_MS,
    });
    if (cancelled) {
      console.warn(`${LOG_PREFIX} agent stopped: run cancelled`, logContext);
      return fail(WORKSPACE_AUTOMATION_RUN_CANCELLED);
    }
    return finishRepositoryAgentStep({
      event: input.event,
      planTools: input.planTools,
      state: started.state,
      start,
      text: result.text,
      usage: result.usage,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : `${input.toolName}_failed`;
    console.error(`${LOG_PREFIX} agent failed`, { ...logContext, error: message });
    return fail(message);
  }
}

/** Dispatch the GitHub job, then wait with durable sleeps instead of polling inside a step. */
async function runGithubWorkflowsTool(
  input: PlannedToolInput,
): Promise<WorkspaceOrchestratorToolOutcome> {
  const started = await startGithubWorkflowsStep({
    event: input.event,
    planTools: input.planTools,
    state: input.state,
    toolInput: input.toolInput,
  });
  if (started.ok !== "waiting") {
    return started;
  }

  for (let poll = 0; poll < GITHUB_JOB_MAX_POLLS; poll++) {
    const status = await pollGithubWorkflowsJobStep({ event: input.event, jobId: started.jobId });
    if (status !== "pending") {
      console.info(`${LOG_PREFIX} github job wait finished`, {
        workspaceAutomationRunId: input.event.workspaceAutomationRunId,
        workflowRunId: input.workflowRunId,
        jobId: started.jobId,
        status,
        polls: poll + 1,
      });
    }
    if (status === "cancelled") {
      return {
        ok: false,
        message: WORKSPACE_AUTOMATION_RUN_CANCELLED,
        state: started.state,
        cancelled: true,
      };
    }
    if (status !== "pending") {
      break;
    }
    await sleep(WORKSPACE_GITHUB_JOB_DURABLE_POLL_INTERVAL_MS);
  }

  return finishGithubWorkflowsStep({
    event: input.event,
    planTools: input.planTools,
    state: started.state,
    jobId: started.jobId,
    operatorNote: started.operatorNote,
  });
}

function runPlannedTool(
  input: PlannedToolInput & { toolName: WorkspaceOrchestratorToolName },
): Promise<WorkspaceOrchestratorToolOutcome> {
  if (isRepositoryAgentToolName(input.toolName)) {
    return runRepositoryAgentTool({ ...input, toolName: input.toolName });
  }
  if (input.toolName === "run_github_workflows") {
    return runGithubWorkflowsTool(input);
  }
  return executeWorkspaceOrchestratorToolStep(input);
}

/**
 * AI SDK records a thrown tool error as a tool-error part and keeps generating, so a planned
 * tool that returns `{ ok: false }` without `terminalStatus` would otherwise complete as
 * succeeded. Stamp the failure onto the run state that later tools and completion read.
 */
function withFailedToolState(
  state: WorkspaceOrchestratorToolState,
  message: string,
): WorkspaceOrchestratorToolState {
  return {
    ...state,
    terminalStatus: "failed",
    terminalError: state.terminalError ?? message,
  };
}

/**
 * Runs a workspace automation as a durable agent loop. Each orchestrator model call and each
 * planned tool is its own workflow step (repository agents and GitHub jobs are durable loops of
 * their own), so every tool gets a full function duration and a crash resumes from the last
 * completed step instead of re-running earlier tools.
 */
export async function workspaceAutomationExecutionWorkflow(
  event: WorkspaceAutomationExecutionEventData,
) {
  "use workflow";

  const { workflowRunId } = getWorkflowMetadata();
  const failure = (error: { message: string; runId?: string }) => ({
    ok: false as const,
    runId: error.runId ?? event.workspaceAutomationRunId,
    message: error.message,
    workflowRunId,
  });

  const prepared = await prepareWorkspaceAutomationStep(event);
  if (!prepared.ok) {
    return failure(prepared.error);
  }

  if (prepared.value.kind === "completed") {
    return {
      ok: true as const,
      runId: prepared.value.result.runId,
      status: prepared.value.result.status,
      workflowRunId,
    };
  }

  const { planTools, toolSpecs } = prepared.value;
  let state: WorkspaceOrchestratorToolState = {
    stepResults: {},
    terminalStatus: null,
    terminalError: null,
  };
  let cancelled = false;
  let toolFailedMessage: string | null = null;

  const tools: ToolSet = {};
  for (const spec of toolSpecs) {
    tools[spec.name] = tool({
      description: spec.description,
      inputSchema: jsonSchema(spec.inputJsonSchema),
      execute: async (toolInput: unknown) => {
        const outcome = await runPlannedTool({
          event,
          workflowRunId,
          planTools,
          state,
          toolName: spec.name,
          toolInput,
        });
        state = outcome.state;
        if (!outcome.ok) {
          cancelled ||= outcome.cancelled === true;
          if (!cancelled) {
            toolFailedMessage ??= outcome.message;
            if (!state.terminalStatus) {
              state = withFailedToolState(state, outcome.message);
            }
          }
          throw new Error(outcome.message);
        }
        return outcome.output;
      },
    });
  }

  const logContext = agentLogContext(event, workflowRunId, "workspace_orchestrator");
  const agent = new WorkflowAgent({
    model: prepared.value.model,
    instructions: prepared.value.instructions,
    maxOutputTokens: prepared.value.maxOutputTokens,
    tools,
    prepareStep: ({ stepNumber }) => forcedWorkspaceOrchestratorStep(planTools, stepNumber),
    ...workflowAgentLogCallbacks(logContext),
  });

  let usage: unknown;
  try {
    const result = await agent.generate({
      messages: [{ role: "user", content: prepared.value.userMessage }],
      stopWhen: [isStepCount(planTools.length), () => cancelled],
      timeout: workspaceOrchestratorDeadlineMs(planTools),
    });
    usage = result.usage;
  } catch (error) {
    const message = error instanceof Error ? error.message : "workspace_orchestrator_failed";
    console.error(`${LOG_PREFIX} agent failed`, { ...logContext, planTools, error: message });
    return failure(await failWorkspaceAutomationStep({ event, state, message }));
  }
  if (cancelled) {
    console.warn(`${LOG_PREFIX} agent stopped: run cancelled`, logContext);
  }
  if (toolFailedMessage && state.terminalStatus !== "failed") {
    state = withFailedToolState(state, toolFailedMessage);
  }

  const completed = await completeWorkspaceAutomationStep({ event, planTools, state, usage });
  if (!completed.ok) {
    return failure(completed.error);
  }

  return {
    ok: true as const,
    runId: completed.value.runId,
    status: completed.value.status,
    workflowRunId,
  };
}
