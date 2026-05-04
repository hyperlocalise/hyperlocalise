import type { ToolSet } from "ai";

import { createQueryGlossaryTool, createQueryTranslationMemoryTool } from "./asset-tools";
import {
  createCreateGlossaryTermTool,
  createCreateGlossaryTool,
  createDeleteGlossaryTermTool,
  createDeleteGlossaryTool,
  createListGlossariesTool,
  createListGlossaryTermsTool,
  createUpdateGlossaryTermTool,
  createUpdateGlossaryTool,
} from "./glossary-tools";
import { createGetJobStatusTool, createListJobsTool, createTranslationJobTool } from "./job-tools";
import { createResolveInteractionTool } from "./interaction-tools";
import {
  createCreateMemoryEntryTool,
  createCreateTranslationMemoryTool,
  createDeleteMemoryEntryTool,
  createDeleteTranslationMemoryTool,
  createListMemoryEntriesTool,
  createListTranslationMemoriesTool,
  createUpdateMemoryEntryTool,
  createUpdateTranslationMemoryTool,
} from "./memory-tools";
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

    listGlossaries: createListGlossariesTool(ctx),
    createGlossary: createCreateGlossaryTool(ctx),
    updateGlossary: createUpdateGlossaryTool(ctx),
    deleteGlossary: createDeleteGlossaryTool(ctx),
    listGlossaryTerms: createListGlossaryTermsTool(ctx),
    createGlossaryTerm: createCreateGlossaryTermTool(ctx),
    updateGlossaryTerm: createUpdateGlossaryTermTool(ctx),
    deleteGlossaryTerm: createDeleteGlossaryTermTool(ctx),

    listTranslationMemories: createListTranslationMemoriesTool(ctx),
    createTranslationMemory: createCreateTranslationMemoryTool(ctx),
    updateTranslationMemory: createUpdateTranslationMemoryTool(ctx),
    deleteTranslationMemory: createDeleteTranslationMemoryTool(ctx),
    listMemoryEntries: createListMemoryEntriesTool(ctx),
    createMemoryEntry: createCreateMemoryEntryTool(ctx),
    updateMemoryEntry: createUpdateMemoryEntryTool(ctx),
    deleteMemoryEntry: createDeleteMemoryEntryTool(ctx),

    createTranslationJob: createTranslationJobTool(ctx),
    // Review, research, sync, and asset-management job tools are intentionally
    // not exposed until workers exist. Registering them now would create
    // queued jobs that never execute.
    listJobs: createListJobsTool(ctx),
    getJobStatus: createGetJobStatusTool(ctx),
    resolveInteraction: createResolveInteractionTool(ctx),
  };
}
