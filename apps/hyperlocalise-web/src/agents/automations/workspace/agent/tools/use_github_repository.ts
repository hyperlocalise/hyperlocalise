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
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { defineAgentTool } from "@/agents/_runtime/define-agent-tool";
import { composeGithubRepoInstructions } from "@/agents/automations/workspace/agent/workspace-template-manifest";
import { resolveWorkspaceAutomationModel } from "@/lib/agents/workspace-automation-types";
import { db, schema } from "@/lib/database/client";
import {
  createGithubRepositoryAutomationSandbox,
  stopGithubRepositoryAutomationSandbox,
} from "@/lib/agents/github/github-repository-automation-sandbox";

import type { WorkspaceOrchestratorSession } from "../context";
import {
  recordRepositoryAgentFailure,
  recordRepositoryAgentSuccess,
  runRepositoryAgentInProcess,
  type RepositoryAgentStart,
} from "../repository-agent";
import {
  formatGithubPushRangeLabel,
  formatGithubRepoLookbackLabel,
  resolveGithubPullRequestNumber,
  resolveGithubPushRange,
  resolveGithubRepoLookbackHours,
} from "./resolve-github-repo-lookback";

/**
 * Resolve the repository, clone it into a sandbox, and compose the agent prompt. The caller owns
 * the returned sandbox and must stop it.
 */
export async function startGithubRepositoryAgent(
  session: WorkspaceOrchestratorSession,
  options: { sandboxTimeoutMs?: number } = {},
): Promise<RepositoryAgentStart> {
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

  const pushRange = resolveGithubPushRange({
    triggerSource: session.run.triggerSource,
    inputSnapshot: session.run.inputSnapshot,
  });
  const pullRequestNumber = resolveGithubPullRequestNumber(session.run.inputSnapshot);
  const branch = pushRange?.branch || repositoryRow.defaultBranch?.trim() || "main";
  const revision = pushRange?.commitAfter || branch;
  const lookbackHours = resolveGithubRepoLookbackHours({
    automation: session.automation,
    triggerSource: session.run.triggerSource,
  });
  const lookbackLabel = pushRange
    ? formatGithubPushRangeLabel(pushRange)
    : formatGithubRepoLookbackLabel(lookbackHours);
  const inspectionLabel = pullRequestNumber
    ? `pull request #${pullRequestNumber} (${lookbackLabel})`
    : lookbackLabel;
  const userInstructions =
    session.automation.instructions.trim() ||
    (typeof session.run.inputSnapshot.instructions === "string"
      ? session.run.inputSnapshot.instructions.trim() || undefined
      : undefined);
  const templateSkillId =
    typeof session.run.inputSnapshot.templateSkillId === "string"
      ? session.run.inputSnapshot.templateSkillId
      : null;

  const sandboxId = await createGithubRepositoryAutomationSandbox({
    installationId: repositoryRow.githubInstallationId,
    repositoryFullName: repositoryRow.fullName,
    revision,
    cloneDepth: 50,
    ...(options.sandboxTimeoutMs ? { timeoutMs: options.sandboxTimeoutMs } : {}),
  });

  try {
    const instructions = composeGithubRepoInstructions({
      userOverride: userInstructions,
      templateSkillId,
      skillIds: session.automation.skillIds ?? [],
      dynamicSections: [
        "This is an automated read-only GitHub repository task.",
        `Repository: ${repositoryRow.fullName}.`,
        `Branch: ${branch}.`,
        pushRange
          ? `Inspect this ${pullRequestNumber ? "pull request" : "push"}: ${inspectionLabel}.`
          : `Lookback window: ${lookbackLabel}.`,
        `Sandbox id: ${sandboxId}.`,
      ],
    });

    const prompt = [
      `Execute the customer task for ${repositoryRow.fullName} on branch ${branch}.`,
      pushRange
        ? `Review the localisation impact of this ${pullRequestNumber ? "pull request" : "push"} (${inspectionLabel}).`
        : `Review changes from the last ${lookbackLabel}.`,
      "Use repository tools to inspect git history and relevant files.",
      "Follow the customer's required report sections exactly (including Translation Review Results, priority sections, and per-key entries when specified).",
      "Review every changed translation key individually; do not output vague overall-risk summaries.",
      "Return the final digest as Markdown plain text for automation delivery.",
    ].join("\n");

    return {
      toolName: "use_github_repository",
      sandboxId,
      model: resolveWorkspaceAutomationModel(session.automation.model),
      instructions,
      prompt,
      gitlabContext: null,
      payload: {
        repositoryFullName: repositoryRow.fullName,
        branch,
        lookbackHours: pushRange ? null : lookbackHours,
        ...(pushRange
          ? { commitBefore: pushRange.commitBefore, commitAfter: pushRange.commitAfter }
          : {}),
      },
      emptyDigest: "Completed GitHub repository automation with no output.",
      usage: {
        operationKey: `workspace-github-repo:${session.run.id}:agent_runs`,
        source: "workspace_github_repository_agent",
        dimensions: {
          surface: "automation",
          agent_surface: "github_repository",
          repository_full_name: repositoryRow.fullName,
        },
      },
    };
  } catch (error) {
    await stopGithubRepositoryAutomationSandbox(sandboxId).catch(() => undefined);
    throw error;
  }
}

export function createUseGithubRepositoryTool(session: WorkspaceOrchestratorSession) {
  return defineAgentTool({
    description:
      "Run a read-only GitHub repository agent using customer instructions and repository tools.",
    inputSchema: z.object({}),
    execute: async () => {
      let start: RepositoryAgentStart | null = null;
      try {
        start = await startGithubRepositoryAgent(session);
        const text = await runRepositoryAgentInProcess({ session, start });
        return recordRepositoryAgentSuccess({ session, start, text });
      } catch (error) {
        recordRepositoryAgentFailure({
          session,
          message: error instanceof Error ? error.message : "github_repo_agent_failed",
        });
        throw error;
      } finally {
        if (start) {
          await stopGithubRepositoryAutomationSandbox(start.sandboxId).catch(() => undefined);
        }
      }
    },
  });
}
