import { and, eq } from "drizzle-orm";
import { stepCountIs, ToolLoopAgent, type ModelMessage, type ToolSet } from "ai";
import { z } from "zod";

import { defineAgentTool } from "@/agents/_runtime/define-agent-tool";
import { composeGithubRepoInstructions } from "@/agents/automations/workspace/agent/workspace-template-manifest";
import { getHyperlocaliseAgentModel } from "@/lib/agent-runtime/loops/hyperlocalise-agent";
import { WORKFLOW_AGENT_TIMEOUT } from "@/lib/agent-runtime/subagents/constants";
import {
  filterToolSetByNames,
  repositoryWorkflowToolNames,
} from "@/lib/agent-runtime/tools/manifest";
import { buildTools } from "@/lib/agent-runtime/tools/registry";
import { ensureAgentSession } from "@/lib/tools/types";
import type { ToolContext } from "@/lib/tools/types";
import { db, schema } from "@/lib/database";
import {
  createGithubRepositoryAutomationSandbox,
  stopGithubRepositoryAutomationSandbox,
} from "@/lib/agents/github/github-repository-automation-sandbox";

import type { WorkspaceOrchestratorSession } from "../context";
import {
  formatGithubRepoLookbackLabel,
  resolveGithubRepoLookbackHours,
} from "./resolve-github-repo-lookback";

const GITHUB_REPO_AGENT_STEP_LIMIT = 12;

export function createUseGithubRepositoryTool(session: WorkspaceOrchestratorSession) {
  return defineAgentTool({
    description:
      "Run a read-only GitHub repository agent using customer instructions and repository tools.",
    inputSchema: z.object({}),
    execute: async () => {
      if (!session.repository) {
        throw new Error("github_repository_target_required");
      }

      const [repositoryRow] = await db
        .select({
          fullName: schema.githubInstallationRepositories.fullName,
          defaultBranch: schema.githubInstallationRepositories.defaultBranch,
          githubInstallationId: schema.githubInstallationRepositories.githubInstallationId,
        })
        .from(schema.githubInstallationRepositories)
        .where(
          and(
            eq(schema.githubInstallationRepositories.id, session.repository.id),
            eq(schema.githubInstallationRepositories.organizationId, session.organizationId),
          ),
        )
        .limit(1);

      if (!repositoryRow) {
        throw new Error("github_repository_not_found");
      }

      const branch = repositoryRow.defaultBranch?.trim() || "main";
      const lookbackHours = resolveGithubRepoLookbackHours({
        automation: session.automation,
        triggerSource: session.run.triggerSource,
      });
      const lookbackLabel = formatGithubRepoLookbackLabel(lookbackHours);
      const userInstructions =
        session.automation.instructions.trim() ||
        (typeof session.run.inputSnapshot.instructions === "string"
          ? session.run.inputSnapshot.instructions.trim() || undefined
          : undefined);

      let sandboxId: string | null = null;

      try {
        sandboxId = await createGithubRepositoryAutomationSandbox({
          installationId: repositoryRow.githubInstallationId,
          repositoryFullName: repositoryRow.fullName,
          revision: branch,
          cloneDepth: 50,
        });

        const composedInstructions = composeGithubRepoInstructions({
          userOverride: userInstructions,
          dynamicSections: [
            "This is an automated read-only GitHub repository task.",
            `Repository: ${repositoryRow.fullName}.`,
            `Branch: ${branch}.`,
            `Lookback window: ${lookbackLabel}.`,
            `Sandbox id: ${sandboxId}.`,
          ],
        });

        const toolContext: ToolContext = {
          conversationId: `workspace-automation:${session.run.id}`,
          agentSession: { todos: [] },
          organizationId: session.organizationId,
          localUserId: "workspace_automation",
          membershipRole: "member",
          projectId: null,
          db,
          workMode: "read_only",
          repositorySource: "github",
          actor: {
            sourceUserId: "workspace_automation",
            displayName: "Workspace automation",
            role: "member",
          },
          sandboxId,
          githubContext: null,
        };

        ensureAgentSession(toolContext);
        const tools = filterToolSetByNames(buildTools(toolContext), [
          ...repositoryWorkflowToolNames,
        ]) as ToolSet;

        const agent = new ToolLoopAgent({
          model: getHyperlocaliseAgentModel(),
          tools,
          instructions: composedInstructions,
          stopWhen: stepCountIs(GITHUB_REPO_AGENT_STEP_LIMIT),
          timeout: WORKFLOW_AGENT_TIMEOUT,
          experimental_context: { sandboxId },
        });

        const prompt = [
          `Execute the customer task for ${repositoryRow.fullName} on branch ${branch}.`,
          `Review changes from the last ${lookbackLabel}.`,
          "Use repository tools to inspect git history and relevant files.",
          "Return the final digest as plain text for automation delivery.",
        ].join("\n");

        const result = await agent.generate({
          messages: [{ role: "user", content: prompt }] as ModelMessage[],
        });

        const digest =
          result.text.trim() || "Completed GitHub repository automation with no output.";

        session.terminalStatus = "succeeded";
        const payload = {
          digest,
          repositoryFullName: repositoryRow.fullName,
          branch,
          lookbackHours,
        };
        session.stepResults.use_github_repository = payload;

        return payload;
      } catch (error) {
        session.terminalStatus = "failed";
        session.terminalError = error instanceof Error ? error.message : "github_repo_agent_failed";
        throw error;
      } finally {
        if (sandboxId) {
          await stopGithubRepositoryAutomationSandbox(sandboxId).catch(() => undefined);
        }
      }
    },
  });
}
