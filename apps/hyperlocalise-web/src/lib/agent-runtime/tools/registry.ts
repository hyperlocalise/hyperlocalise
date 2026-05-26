import type { ToolSet } from "ai";
import type { Bash } from "just-bash";

import { createSandboxRepoBash } from "@/lib/agent-runtime/workspaces/sandbox-repo-bash";
import { ensureAgentSession } from "@/lib/tools/types";
import type { ToolContext } from "@/lib/tools/types";

import {
  createDetectRepoConfigTool,
  createRepoGitStateTool,
  createRunHyperlocaliseCliTool,
} from "./repo-read-tools";
import { createTranslationJobTool } from "./translation-tools";
import { resolveToolPolicy } from "./policy";
import {
  createBashTool,
  createFetchTool,
  createGlobTool,
  createGrepTool,
  createReadTool,
  createTodoWriteTool,
  type RepoToolContext,
} from "./workspace";

function buildWorkspaceTools(ctx: ToolContext, repoBash: RepoToolContext): ToolSet {
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
  if (policy.isToolAllowed("glob")) {
    tools.glob = createGlobTool(repoBash);
  }
  if (policy.isToolAllowed("detectRepoConfig")) {
    tools.detectRepoConfig = createDetectRepoConfigTool(repoBash);
  }
  if (policy.isToolAllowed("bash")) {
    tools.bash = createBashTool(repoBash);
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
    const repoBash = createSandboxRepoBash(ctx.sandboxId) as Bash;
    Object.assign(tools, buildWorkspaceTools(ctx, { bash: repoBash }));
  } else if (policy.isToolAllowed("fetch")) {
    tools.fetch = createFetchTool();
  }

  return tools;
}

export { buildWorkspaceTools };
