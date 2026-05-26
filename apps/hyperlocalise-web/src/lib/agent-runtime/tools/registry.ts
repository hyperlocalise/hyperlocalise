import type { ToolSet } from "ai";
import type { Bash } from "just-bash";

import { createSandboxRepoBash } from "@/lib/agent-runtime/workspaces/sandbox-repo-bash";
import type { ToolContext } from "@/lib/tools/types";

import { resolveToolPolicy } from "./policy";
import {
  createDetectRepoConfigTool,
  createReadRepoFileTool,
  createSearchRepoFilesTool,
} from "./repo-read-tools";
import { createTranslationJobTool } from "./translation-tools";
// TODO: Add provider/TMS tools in the next scope. For now agents should only
// translate uploaded files and read repository context for localized strings.

/**
 * Builds the agent toolset for a specific request context.
 *
 * This is the compatibility entrypoint for the new manifest/policy-backed
 * runtime. Existing tool names stay stable while call sites migrate toward
 * TaskSpec-based selection.
 */
export function buildTools(ctx: ToolContext): ToolSet {
  const policy = resolveToolPolicy({
    organizationId: ctx.organizationId,
    membershipRole: ctx.membershipRole,
  });
  const tools: ToolSet = {};

  if (ctx.sandboxId) {
    const repoBash = createSandboxRepoBash(ctx.sandboxId) as Bash;
    const repoToolContext = { bash: repoBash };

    if (policy.isToolAllowed("searchRepoFiles")) {
      tools.searchRepoFiles = createSearchRepoFilesTool(repoToolContext);
    }
    if (policy.isToolAllowed("readRepoFile")) {
      tools.readRepoFile = createReadRepoFileTool(repoToolContext);
    }
    if (policy.isToolAllowed("detectRepoConfig")) {
      tools.detectRepoConfig = createDetectRepoConfigTool(repoToolContext);
    }

    return tools;
  }

  if (policy.isToolAllowed("createTranslationJob")) {
    tools.createTranslationJob = createTranslationJobTool(ctx);
  }

  return tools;
}
