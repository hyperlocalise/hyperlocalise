import { ToolLoopAgent, type ModelMessage, type ToolSet } from "ai";
import { getWorkflowMetadata } from "workflow";

import type { RepoTmsAgentGitHubContext, RepoTmsAgentTask } from "@/lib/agents/repo-tms-task";
import {
  createRepoTmsSandbox as createRepoTmsSandboxImpl,
  stopRepoTmsSandbox as stopRepoTmsSandboxImpl,
} from "@/lib/agents/repo-tms-sandbox";
import {
  buildHyperlocaliseAgentInstructions,
  getHyperlocaliseAgentModel,
} from "@/lib/agents/hyperlocalise-agent";
import { buildRepoTmsGitHubContextInstructions } from "@/lib/agents/repo-tms-context";
import type { ToolContext } from "@/lib/tools/types";
import { buildTools } from "@/lib/tools/registry";
import { db } from "@/lib/database";

export type RepoTmsWorkflowResult = {
  ok: boolean;
  workflowRunId: string;
  sourceReplyTarget: { source: RepoTmsAgentTask["source"]; threadId: string };
  summary: string;
  error?: string;
};

const agentStepLimit = 20;
const readOnlyRepoInstructions =
  "This workflow is read-only. Gather repository and TMS context, but do not modify files, upload sources, commit, push, or create TMS-side effects.";

type ResolvedRepoTmsGitHubContext = Extract<RepoTmsAgentGitHubContext, { resolved: true }>;

async function createRepoTmsSandboxStep(
  githubContext: ResolvedRepoTmsGitHubContext,
): Promise<string> {
  "use step";
  return createRepoTmsSandboxImpl(githubContext);
}

async function stopRepoTmsSandboxStep(sandboxId: string): Promise<void> {
  "use step";
  return stopRepoTmsSandboxImpl(sandboxId);
}

export async function repoTmsAgentWorkflow(task: RepoTmsAgentTask): Promise<RepoTmsWorkflowResult> {
  "use workflow";

  const { workflowRunId } = getWorkflowMetadata();
  const localUserId = task.actor.userId?.trim();

  if (!localUserId) {
    console.warn(
      `repo-tms-agent: refusing workflow ${workflowRunId} for ${task.source} actor ${task.actor.sourceUserId}: no linked Hyperlocalise user (team-scoped tools require a matched member).`,
    );

    return {
      ok: false,
      workflowRunId,
      sourceReplyTarget: { source: task.source, threadId: task.sourceThreadId },
      summary:
        "Repo/TMS workflow could not run because the external actor is not linked to a Hyperlocalise user.",
      error: "actor_not_linked",
    };
  }

  let sandboxId: string | null = null;

  try {
    if (task.githubContext?.resolved) {
      sandboxId = await createRepoTmsSandboxStep(task.githubContext);
    }

    const toolContext: ToolContext = {
      conversationId: task.id,
      workflowRunId,
      organizationId: task.organizationId,
      localUserId,
      membershipRole: task.actor.role ?? "member",
      projectId: task.projectId,
      db,
      workMode: task.workMode,
      repoTmsSource: task.source,
      actor: task.actor,
      sandboxId: sandboxId ?? null,
      githubContext: task.githubContext && task.githubContext.resolved ? task.githubContext : null,
    };

    const tools = buildTools(toolContext) as ToolSet;
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
            ? buildRepoTmsGitHubContextInstructions(task.githubContext)
            : null,
          sandboxId
            ? "Use searchRepoFiles to locate literal strings in the repository. Use readRepoFile to inspect surrounding lines and explain where copy appears."
            : null,
          task.workMode === "read_only" ? readOnlyRepoInstructions : null,
        ]
          .filter((instruction): instruction is string => instruction !== null)
          .join("\n\n"),
      }),
      experimental_context: { sandboxId, repoTmsTaskId: task.id },
    });

    const result = await agent.generate({
      messages: [{ role: "user", content: task.instructions }] as ModelMessage[],
    });

    return {
      ok: true,
      workflowRunId,
      sourceReplyTarget: { source: task.source, threadId: task.sourceThreadId },
      summary: result.text.trim() || "Completed repo/TMS agent task.",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      workflowRunId,
      sourceReplyTarget: { source: task.source, threadId: task.sourceThreadId },
      summary: "Repo/TMS workflow failed.",
      error: message,
    };
  } finally {
    if (sandboxId) {
      try {
        await stopRepoTmsSandboxStep(sandboxId);
      } catch {
        // Best-effort cleanup; preserve the structured workflow result.
      }
    }
  }
}
