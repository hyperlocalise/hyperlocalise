import type { ToolSet } from "ai";

import { createQueryGlossaryTool, createQueryTranslationMemoryTool } from "./asset-tools";
import {
  createAssetManagementJobTool,
  createGetJobStatusTool,
  createListJobsTool,
  createResearchJobTool,
  createReviewJobTool,
  createSyncJobTool,
  createTranslationJobTool,
} from "./job-tools";
import { createResolveInteractionTool } from "./interaction-tools";
import {
  createGetProjectContextTool,
  createListProjectsTool,
  createUpdateInteractionProjectTool,
} from "./project-tools";
import type { ToolContext } from "./types";

/**
 * Builds the full agent toolset for a specific request context.
 *
 * Each tool factory receives the same `ToolContext` so that database queries
 * and side effects are consistently scoped to the current organization,
 * conversation, and project.
 */
export function buildTools(ctx: ToolContext): ToolSet {
  return {
    listProjects: createListProjectsTool(ctx),
    getProjectContext: createGetProjectContextTool(ctx),
    updateInteractionProject: createUpdateInteractionProjectTool(ctx),
    queryGlossary: createQueryGlossaryTool(ctx),
    queryTranslationMemory: createQueryTranslationMemoryTool(ctx),
    createTranslationJob: createTranslationJobTool(ctx),
    createReviewJob: createReviewJobTool(ctx),
    createResearchJob: createResearchJobTool(ctx),
    createSyncJob: createSyncJobTool(ctx),
    createAssetManagementJob: createAssetManagementJobTool(ctx),
    listJobs: createListJobsTool(ctx),
    getJobStatus: createGetJobStatusTool(ctx),
    resolveInteraction: createResolveInteractionTool(ctx),
  };
}
