import { ToolLoopAgent, type ModelMessage, type ToolSet } from "ai";
import { Sandbox } from "@vercel/sandbox";
import { getWorkflowMetadata } from "workflow";

import type { RepoTmsAgentTask } from "@/lib/agents/repo-tms-task";
import { buildHyperlocaliseAgentInstructions, getHyperlocaliseAgentModel } from "@/lib/agents/hyperlocalise-agent";
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

const sandboxTimeoutMs = 10 * 60 * 1000;

export async function repoTmsAgentWorkflow(task: RepoTmsAgentTask): Promise<RepoTmsWorkflowResult> {
  "use workflow";

  const { workflowRunId } = getWorkflowMetadata();
  let sandboxId: string | null = null;

  try {
    if (task.githubContext?.resolved) {
      const sandbox = await Sandbox.create({
        source: {
          type: "git",
          url: `https://github.com/${task.githubContext.repositoryFullName}.git`,
          revision: task.githubContext.commitSha ?? task.githubContext.branch ?? "HEAD",
          depth: 1,
        },
        timeout: sandboxTimeoutMs,
      });
      sandboxId = sandbox.sandboxId;
    }

    const toolContext: ToolContext = {
      conversationId: task.id,
      organizationId: task.organizationId,
      membershipRole: "owner",
      projectId: task.projectId,
      db,
    };

    const tools = buildTools(toolContext) as ToolSet;
    const agent = new ToolLoopAgent({
      model: getHyperlocaliseAgentModel(),
      tools,
      stopWhen: [(step) => step.steps.length >= 5],
      system: buildHyperlocaliseAgentInstructions({
        surface: "github",
        projectId: task.projectId,
        additionalInstructions: sandboxId
          ? `Sandbox id available to tools: ${sandboxId}. Access repo only via tools.`
          : "No repository sandbox required for this task.",
      }),
    });

    const result = await agent.generate({
      messages: [{ role: "user", content: task.instructions }] as ModelMessage[],
      experimental_context: { sandboxId, repoTmsTaskId: task.id },
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
    if (sandboxId && task.workMode !== "write") {
      const sandbox = await Sandbox.get({ sandboxId });
      await sandbox.stop();
    }
  }
}
