import { ToolLoopAgent, type ModelMessage, type ToolSet } from "ai";

import { composeInstructions } from "@/agents/_runtime/compose-instructions";
import { getHyperlocaliseAgentModel } from "@/lib/agent-runtime/loops/hyperlocalise-agent";
import { WORKFLOW_AGENT_TIMEOUT } from "@/lib/agent-runtime/subagents/constants";
import {
  filterToolSetByNames,
  repositoryWorkspaceToolNames,
} from "@/lib/agent-runtime/tools/manifest";
import { buildTools } from "@/lib/agent-runtime/tools/registry";
import { ensureAgentSession } from "@/lib/tools/types";
import type { ToolContext } from "@/lib/tools/types";
import { db } from "@/lib/database";

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
      dynamicSections: [
        "This is an automated read-only localization review for a single commit.",
        "Do not modify files, commit, push, or create external effects.",
        "Summarize risks, missing translations, and suggested fixes based on the diff context.",
        `Sandbox id: ${input.sandboxId}. Use repository tools to inspect files when needed.`,
      ],
    }),
    experimental_context: { sandboxId: input.sandboxId },
  });

  const parent = input.parentCommitSha ?? "unknown";
  const prompt = [
    `Review commit ${input.commitSha} (parent ${parent}) for localization quality.`,
    `Changed localization paths: ${input.changedPaths.join(", ") || "(none)"}`,
    "Unified diff excerpt:",
    input.diffExcerpt.slice(0, 12_000),
    "Return a concise summary for automation logs: findings, likely fixes, and whether the change looks safe to merge from a localization perspective.",
  ].join("\n\n");

  const result = await agent.generate({
    messages: [{ role: "user", content: prompt }] as ModelMessage[],
  });

  return result.text.trim() || "Completed automated localization review.";
}
