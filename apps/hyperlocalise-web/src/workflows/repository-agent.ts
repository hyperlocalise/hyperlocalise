import { ToolLoopAgent, type ModelMessage, type ToolSet } from "ai";
import { getWorkflowMetadata } from "workflow";

import type {
  RepositoryAgentGitHubContext,
  RepositoryAgentTask,
} from "@/lib/agents/repository-agent-task";
import {
  createRepositorySandbox as createRepositorySandboxImpl,
  stopRepositorySandbox as stopRepositorySandboxImpl,
} from "@/lib/agent-runtime/workspaces/repository-sandbox";
import {
  buildHyperlocaliseAgentInstructions,
  getHyperlocaliseAgentModel,
} from "@/lib/agent-runtime/loops/hyperlocalise-agent";
import { buildRepositoryGitHubContextInstructions } from "@/lib/agents/repository-context";
import {
  filterToolSetByNames,
  repositoryWorkspaceToolNames,
} from "@/lib/agent-runtime/tools/manifest";
import { buildTools } from "@/lib/agent-runtime/tools/registry";
import { ensureAgentSession } from "@/lib/tools/types";
import type { ToolContext } from "@/lib/tools/types";
import { db } from "@/lib/database";

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
  return createRepositorySandboxImpl(githubContext);
}

async function stopRepositorySandboxStep(sandboxId: string): Promise<void> {
  "use step";
  return stopRepositorySandboxImpl(sandboxId);
}

export async function repositoryAgentWorkflow(
  task: RepositoryAgentTask,
): Promise<RepositoryWorkflowResult> {
  "use workflow";

  const { workflowRunId } = getWorkflowMetadata();
  const localUserId = task.actor.userId?.trim() || "repository_agent";

  let sandboxId: string | null = null;

  try {
    if (task.githubContext?.resolved) {
      sandboxId = await createRepositorySandboxStep(task.githubContext);
    }

    const toolContext: ToolContext = {
      conversationId: task.id,
      agentSession: { todos: [] },
      workflowRunId,
      organizationId: task.organizationId,
      localUserId,
      membershipRole: task.actor.role ?? "member",
      projectId: task.projectId,
      db,
      workMode: "read_only",
      repositorySource: task.source,
      actor: task.actor,
      sandboxId: sandboxId ?? null,
      githubContext: task.githubContext && task.githubContext.resolved ? task.githubContext : null,
    };

    ensureAgentSession(toolContext);
    const tools = filterToolSetByNames(buildTools(toolContext), [
      ...repositoryWorkspaceToolNames,
    ]) as ToolSet;
    const agent = new ToolLoopAgent({
      model: getHyperlocaliseAgentModel(),
      tools,
      stopWhen: [(step) => step.steps.length >= agentStepLimit],
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
      messages: [{ role: "user", content: task.instructions }] as ModelMessage[],
    });

    return {
      ok: true,
      workflowRunId,
      sourceReplyTarget: { source: task.source, threadId: task.sourceThreadId },
      summary: result.text.trim() || "Completed repository agent task.",
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
