import type { ToolSet } from "ai";
import type { Bash } from "just-bash";

// import { createQueryGlossaryTool, createQueryTranslationMemoryTool } from "./asset-tools";
// import {
//   createCreateGlossaryTermTool,
//   createCreateGlossaryTool,
//   createDeleteGlossaryTermTool,
//   createDeleteGlossaryTool,
//   createListGlossariesTool,
//   createListGlossaryTermsTool,
//   createUpdateGlossaryTermTool,
//   createUpdateGlossaryTool,
// } from "./glossary-tools";
import {
  // createGetJobStatusTool,
  // createListJobsTool,
  createTranslationJobTool,
  // createUnavailableJobKindTool,
} from "./job-tools";
// import { createResolveInteractionTool } from "./interaction-tools";
// import {
//   createCreateMemoryEntryTool,
//   createCreateTranslationMemoryTool,
//   createDeleteMemoryEntryTool,
//   createDeleteTranslationMemoryTool,
//   createListMemoryEntriesTool,
//   createListTranslationMemoriesTool,
//   createUpdateMemoryEntryTool,
//   createUpdateTranslationMemoryTool,
// } from "./memory-tools";
// import {
//   createGetProjectContextTool,
//   createListProjectsTool,
//   createUpdateInteractionProjectTool,
// } from "./project-tools";
import type { ToolContext } from "./types";
import {
  createDetectRepoConfigTool,
  createReadRepoFileTool,
  createSearchRepoFilesTool,
} from "./repo-tools";
import {
  createApplyHyperlocaliseFixesTool,
  createCommitChangesTool,
  createPushToBranchTool,
  createUploadSourcesTool,
} from "./repo-tms-write-tools";
import { createSandboxRepoBash } from "./sandbox-repo-bash";

/**
 * Builds the agent toolset for a specific request context.
 *
 * Conversation agents receive file-translation tools plus GitHub repo search
 * when a sandbox is available. Repo/TMS write workflows add mutation tools.
 */
export function buildTools(ctx: ToolContext): ToolSet {
  const tools: ToolSet = {
    createTranslationJob: createTranslationJobTool(ctx),
  };

  // Disabled for now — re-enable when expanding beyond file/image translation.
  // listProjects: createListProjectsTool(ctx),
  // getProjectContext: createGetProjectContextTool(ctx),
  // updateInteractionProject: createUpdateInteractionProjectTool(ctx),
  // queryGlossary: createQueryGlossaryTool(ctx),
  // queryTranslationMemory: createQueryTranslationMemoryTool(ctx),
  // listGlossaries: createListGlossariesTool(ctx),
  // createGlossary: createCreateGlossaryTool(ctx),
  // updateGlossary: createUpdateGlossaryTool(ctx),
  // deleteGlossary: createDeleteGlossaryTool(ctx),
  // listGlossaryTerms: createListGlossaryTermsTool(ctx),
  // createGlossaryTerm: createCreateGlossaryTermTool(ctx),
  // updateGlossaryTerm: createUpdateGlossaryTermTool(ctx),
  // deleteGlossaryTerm: createDeleteGlossaryTermTool(ctx),
  // listTranslationMemories: createListTranslationMemoriesTool(ctx),
  // createTranslationMemory: createCreateTranslationMemoryTool(ctx),
  // updateTranslationMemory: createUpdateTranslationMemoryTool(ctx),
  // deleteTranslationMemory: createDeleteTranslationMemoryTool(ctx),
  // listMemoryEntries: createListMemoryEntriesTool(ctx),
  // createMemoryEntry: createCreateMemoryEntryTool(ctx),
  // updateMemoryEntry: createUpdateMemoryEntryTool(ctx),
  // deleteMemoryEntry: createDeleteMemoryEntryTool(ctx),
  // createReviewJob: createUnavailableJobKindTool("Review"),
  // createResearchJob: createUnavailableJobKindTool("Research"),
  // createSyncJob: createUnavailableJobKindTool("Sync"),
  // createAssetManagementJob: createUnavailableJobKindTool("Asset-management"),
  // listJobs: createListJobsTool(ctx),
  // getJobStatus: createGetJobStatusTool(ctx),
  // resolveInteraction: createResolveInteractionTool(ctx),

  if (ctx.sandboxId) {
    const repoBash = createSandboxRepoBash(ctx.sandboxId) as Bash;
    const repoToolContext = { bash: repoBash };
    tools.searchRepoFiles = createSearchRepoFilesTool(repoToolContext);
    tools.readRepoFile = createReadRepoFileTool(repoToolContext);
    tools.detectRepoConfig = createDetectRepoConfigTool(repoToolContext);

    if (ctx.workMode !== "read_only") {
      tools.applyHyperlocaliseFixes = createApplyHyperlocaliseFixesTool(ctx);
      tools.commitChanges = createCommitChangesTool(ctx);
      tools.pushToBranch = createPushToBranchTool(ctx);
      tools.uploadSources = createUploadSourcesTool(ctx);
    }
  }

  return tools;
}
