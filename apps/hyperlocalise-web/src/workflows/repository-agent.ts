import { getWorkflowMetadata } from "workflow";

import type {
  RepositoryAgentGitHubContext,
  RepositoryAgentTask,
} from "@/lib/agents/repository-agent-task";

export type RepositoryWorkflowResult = {
  ok: boolean;
  workflowRunId: string;
  sourceReplyTarget: { source: RepositoryAgentTask["source"]; threadId: string };
  summary: string;
  error?: string;
};

const agentStepLimit = 20;
const readOnlyRepoInstructions =
  "This workflow is read-only. Gather repository context, but do not modify files, upload sources, commit, push, or create external effects.";

type ResolvedRepositoryGitHubContext = Extract<RepositoryAgentGitHubContext, { resolved: true }>;

async function createRepositorySandboxStep(
  githubContext: ResolvedRepositoryGitHubContext,
): Promise<string> {
  "use step";
  const { createRepositorySandbox } =
    await import("@/lib/agent-runtime/workspaces/repository-sandbox");
  return createRepositorySandbox(githubContext);
}

async function stopRepositorySandboxStep(sandboxId: string): Promise<void> {
  "use step";
  const { stopRepositorySandbox } =
    await import("@/lib/agent-runtime/workspaces/repository-sandbox");
  return stopRepositorySandbox(sandboxId);
}

async function runRepositoryAgentStep(input: {
  task: RepositoryAgentTask;
  workflowRunId: string;
  sandboxId: string | null;
}): Promise<string> {
  "use step";

  const { ToolLoopAgent } = await import("ai");
  const { db } = await import("@/lib/database");
  const { buildHyperlocaliseAgentInstructions, getHyperlocaliseAgentModel } =
    await import("@/lib/agent-runtime/loops/hyperlocalise-agent");
  const { WORKFLOW_AGENT_TIMEOUT } = await import("@/lib/agent-runtime/subagents/constants");
  const { buildRepositoryGitHubContextInstructions } =
    await import("@/lib/agents/repository-context");
  const { filterToolSetByNames, repositoryWorkspaceToolNames } =
    await import("@/lib/agent-runtime/tools/manifest");
  const { buildTools } = await import("@/lib/agent-runtime/tools/registry");
  const { ensureAgentSession } = await import("@/lib/tools/types");

  const { task, workflowRunId, sandboxId } = input;
  const localUserId = task.actor.userId?.trim() || "repository_agent";

  const toolContext = {
    conversationId: task.id,
    agentSession: { todos: [] },
    workflowRunId,
    organizationId: task.organizationId,
    localUserId,
    membershipRole: task.actor.role ?? "member",
    projectId: task.projectId,
    db,
    workMode: "read_only" as const,
    repositorySource: task.source,
    actor: task.actor,
    sandboxId,
    githubContext: task.githubContext && task.githubContext.resolved ? task.githubContext : null,
  };

  ensureAgentSession(toolContext);
  const tools = filterToolSetByNames(buildTools(toolContext), [...repositoryWorkspaceToolNames]);
  const agent = new ToolLoopAgent({
    model: getHyperlocaliseAgentModel(),
    tools,
    stopWhen: [(step) => step.steps.length >= agentStepLimit],
    timeout: WORKFLOW_AGENT_TIMEOUT,
    instructions: buildHyperlocaliseAgentInstructions({
      surface: task.source === "slack" ? "slack" : task.source === "github" ? "github" : "web",
      projectId: task.projectId,
      additionalInstructions: [
        sandboxId
          ? `Sandbox id available to tools: ${sandboxId}. Access repo only via tools.`
          : "No repository sandbox required for this task.",
        task.githubContext?.resolved
          ? buildRepositoryGitHubContextInstructions(task.githubContext)
          : null,
        sandboxId
          ? "Use glob to find candidate files, grep to locate literal strings, and read to inspect surrounding lines. Use todoWrite for multi-step investigations."
          : null,
        readOnlyRepoInstructions,
      ]
        .filter((instruction): instruction is string => instruction !== null)
        .join("\n\n"),
    }),
    experimental_context: { sandboxId, repositoryTaskId: task.id },
  });

  const result = await agent.generate({
    messages: [{ role: "user", content: task.instructions }],
  });

  return result.text.trim() || "Completed repository agent task.";
}

export async function repositoryAgentWorkflow(
  task: RepositoryAgentTask,
): Promise<RepositoryWorkflowResult> {
  "use workflow";

  const { workflowRunId } = getWorkflowMetadata();

  let sandboxId: string | null = null;

  try {
    if (task.githubContext?.resolved) {
      sandboxId = await createRepositorySandboxStep(task.githubContext);
    }

    const summary = await runRepositoryAgentStep({
      task,
      workflowRunId,
      sandboxId,
    });

    return {
      ok: true,
      workflowRunId,
      sourceReplyTarget: { source: task.source, threadId: task.sourceThreadId },
      summary,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      workflowRunId,
      sourceReplyTarget: { source: task.source, threadId: task.sourceThreadId },
      summary: "Repository workflow failed.",
      error: message,
    };
  } finally {
    if (sandboxId) {
      try {
        await stopRepositorySandboxStep(sandboxId);
      } catch {
        // Best-effort cleanup; preserve the structured workflow result.
      }
    }
  }
}
