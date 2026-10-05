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
import { asSchema } from "ai";

import type { AgentTodoItem } from "@/lib/agent-contracts/tool-context";
import { REPOSITORY_AGENT_SANDBOX_TIMEOUT_MS } from "@/lib/agent-runtime/subagents/constants";
import { getGithubRepositoryAutomationJobById } from "@/lib/agents/github/github-repository-automation-jobs";
import { stopGithubRepositoryAutomationSandbox } from "@/lib/agents/github/github-repository-automation-sandbox";
import { getWorkspaceAutomationRunById } from "@/lib/agents/workspace-automations";
import {
  beginAgentRuntimeUsage,
  completeAgentRuntimeUsage,
  extractAiSdkTokenUsage,
} from "@/lib/billing/agent-runtime-usage";
import { stopGitlabRepositorySandbox } from "@/lib/gitlab/gitlab-repository-sandbox";
import { createLogger } from "@/lib/log";

import { WORKSPACE_AUTOMATION_RUN_CANCELLED } from "./durable-tool-budget";
import type { WorkspaceOrchestratorToolName } from "./plan";
import {
  buildRepositoryAgentToolContext,
  buildRepositoryAgentTools,
  recordRepositoryAgentFailure,
  recordRepositoryAgentSuccess,
  type RepositoryAgentStart,
  type RepositoryAgentToolName,
} from "./repository-agent";
import {
  loadWorkspaceOrchestratorToolSession,
  readWorkspaceOrchestratorToolState,
  type WorkspaceOrchestratorToolOutcome,
  type WorkspaceOrchestratorToolSpec,
  type WorkspaceOrchestratorToolState,
} from "./run-workspace-orchestrator";
import {
  finishRunGithubWorkflows,
  isTerminalGithubJobStatus,
  startRunGithubWorkflows,
} from "./tools/run_github_workflows";
import { startGithubRepositoryAgent } from "./tools/use_github_repository";
import { startGitlabRepositoryAgent } from "./tools/use_gitlab_repository";

const logger = createLogger("workspace-orchestrator-durable-tools");

type DurableToolInput = {
  workspaceAutomationRunId: string;
  organizationId: string;
  planTools: WorkspaceOrchestratorToolName[];
  state: WorkspaceOrchestratorToolState;
};

type ToolFailure = Extract<WorkspaceOrchestratorToolOutcome, { ok: false }>;

export type RepositoryAgentToolSpec = Omit<WorkspaceOrchestratorToolSpec, "name"> & {
  name: string;
};

export type RepositoryAgentStartOutcome =
  | {
      ok: true;
      start: RepositoryAgentStart;
      toolSpecs: RepositoryAgentToolSpec[];
      state: WorkspaceOrchestratorToolState;
    }
  | ToolFailure;

export type RepositoryAgentToolOutcome =
  | { ok: true; output: unknown; todos: AgentTodoItem[] }
  | { ok: false; message: string; todos: AgentTodoItem[]; cancelled?: true };

export type GithubWorkflowsStartOutcome =
  | WorkspaceOrchestratorToolOutcome
  | {
      ok: "waiting";
      jobId: string;
      operatorNote: string | null;
      state: WorkspaceOrchestratorToolState;
    };

export type GithubWorkflowsJobPoll = "terminal" | "pending" | "missing" | "cancelled";

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

async function stopRepositoryAgentSandbox(toolName: RepositoryAgentToolName, sandboxId: string) {
  const stop =
    toolName === "use_gitlab_repository"
      ? stopGitlabRepositorySandbox
      : stopGithubRepositoryAutomationSandbox;
  await stop(sandboxId).catch((error: unknown) => {
    logger.warn({ sandboxId, message: errorMessage(error, "stop_failed") }, "sandbox stop failed");
  });
}

async function isRunCancelled(input: { workspaceAutomationRunId: string; organizationId: string }) {
  const run = await getWorkspaceAutomationRunById({
    runId: input.workspaceAutomationRunId,
    organizationId: input.organizationId,
  });
  return run?.status === "cancelled";
}

/** Clone the repository into a long-lived sandbox and reserve the repository agent's usage. */
export async function startDurableRepositoryAgent(
  input: DurableToolInput & { toolName: RepositoryAgentToolName },
): Promise<RepositoryAgentStartOutcome> {
  const loaded = await loadWorkspaceOrchestratorToolSession(input);
  if (!loaded.ok) {
    return loaded;
  }

  const { session } = loaded;
  let start: RepositoryAgentStart | null = null;
  try {
    const options = { sandboxTimeoutMs: REPOSITORY_AGENT_SANDBOX_TIMEOUT_MS };
    start =
      input.toolName === "use_gitlab_repository"
        ? await startGitlabRepositoryAgent(session, options)
        : await startGithubRepositoryAgent(session, options);

    await beginAgentRuntimeUsage({
      organizationId: input.organizationId,
      operationKey: start.usage.operationKey,
      source: start.usage.source,
      dimensions: start.usage.dimensions,
    });

    const tools = buildRepositoryAgentTools(
      buildRepositoryAgentToolContext({
        runId: input.workspaceAutomationRunId,
        organizationId: input.organizationId,
        sandboxId: start.sandboxId,
        gitlabContext: start.gitlabContext,
      }),
    );
    const toolSpecs = await Promise.all(
      Object.entries(tools).map(async ([name, tool]): Promise<RepositoryAgentToolSpec> => ({
        name,
        description: typeof tool.description === "string" ? tool.description : "",
        inputJsonSchema: await asSchema(tool.inputSchema).jsonSchema,
      })),
    );

    return { ok: true, start, toolSpecs, state: readWorkspaceOrchestratorToolState(session) };
  } catch (error) {
    if (start) {
      await stopRepositoryAgentSandbox(input.toolName, start.sandboxId);
    }
    const message = errorMessage(error, `${input.toolName}_failed`);
    recordRepositoryAgentFailure({ session, message });
    return { ok: false, message, state: readWorkspaceOrchestratorToolState(session) };
  }
}

/** Run one repository tool call (grep, read, git history, ...) against the agent's sandbox. */
export async function executeDurableRepositoryAgentTool(input: {
  workspaceAutomationRunId: string;
  organizationId: string;
  start: Pick<RepositoryAgentStart, "sandboxId" | "gitlabContext">;
  toolName: string;
  toolCallId: string;
  toolInput: unknown;
  todos: AgentTodoItem[];
}): Promise<RepositoryAgentToolOutcome> {
  if (await isRunCancelled(input)) {
    return {
      ok: false,
      message: WORKSPACE_AUTOMATION_RUN_CANCELLED,
      todos: input.todos,
      cancelled: true,
    };
  }

  const toolContext = buildRepositoryAgentToolContext({
    runId: input.workspaceAutomationRunId,
    organizationId: input.organizationId,
    sandboxId: input.start.sandboxId,
    gitlabContext: input.start.gitlabContext,
    todos: input.todos,
  });
  const readTodos = () => toolContext.agentSession?.todos ?? input.todos;
  const tool = buildRepositoryAgentTools(toolContext)[input.toolName];
  if (!tool?.execute) {
    return { ok: false, message: `unknown_tool: ${input.toolName}`, todos: readTodos() };
  }

  const validation = await asSchema(tool.inputSchema).validate?.(input.toolInput);
  if (validation && !validation.success) {
    return { ok: false, message: validation.error.message, todos: readTodos() };
  }

  try {
    const output = await tool.execute(validation ? validation.value : input.toolInput, {
      toolCallId: input.toolCallId,
      messages: [],
      context: { sandboxId: input.start.sandboxId },
    });
    return { ok: true, output, todos: readTodos() };
  } catch (error) {
    return {
      ok: false,
      message: errorMessage(error, `${input.toolName}_failed`),
      todos: readTodos(),
    };
  }
}

/** Stop the sandbox, bill the repository agent, and record its digest as the tool output. */
export async function finishDurableRepositoryAgent(
  input: DurableToolInput & { start: RepositoryAgentStart; text: string; usage: unknown },
): Promise<WorkspaceOrchestratorToolOutcome> {
  await stopRepositoryAgentSandbox(input.start.toolName, input.start.sandboxId);

  await completeAgentRuntimeUsage({
    organizationId: input.organizationId,
    operationKey: input.start.usage.operationKey,
    dimensions: input.start.usage.dimensions,
    tokenUsage: extractAiSdkTokenUsage(input.usage),
  });

  const loaded = await loadWorkspaceOrchestratorToolSession(input);
  if (!loaded.ok) {
    return loaded;
  }

  const output = recordRepositoryAgentSuccess({
    session: loaded.session,
    start: input.start,
    text: input.text,
  });
  return { ok: true, output, state: readWorkspaceOrchestratorToolState(loaded.session) };
}

/** Stop the sandbox and record the repository agent failure. Its usage stays unbilled. */
export async function failDurableRepositoryAgent(
  input: DurableToolInput & {
    toolName: RepositoryAgentToolName;
    sandboxId: string;
    message: string;
    cancelled?: boolean;
  },
): Promise<ToolFailure> {
  await stopRepositoryAgentSandbox(input.toolName, input.sandboxId);

  const loaded = await loadWorkspaceOrchestratorToolSession(input);
  if (!loaded.ok) {
    return loaded;
  }

  recordRepositoryAgentFailure({ session: loaded.session, message: input.message });
  return {
    ok: false,
    message: input.message,
    state: readWorkspaceOrchestratorToolState(loaded.session),
    ...(input.cancelled ? { cancelled: true as const } : {}),
  };
}

/** Claim and enqueue the GitHub repository automation job without waiting for it. */
export async function startDurableGithubWorkflows(
  input: DurableToolInput & { toolInput: unknown },
): Promise<GithubWorkflowsStartOutcome> {
  const loaded = await loadWorkspaceOrchestratorToolSession(input);
  if (!loaded.ok) {
    return loaded;
  }

  const { session } = loaded;
  const summary =
    input.toolInput &&
    typeof input.toolInput === "object" &&
    typeof (input.toolInput as { summary?: unknown }).summary === "string"
      ? (input.toolInput as { summary: string }).summary
      : undefined;

  try {
    const start = await startRunGithubWorkflows(session, { summary });
    const state = readWorkspaceOrchestratorToolState(session);
    if (start.kind === "done") {
      return { ok: true, output: start.result, state };
    }
    return { ok: "waiting", jobId: start.jobId, operatorNote: start.operatorNote, state };
  } catch (error) {
    return {
      ok: false,
      message: errorMessage(error, "run_github_workflows_failed"),
      state: readWorkspaceOrchestratorToolState(session),
    };
  }
}

export async function pollDurableGithubWorkflowsJob(input: {
  workspaceAutomationRunId: string;
  organizationId: string;
  jobId: string;
}): Promise<GithubWorkflowsJobPoll> {
  if (await isRunCancelled(input)) {
    return "cancelled";
  }

  const job = await getGithubRepositoryAutomationJobById(input.jobId);
  if (!job) {
    return "missing";
  }
  return isTerminalGithubJobStatus(job.status) ? "terminal" : "pending";
}

/** Record the GitHub job outcome, or a timeout when it never reached a terminal status. */
export async function finishDurableGithubWorkflows(
  input: DurableToolInput & { jobId: string; operatorNote: string | null },
): Promise<WorkspaceOrchestratorToolOutcome> {
  const loaded = await loadWorkspaceOrchestratorToolSession(input);
  if (!loaded.ok) {
    return loaded;
  }

  const { session } = loaded;
  const job = await getGithubRepositoryAutomationJobById(input.jobId);
  if (!job || !isTerminalGithubJobStatus(job.status)) {
    const message = job
      ? "github_repository_automation_job_poll_timeout"
      : "github_repository_automation_job_not_found";
    session.terminalStatus = "failed";
    session.terminalError = message;
    return { ok: false, message, state: readWorkspaceOrchestratorToolState(session) };
  }

  try {
    const output = await finishRunGithubWorkflows(session, {
      terminalJob: job,
      operatorNote: input.operatorNote,
    });
    return { ok: true, output, state: readWorkspaceOrchestratorToolState(session) };
  } catch (error) {
    return {
      ok: false,
      message: errorMessage(error, "run_github_workflows_failed"),
      state: readWorkspaceOrchestratorToolState(session),
    };
  }
}
