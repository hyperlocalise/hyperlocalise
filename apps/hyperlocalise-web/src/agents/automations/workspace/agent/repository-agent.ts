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
import { isStepCount, ToolLoopAgent, type ModelMessage, type ToolSet } from "ai";

import { WORKFLOW_AGENT_TIMEOUT } from "@/lib/agent-runtime/subagents/constants";
import type { AgentTodoItem } from "@/lib/agent-contracts/tool-context";
import type { RepositoryAgentGitLabContext } from "@/lib/agent-contracts/gitlab-repository-task";
import {
  filterToolSetByNames,
  repositoryWorkflowToolNames,
} from "@/lib/agent-runtime/tools/manifest";
import { buildTools } from "@/lib/agent-runtime/tools/registry";
import type { WorkspaceAutomationModel } from "@/lib/agents/workspace-automation-types";
import {
  extractGenerateResultTokenUsage,
  withAgentRuntimeUsageMetering,
  type AgentRuntimeUsageDimensions,
} from "@/lib/billing/agent-runtime-usage";
import { db } from "@/lib/database/client";
import { ensureAgentSession, type ToolContext } from "@/lib/tools/types";

import type { WorkspaceOrchestratorSession } from "./context";

export type RepositoryAgentToolName = "use_github_repository" | "use_gitlab_repository";

/**
 * Everything a repository agent needs after its sandbox exists. Plain data so it can cross
 * workflow step boundaries; credentials stay out (sandboxes are reached by id, GitLab context
 * carries no token).
 */
export type RepositoryAgentStart = {
  toolName: RepositoryAgentToolName;
  sandboxId: string;
  model: WorkspaceAutomationModel;
  instructions: string;
  prompt: string;
  gitlabContext: RepositoryAgentGitLabContext | null;
  /** Tool output without the digest, which the agent produces. */
  payload: Record<string, unknown>;
  emptyDigest: string;
  usage: {
    operationKey: string;
    source: string;
    dimensions: AgentRuntimeUsageDimensions;
  };
};

const IN_PROCESS_REPOSITORY_AGENT_STEP_LIMIT = 16;

export function buildRepositoryAgentToolContext(input: {
  runId: string;
  organizationId: string;
  sandboxId: string;
  gitlabContext: RepositoryAgentGitLabContext | null;
  todos?: AgentTodoItem[];
}): ToolContext {
  const toolContext: ToolContext = {
    conversationId: `workspace-automation:${input.runId}`,
    agentSession: { todos: input.todos ?? [] },
    organizationId: input.organizationId,
    localUserId: "workspace_automation",
    membershipRole: "member",
    projectId: null,
    db,
    workMode: "read_only",
    repositorySource: input.gitlabContext ? "gitlab" : "github",
    actor: {
      sourceUserId: "workspace_automation",
      displayName: "Workspace automation",
      role: "member",
    },
    sandboxId: input.sandboxId,
    githubContext: null,
    ...(input.gitlabContext ? { gitlabContext: input.gitlabContext } : {}),
  };

  ensureAgentSession(toolContext);
  return toolContext;
}

export function buildRepositoryAgentTools(toolContext: ToolContext): ToolSet {
  return filterToolSetByNames(buildTools(toolContext), [...repositoryWorkflowToolNames]) as ToolSet;
}

/** Run the whole repository agent inside the current function call (non-durable callers). */
export async function runRepositoryAgentInProcess(input: {
  session: WorkspaceOrchestratorSession;
  start: RepositoryAgentStart;
}): Promise<string> {
  const tools = buildRepositoryAgentTools(
    buildRepositoryAgentToolContext({
      runId: input.session.run.id,
      organizationId: input.session.organizationId,
      sandboxId: input.start.sandboxId,
      gitlabContext: input.start.gitlabContext,
    }),
  );

  const agent = new ToolLoopAgent({
    model: input.start.model,
    tools,
    instructions: input.start.instructions,
    stopWhen: isStepCount(IN_PROCESS_REPOSITORY_AGENT_STEP_LIMIT),
    timeout: WORKFLOW_AGENT_TIMEOUT,
    runtimeContext: { sandboxId: input.start.sandboxId },
  });

  const result = await withAgentRuntimeUsageMetering({
    organizationId: input.session.organizationId,
    operationKey: input.start.usage.operationKey,
    source: input.start.usage.source,
    dimensions: input.start.usage.dimensions,
    extractTokenUsage: extractGenerateResultTokenUsage,
    run: () =>
      agent.generate({
        messages: [{ role: "user", content: input.start.prompt }] as ModelMessage[],
      }),
  });

  return result.text;
}

export function recordRepositoryAgentSuccess(input: {
  session: WorkspaceOrchestratorSession;
  start: RepositoryAgentStart;
  text: string;
}) {
  const payload = {
    digest: input.text.trim() || input.start.emptyDigest,
    ...input.start.payload,
  };
  input.session.terminalStatus = "succeeded";
  input.session.stepResults[input.start.toolName] = payload;
  return payload;
}

export function recordRepositoryAgentFailure(input: {
  session: WorkspaceOrchestratorSession;
  message: string;
}) {
  input.session.terminalStatus = "failed";
  input.session.terminalError = input.message;
}
