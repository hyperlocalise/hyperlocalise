import { ToolLoopAgent, type ModelMessage, type ToolSet } from "ai";
import { Sandbox } from "@vercel/sandbox";
import { getWorkflowMetadata } from "workflow";

import type { RepoTmsAgentTask } from "@/lib/agents/repo-tms-task";
import { getInstallationOctokit } from "@/lib/agents/github/app";
import {
  buildHyperlocaliseAgentInstructions,
  getHyperlocaliseAgentModel,
} from "@/lib/agents/hyperlocalise-agent";
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
const agentStepLimit = 20;

type InstallationAuth = {
  token: string;
};

type ResolvedRepoTmsGitHubContext = Extract<
  NonNullable<RepoTmsAgentTask["githubContext"]>,
  { resolved: true }
>;

async function createRepoTmsSandbox(githubContext: ResolvedRepoTmsGitHubContext): Promise<string> {
  "use step";

  const octokit = await getInstallationOctokit(githubContext.installationId);
  const { token } = (await octokit.auth({ type: "installation" })) as InstallationAuth;
  const sandbox = await Sandbox.create({
    source: {
      type: "git",
      url: `https://github.com/${githubContext.repositoryFullName}.git`,
      revision: githubContext.commitSha ?? githubContext.branch ?? "HEAD",
      depth: 1,
      username: "x-access-token",
      password: token,
    },
    timeout: sandboxTimeoutMs,
  });

  return sandbox.sandboxId;
}

async function stopRepoTmsSandbox(sandboxId: string): Promise<void> {
  "use step";

  const sandbox = await Sandbox.get({ sandboxId });
  await sandbox.stop();
}

export async function repoTmsAgentWorkflow(task: RepoTmsAgentTask): Promise<RepoTmsWorkflowResult> {
  "use workflow";

  const { workflowRunId } = getWorkflowMetadata();
  let sandboxId: string | null = null;

  try {
    if (task.githubContext?.resolved) {
      sandboxId = await createRepoTmsSandbox(task.githubContext);
    }

    const toolContext: ToolContext = {
      conversationId: task.id,
      organizationId: task.organizationId,
      membershipRole: task.actor.role ?? "member",
      projectId: task.projectId,
      db,
      workMode: task.workMode,
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
        additionalInstructions: sandboxId
          ? `Sandbox id available to tools: ${sandboxId}. Access repo only via tools.`
          : "No repository sandbox required for this task.",
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
    if (sandboxId && task.workMode === "read_only") {
      try {
        await stopRepoTmsSandbox(sandboxId);
      } catch {
        // Best-effort cleanup; preserve the structured workflow result.
      }
    }
  }
}
