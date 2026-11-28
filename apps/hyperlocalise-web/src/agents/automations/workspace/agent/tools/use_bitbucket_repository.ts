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
import { composeBitbucketRepoInstructions } from "@/agents/automations/workspace/agent/workspace-template-manifest";
import { resolveWorkspaceAutomationModel } from "@/lib/agents/workspace-automation-types";
import {
  createBitbucketRepositorySandbox,
  stopBitbucketRepositorySandbox,
} from "@/lib/bitbucket/bitbucket-repository-sandbox";
import { loadBitbucketRepositoryContext } from "@/lib/bitbucket/repository-context";
import { isErr } from "@/lib/primitives/result/results";

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

/** A stable failure code for the run's record; the message text can carry customer data. */
function bitbucketStartFailureCode(code: string): string {
  switch (code) {
    case "bitbucket_not_found":
    case "bitbucket_forbidden":
      return "bitbucket_repository_not_found";
    case "bitbucket_needs_reconnect":
    case "bitbucket_unauthorized":
      return "bitbucket_needs_reconnect";
    case "bitbucket_unavailable":
    case "bitbucket_request_failed":
      return "bitbucket_request_failed";
    default:
      return "bitbucket_not_connected";
  }
}

/**
 * Resolve the Bitbucket repository, clone it into a sandbox with the workspace's shared
 * connection, and compose the agent prompt. The caller owns the returned sandbox and must stop it.
 */
export async function startBitbucketRepositoryAgent(
  session: WorkspaceOrchestratorSession,
  options: { sandboxTimeoutMs?: number } = {},
): Promise<RepositoryAgentStart> {
  const repositoryTarget = session.automation.repositoryTarget;
  if (repositoryTarget.kind !== "bitbucket" || !repositoryTarget.bitbucketRepositoryFullName) {
    throw new Error("bitbucket_repository_target_required");
  }

  const contextResult = await loadBitbucketRepositoryContext({
    localOrganizationId: session.organizationId,
    repositoryFullName: repositoryTarget.bitbucketRepositoryFullName,
  });
  if (isErr(contextResult)) {
    throw new Error(bitbucketStartFailureCode(contextResult.error.code));
  }
  const bitbucketContext = contextResult.value;

  const lookbackHours = resolveGithubRepoLookbackHours({
    automation: session.automation,
    triggerSource: session.run.triggerSource,
  });
  const lookbackLabel = formatGithubRepoLookbackLabel(lookbackHours);
  const branch = bitbucketContext.branch?.trim() || "main";
  const userInstructions =
    session.automation.instructions.trim() ||
    (typeof session.run.inputSnapshot.instructions === "string"
      ? session.run.inputSnapshot.instructions.trim() || undefined
      : undefined);
  const templateSkillId =
    typeof session.run.inputSnapshot.templateSkillId === "string"
      ? session.run.inputSnapshot.templateSkillId
      : null;

  const sandboxId = await createBitbucketRepositorySandbox({
    localOrganizationId: session.organizationId,
    bitbucketContext,
    cloneDepth: 50,
    ...(options.sandboxTimeoutMs ? { timeoutMs: options.sandboxTimeoutMs } : {}),
  });

  try {
    const instructions = composeBitbucketRepoInstructions({
      userOverride: userInstructions,
      templateSkillId,
      dynamicSections: [
        "This is an automated read-only Bitbucket repository task.",
        `Repository: ${bitbucketContext.repositoryFullName}.`,
        `Branch: ${branch}.`,
        `Lookback window: ${lookbackLabel}.`,
        `Sandbox id: ${sandboxId}.`,
      ],
    });

    const prompt = [
      `Execute the customer task for ${bitbucketContext.repositoryFullName} on branch ${branch}.`,
      `Review changes from the last ${lookbackLabel}.`,
      "Use repository tools to inspect git history and relevant files.",
      "Follow the customer's required report sections exactly (including Translation Review Results, priority sections, and per-key entries when specified).",
      "Review every changed translation key individually; do not output vague overall-risk summaries.",
      "Return the final digest as Markdown plain text for automation delivery.",
    ].join("\n");

    return {
      toolName: "use_bitbucket_repository",
      sandboxId,
      model: resolveWorkspaceAutomationModel(session.automation.model),
      instructions,
      prompt,
      gitlabContext: null,
      bitbucketContext,
      payload: {
        repositoryFullName: bitbucketContext.repositoryFullName,
        branch,
        lookbackHours,
      },
      emptyDigest: "Completed Bitbucket repository automation with no output.",
      usage: {
        operationKey: `workspace-bitbucket-repo:${session.run.id}:agent_runs`,
        source: "workspace_bitbucket_repository_agent",
        dimensions: {
          surface: "automation",
          agent_surface: "bitbucket_repository",
          repository_full_name: bitbucketContext.repositoryFullName,
        },
      },
    };
  } catch (error) {
    await stopBitbucketRepositorySandbox(sandboxId).catch(() => undefined);
    throw error;
  }
}

export function createUseBitbucketRepositoryTool(session: WorkspaceOrchestratorSession) {
  return defineAgentTool({
    description:
      "Run a read-only Bitbucket repository agent using customer instructions and repository tools.",
    inputSchema: z.object({}),
    execute: async () => {
      let start: RepositoryAgentStart | null = null;
      try {
        start = await startBitbucketRepositoryAgent(session);
        const text = await runRepositoryAgentInProcess({ session, start });
        return recordRepositoryAgentSuccess({ session, start, text });
      } catch (error) {
        recordRepositoryAgentFailure({
          session,
          message: error instanceof Error ? error.message : "bitbucket_repo_agent_failed",
        });
        throw error;
      } finally {
        if (start) {
          await stopBitbucketRepositorySandbox(start.sandboxId).catch(() => undefined);
        }
      }
    },
  });
}
