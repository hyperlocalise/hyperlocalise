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
import { z } from "zod";

import { defineAgentTool } from "@/agents/_runtime/define-agent-tool";
import { composeGitlabRepoInstructions } from "@/agents/automations/workspace/agent/workspace-template-manifest";
import { WORKFLOW_AGENT_TIMEOUT } from "@/lib/agent-runtime/subagents/constants";
import {
  filterToolSetByNames,
  repositoryWorkflowToolNames,
} from "@/lib/agent-runtime/tools/manifest";
import { buildTools } from "@/lib/agent-runtime/tools/registry";
import { resolveWorkspaceAutomationModel } from "@/lib/agents/workspace-automation-types";
import {
  extractGenerateResultTokenUsage,
  withAgentRuntimeUsageMetering,
} from "@/lib/billing/agent-runtime-usage";
import { ensureAgentSession } from "@/lib/tools/types";
import type { ToolContext } from "@/lib/tools/types";
import { db } from "@/lib/database/client";
import {
  createGitlabRepositorySandbox,
  stopGitlabRepositorySandbox,
} from "@/lib/gitlab/gitlab-repository-sandbox";
import { resolveGitLabProjectContext } from "@/lib/gitlab/repository-context";

import type { WorkspaceOrchestratorSession } from "../context";
import {
  formatGithubRepoLookbackLabel,
  resolveGithubRepoLookbackHours,
} from "./resolve-github-repo-lookback";

const GITLAB_REPO_AGENT_STEP_LIMIT = 16;

export function createUseGitlabRepositoryTool(session: WorkspaceOrchestratorSession) {
  return defineAgentTool({
    description:
      "Run a read-only GitLab repository agent using customer instructions and repository tools.",
    inputSchema: z.object({}),
    execute: async () => {
      const repositoryTarget = session.automation.repositoryTarget;
      if (repositoryTarget.kind !== "gitlab" || !repositoryTarget.gitlabPathWithNamespace) {
        throw new Error("gitlab_repository_target_required");
      }

      const gitlabTool = session.automation.toolConfig.gitlab;
      const connectionId =
        gitlabTool?.connectionId ?? repositoryTarget.gitlabConnectionId ?? null;
      const workosUserId = gitlabTool?.workosUserId ?? null;

      const gitlabContext = await resolveGitLabProjectContext({
        localOrganizationId: session.organizationId,
        workosUserId,
        pathWithNamespace: repositoryTarget.gitlabPathWithNamespace,
        connectionId,
      });
      if (!gitlabContext) {
        throw new Error("gitlab_repository_not_found");
      }

      const lookbackHours = resolveGithubRepoLookbackHours({
        automation: session.automation,
        triggerSource: session.run.triggerSource,
      });
      const lookbackLabel = formatGithubRepoLookbackLabel(lookbackHours);
      const branch = gitlabContext.branch?.trim() || "main";
      const userInstructions =
        session.automation.instructions.trim() ||
        (typeof session.run.inputSnapshot.instructions === "string"
          ? session.run.inputSnapshot.instructions.trim() || undefined
          : undefined);
      const templateSkillId =
        typeof session.run.inputSnapshot.templateSkillId === "string"
          ? session.run.inputSnapshot.templateSkillId
          : null;

      let sandboxId: string | null = null;

      try {
        sandboxId = await createGitlabRepositorySandbox({
          localOrganizationId: session.organizationId,
          workosUserId,
          gitlabContext,
          cloneDepth: 50,
        });

        const composedInstructions = composeGitlabRepoInstructions({
          userOverride: userInstructions,
          templateSkillId,
          dynamicSections: [
            "This is an automated read-only GitLab repository task.",
            `Repository: ${gitlabContext.repositoryFullName}.`,
            gitlabContext.instanceOrigin ? `Instance: ${gitlabContext.instanceOrigin}.` : null,
            `Branch: ${branch}.`,
            `Lookback window: ${lookbackLabel}.`,
            `Sandbox id: ${sandboxId}.`,
          ].filter((line): line is string => Boolean(line)),
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
          repositorySource: "gitlab",
          actor: {
            sourceUserId: "workspace_automation",
            displayName: "Workspace automation",
            role: "member",
          },
          sandboxId,
          githubContext: null,
          gitlabContext,
        };

        ensureAgentSession(toolContext);
        const tools = filterToolSetByNames(buildTools(toolContext), [
          ...repositoryWorkflowToolNames,
        ]) as ToolSet;

        const agent = new ToolLoopAgent({
          model: resolveWorkspaceAutomationModel(session.automation.model),
          tools,
          instructions: composedInstructions,
          stopWhen: isStepCount(GITLAB_REPO_AGENT_STEP_LIMIT),
          timeout: WORKFLOW_AGENT_TIMEOUT,
          runtimeContext: { sandboxId },
        });

        const prompt = [
          `Execute the customer task for ${gitlabContext.repositoryFullName} on branch ${branch}.`,
          `Review changes from the last ${lookbackLabel}.`,
          "Use repository tools to inspect git history and relevant files.",
          "Follow the customer's required report sections exactly (including Translation Review Results, priority sections, and per-key entries when specified).",
          "Review every changed translation key individually; do not output vague overall-risk summaries.",
          "Return the final digest as Markdown plain text for automation delivery.",
        ].join("\n");

        const result = await withAgentRuntimeUsageMetering({
          organizationId: session.organizationId,
          operationKey: `workspace-gitlab-repo:${session.run.id}:agent_runs`,
          source: "workspace_gitlab_repository_agent",
          dimensions: {
            surface: "automation",
            agent_surface: "gitlab_repository",
            repository_full_name: gitlabContext.repositoryFullName,
          },
          extractTokenUsage: extractGenerateResultTokenUsage,
          run: () =>
            agent.generate({
              messages: [{ role: "user", content: prompt }] as ModelMessage[],
            }),
        });

        const digest =
          result.text.trim() || "Completed GitLab repository automation with no output.";

        session.terminalStatus = "succeeded";
        const payload = {
          digest,
          repositoryFullName: gitlabContext.repositoryFullName,
          branch,
          lookbackHours,
          ...(gitlabContext.instanceOrigin ? { instanceOrigin: gitlabContext.instanceOrigin } : {}),
        };
        session.stepResults.use_gitlab_repository = payload;

        return payload;
      } catch (error) {
        session.terminalStatus = "failed";
        session.terminalError = error instanceof Error ? error.message : "gitlab_repo_agent_failed";
        throw error;
      } finally {
        if (sandboxId) {
          await stopGitlabRepositorySandbox(sandboxId).catch(() => undefined);
        }
      }
    },
  });
}
