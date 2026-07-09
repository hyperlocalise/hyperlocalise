import type { ToolSet } from "ai";
import type { Bash } from "just-bash";

import { createSandboxRepoBash } from "@/lib/agent-runtime/workspaces/sandbox-repo-bash";
import { ensureAgentSession, type ToolContext } from "@/lib/agent-contracts/tool-context";

import {
  createDetectRepoConfigTool,
  createGitHistoryTool,
  createRepoGitStateTool,
  createRunHyperlocaliseCliTool,
} from "./repo-read-tools";
import { createTranslationJobTool } from "./translation-tools";
import { resolveToolPolicy } from "./policy";
import { wrapToolSetWithLogging } from "./tool-logging";
import {
  createBashTool,
  createApplyPatchTool,
  createCaptureScreenshotTool,
  createFetchTool,
  createFuzzySearchTool,
  createGlobTool,
  createGrepTool,
  createReadTool,
  createTodoWriteTool,
  createWriteTool,
  type RepoToolContext,
} from "./workspace";

function createWorkspaceTools(ctx: ToolContext, repoBash: RepoToolContext): ToolSet {
  const policy = resolveToolPolicy({
    organizationId: ctx.organizationId,
    membershipRole: ctx.membershipRole,
  });
  const tools: ToolSet = {};

  if (policy.isToolAllowed("read")) {
    tools.read = createReadTool(repoBash);
  }
  if (policy.isToolAllowed("grep")) {
    tools.grep = createGrepTool(repoBash);
  }
  if (policy.isToolAllowed("fuzzySearch")) {
    tools.fuzzySearch = createFuzzySearchTool(repoBash);
  }
  if (policy.isToolAllowed("glob")) {
    tools.glob = createGlobTool(repoBash);
  }
  if (policy.isToolAllowed("detectRepoConfig")) {
    tools.detectRepoConfig = createDetectRepoConfigTool(repoBash);
  }
  if (policy.isToolAllowed("gitHistory")) {
    tools.gitHistory = createGitHistoryTool(repoBash);
  }
  if (policy.isToolAllowed("bash")) {
    tools.bash = createBashTool(repoBash);
  }
  if (policy.isToolAllowed("write")) {
    tools.write = createWriteTool(ctx, repoBash);
  }
  if (policy.isToolAllowed("applyPatch")) {
    tools.applyPatch = createApplyPatchTool(ctx, repoBash);
  }
  if (policy.isToolAllowed("captureScreenshot")) {
    tools.captureScreenshot = createCaptureScreenshotTool(ctx, repoBash);
  }
  if (policy.isToolAllowed("fetch")) {
    tools.fetch = createFetchTool();
  }
  if (policy.isToolAllowed("repoGitState")) {
    tools.repoGitState = createRepoGitStateTool(repoBash);
  }
  if (policy.isToolAllowed("runHyperlocaliseCli")) {
    tools.runHyperlocaliseCli = createRunHyperlocaliseCliTool(repoBash);
  }

  return tools;
}

/**
 * Builds the agent toolset for a specific request context.
 */
export function buildTools(ctx: ToolContext): ToolSet {
  ensureAgentSession(ctx);

  const policy = resolveToolPolicy({
    organizationId: ctx.organizationId,
    membershipRole: ctx.membershipRole,
  });
  const tools: ToolSet = {};

  if (policy.isToolAllowed("createTranslationJob")) {
    tools.createTranslationJob = createTranslationJobTool(ctx);
  }

  if (policy.isToolAllowed("todoWrite")) {
    tools.todoWrite = createTodoWriteTool(() => ctx);
  }

  if (ctx.sandboxId) {
    const repoBash = createSandboxRepoBash(ctx.sandboxId) as Bash & RepoToolContext["bash"];
    Object.assign(tools, createWorkspaceTools(ctx, { bash: repoBash }));
  } else if (policy.isToolAllowed("fetch")) {
    tools.fetch = createFetchTool();
  }

  return wrapToolSetWithLogging(tools, ctx);
}

export function buildWorkspaceTools(ctx: ToolContext, repoBash: RepoToolContext): ToolSet {
  return wrapToolSetWithLogging(createWorkspaceTools(ctx, repoBash), ctx);
}
