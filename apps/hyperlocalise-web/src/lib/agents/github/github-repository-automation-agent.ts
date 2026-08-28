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
import { ToolLoopAgent, type ModelMessage, type ToolSet } from "ai";

import { composeInstructions } from "@/agents/_runtime/compose-instructions";
import { getHyperlocaliseAgentModel } from "@/lib/agent-runtime/loops/hyperlocalise-agent";
import { WORKFLOW_AGENT_TIMEOUT } from "@/lib/agent-runtime/subagents/constants";
import {
  filterToolSetByNames,
  repositoryWorkspaceToolNames,
} from "@/lib/agent-runtime/tools/manifest";
import { buildTools } from "@/lib/agent-runtime/tools/registry";
import {
  extractGenerateResultTokenUsage,
  withAgentRuntimeUsageMetering,
} from "@/lib/billing/agent-runtime-usage";
import { ensureAgentSession } from "@/lib/tools/types";
import type { ToolContext } from "@/lib/tools/types";
import { db } from "@/lib/database/client";

const agentStepLimit = 8;

export async function runRepositoryLocalisationAgentForCommit(input: {
  organizationId: string;
  sandboxId: string;
  workflowRunId?: string | null;
  commitSha: string;
  parentCommitSha: string | null;
  changedPaths: string[];
  diffExcerpt: string;
}): Promise<string> {
  const toolContext: ToolContext = {
    conversationId: `automation:${input.commitSha}`,
    agentSession: { todos: [] },
    workflowRunId: input.workflowRunId ?? undefined,
    organizationId: input.organizationId,
    localUserId: "repository_automation",
    membershipRole: "member",
    projectId: null,
    db,
    workMode: "read_only",
    repositorySource: "github",
    actor: {
      sourceUserId: "repository_automation",
      displayName: "Repository automation",
      role: "member",
    },
    sandboxId: input.sandboxId,
    githubContext: null,
  };

  ensureAgentSession(toolContext);
  const tools = filterToolSetByNames(buildTools(toolContext), [
    ...repositoryWorkspaceToolNames,
  ]) as ToolSet;

  const agent = new ToolLoopAgent({
    model: getHyperlocaliseAgentModel(),
    tools,
    stopWhen: [(step) => step.steps.length >= agentStepLimit],
    timeout: WORKFLOW_AGENT_TIMEOUT,
    instructions: composeInstructions({
      automationId: "github-repository",
      sharedSkills: ["recent-source-changes", "translation-review"],
      skills: ["github-repo-agent"],
      dynamicSections: [
        "This is an automated read-only localization review for a single commit.",
        "Do not modify files, commit, push, or create external effects.",
        "Follow the Translation review procedure for per-key P0/P1/P2 output.",
        `Sandbox id: ${input.sandboxId}. Use repository tools to inspect files when needed.`,
      ],
    }),
    runtimeContext: { sandboxId: input.sandboxId },
  });

  const parent = input.parentCommitSha ?? "unknown";
  const prompt = [
    `Review commit ${input.commitSha} (parent ${parent}) for localization quality.`,
    `Changed localization paths: ${input.changedPaths.join(", ") || "(none)"}`,
    "Unified diff excerpt:",
    input.diffExcerpt.slice(0, 12_000),
    "Return Markdown using the Translation review report sections from your instructions.",
  ].join("\n\n");

  const result = await withAgentRuntimeUsageMetering({
    organizationId: input.organizationId,
    operationKey: `github-commit-review:${input.organizationId}:${input.commitSha}:agent_runs`,
    source: "github_repository_commit_review",
    dimensions: {
      surface: "automation",
      agent_surface: "github_commit_review",
      commit_sha: input.commitSha,
    },
    extractTokenUsage: extractGenerateResultTokenUsage,
    run: () =>
      agent.generate({
        messages: [{ role: "user", content: prompt }] as ModelMessage[],
      }),
  });

  return result.text.trim() || "Completed automated localization review.";
}

export async function runGithubPullRequestReviewAgent(input: {
  organizationId: string;
  sandboxId: string;
  workflowRunId?: string | null;
  pullRequestNumber: number;
  headSha: string;
  baseSha: string | null;
  changedPaths: string[];
  diffExcerpt: string;
  additionalPrompt: string;
}): Promise<string> {
  const toolContext: ToolContext = {
    conversationId: `github-pr-review:${input.pullRequestNumber}:${input.headSha}`,
    agentSession: { todos: [] },
    workflowRunId: input.workflowRunId ?? undefined,
    organizationId: input.organizationId,
    localUserId: "github_auto_review",
    membershipRole: "member",
    projectId: null,
    db,
    workMode: "read_only",
    repositorySource: "github",
    actor: {
      sourceUserId: "github_auto_review",
      displayName: "GitHub Auto-review",
      role: "member",
    },
    sandboxId: input.sandboxId,
    githubContext: null,
  };

  ensureAgentSession(toolContext);
  const tools = filterToolSetByNames(buildTools(toolContext), [
    ...repositoryWorkspaceToolNames,
  ]) as ToolSet;

  const agent = new ToolLoopAgent({
    model: getHyperlocaliseAgentModel(),
    tools,
    stopWhen: [(step) => step.steps.length >= agentStepLimit],
    timeout: WORKFLOW_AGENT_TIMEOUT,
    instructions: composeInstructions({
      automationId: "github-repository",
      sharedSkills: ["recent-source-changes", "translation-review"],
      skills: ["github-repo-agent"],
      dynamicSections: [
        "This is a read-only localisation review for a GitHub pull request.",
        "Do not modify files, commit, push, or create external effects.",
        "Follow the Translation review procedure for per-key P0/P1/P2 output.",
        `Sandbox id: ${input.sandboxId}. Use repository tools to inspect files when needed.`,
      ],
      userOverride: input.additionalPrompt,
    }),
    runtimeContext: { sandboxId: input.sandboxId },
  });

  const base = input.baseSha ?? "unknown";
  const prompt = [
    `Review pull request #${input.pullRequestNumber} (${base}...${input.headSha}) for localization quality.`,
    `Changed paths: ${input.changedPaths.join(", ") || "(none)"}`,
    "Unified diff excerpt:",
    input.diffExcerpt.slice(0, 12_000),
    "Return Markdown using the Translation review report sections from your instructions.",
  ].join("\n\n");

  const result = await withAgentRuntimeUsageMetering({
    organizationId: input.organizationId,
    operationKey: `github-pr-review:${input.organizationId}:${input.pullRequestNumber}:${input.headSha}:agent_runs`,
    source: "github_pull_request_review",
    dimensions: {
      surface: "automation",
      agent_surface: "github_pull_request_review",
      commit_sha: input.headSha,
    },
    extractTokenUsage: extractGenerateResultTokenUsage,
    run: () =>
      agent.generate({
        messages: [{ role: "user", content: prompt }] as ModelMessage[],
      }),
  });

  return result.text.trim() || "Completed localisation review.";
}
