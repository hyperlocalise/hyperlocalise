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
import { z } from "zod";

import { defineAgentTool } from "@/agents/_runtime/define-agent-tool";
import { composeGitlabRepoInstructions } from "@/agents/automations/workspace/agent/workspace-template-manifest";
import { resolveWorkspaceAutomationModel } from "@/lib/agents/workspace-automation-types";
import {
  createGitlabRepositorySandbox,
  stopGitlabRepositorySandbox,
} from "@/lib/gitlab/gitlab-repository-sandbox";
import { resolveGitLabProjectContext } from "@/lib/gitlab/repository-context";

import type { WorkspaceOrchestratorSession } from "../context";
import {
  recordRepositoryAgentFailure,
  recordRepositoryAgentSuccess,
  runRepositoryAgentInProcess,
  type RepositoryAgentStart,
} from "../repository-agent";
import {
  formatGithubRepoLookbackLabel,
  resolveGithubRepoLookbackHours,
} from "./resolve-github-repo-lookback";

/**
 * Resolve the GitLab project, clone it into a sandbox, and compose the agent prompt. The caller
 * owns the returned sandbox and must stop it.
 */
export async function startGitlabRepositoryAgent(
  session: WorkspaceOrchestratorSession,
  options: { sandboxTimeoutMs?: number } = {},
): Promise<RepositoryAgentStart> {
  const repositoryTarget = session.automation.repositoryTarget;
  if (repositoryTarget.kind !== "gitlab" || !repositoryTarget.gitlabPathWithNamespace) {
    throw new Error("gitlab_repository_target_required");
  }

  const workosUserId = session.automation.toolConfig.gitlab?.workosUserId;
  if (!workosUserId) {
    throw new Error("gitlab_not_connected");
  }

  const gitlabContext = await resolveGitLabProjectContext({
    localOrganizationId: session.organizationId,
    workosUserId,
    pathWithNamespace: repositoryTarget.gitlabPathWithNamespace,
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

  const sandboxId = await createGitlabRepositorySandbox({
    localOrganizationId: session.organizationId,
    workosUserId,
    gitlabContext,
    cloneDepth: 50,
    ...(options.sandboxTimeoutMs ? { timeoutMs: options.sandboxTimeoutMs } : {}),
  });

  try {
    const instructions = composeGitlabRepoInstructions({
      userOverride: userInstructions,
      templateSkillId,
      dynamicSections: [
        "This is an automated read-only GitLab repository task.",
        `Repository: ${gitlabContext.repositoryFullName}.`,
        `Branch: ${branch}.`,
        `Lookback window: ${lookbackLabel}.`,
        `Sandbox id: ${sandboxId}.`,
      ],
    });

    const prompt = [
      `Execute the customer task for ${gitlabContext.repositoryFullName} on branch ${branch}.`,
      `Review changes from the last ${lookbackLabel}.`,
      "Use repository tools to inspect git history and relevant files.",
      "Follow the customer's required report sections exactly (including Translation Review Results, priority sections, and per-key entries when specified).",
      "Review every changed translation key individually; do not output vague overall-risk summaries.",
      "Return the final digest as Markdown plain text for automation delivery.",
    ].join("\n");

    return {
      toolName: "use_gitlab_repository",
      sandboxId,
      model: resolveWorkspaceAutomationModel(session.automation.model),
      instructions,
      prompt,
      gitlabContext,
      payload: {
        repositoryFullName: gitlabContext.repositoryFullName,
        branch,
        lookbackHours,
      },
      emptyDigest: "Completed GitLab repository automation with no output.",
      usage: {
        operationKey: `workspace-gitlab-repo:${session.run.id}:agent_runs`,
        source: "workspace_gitlab_repository_agent",
        dimensions: {
          surface: "automation",
          agent_surface: "gitlab_repository",
          repository_full_name: gitlabContext.repositoryFullName,
        },
      },
    };
  } catch (error) {
    await stopGitlabRepositorySandbox(sandboxId).catch(() => undefined);
    throw error;
  }
}

export function createUseGitlabRepositoryTool(session: WorkspaceOrchestratorSession) {
  return defineAgentTool({
    description:
      "Run a read-only GitLab repository agent using customer instructions and repository tools.",
    inputSchema: z.object({}),
    execute: async () => {
      let start: RepositoryAgentStart | null = null;
      try {
        start = await startGitlabRepositoryAgent(session);
        const text = await runRepositoryAgentInProcess({ session, start });
        return recordRepositoryAgentSuccess({ session, start, text });
      } catch (error) {
        recordRepositoryAgentFailure({
          session,
          message: error instanceof Error ? error.message : "gitlab_repo_agent_failed",
        });
        throw error;
      } finally {
        if (start) {
          await stopGitlabRepositorySandbox(start.sandboxId).catch(() => undefined);
        }
      }
    },
  });
}
