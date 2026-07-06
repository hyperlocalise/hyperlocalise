import { and, eq } from "drizzle-orm";
import { tool } from "ai";
import { z } from "zod";

import { schema } from "@/lib/database";
import { getTmsProviderLiveProject } from "@/lib/providers/jobs/tms-provider-live";
import {
  isEncodedProviderProjectId,
  parseProviderProjectId,
} from "@/lib/providers/jobs/tms-provider-resource-id";
import { normalizeProjectId } from "@/lib/projects/identity/project-id";

import { listAgentProjects } from "@/lib/tools/list-agent-projects";
import { toolCanAccessProject } from "@/lib/tools/tool-access";
import type { ToolContext } from "@/lib/tools/types";

async function resolveAttachedProjectSummary(
  ctx: ToolContext,
  projectId: string,
): Promise<{ id: string; name: string } | null> {
  const encodedProject = parseProviderProjectId(projectId);
  if (encodedProject) {
    const liveProject = await getTmsProviderLiveProject(
      ctx.organizationId,
      encodedProject.externalProjectId,
      { actorUserId: ctx.localUserId },
    );
    if (!liveProject) {
      return null;
    }

    return {
      id: liveProject.id,
      name: liveProject.name,
    };
  }

  const project = await ctx.db
    .select({
      id: schema.projects.id,
      name: schema.projects.name,
    })
    .from(schema.projects)
    .where(eq(schema.projects.id, projectId))
    .limit(1)
    .then((rows) => rows[0] ?? null);

  return project;
}

/**
 * List projects in the current organization so the agent can suggest
 * or attach the right one when the conversation does not yet have a project.
 */
export function createListProjectsTool(ctx: ToolContext) {
  return tool({
    description:
      "List projects available in the current workspace. External TMS projects are fetched live from the connected provider; native Hyperlocalise projects come from the workspace database. Use this when the user refers to a project by name but the conversation is not attached to one yet, or when you need to help the user pick a project.",
    inputSchema: z.object({
      limit: z.number().min(1).max(50).default(20).describe("Maximum projects to return."),
    }),
    execute: async ({ limit }) => listAgentProjects(ctx, limit),
  });
}

/**
 * Load lightweight project metadata + attached resource summaries.
 *
 * Never returns raw glossary/TM entries — those are fetched on-demand via
 * the dedicated `queryGlossary` and `queryTranslationMemory` tools so that
 * large corpora do not bloat the context window.
 */
export function createGetProjectContextTool(ctx: ToolContext) {
  return tool({
    description:
      "Load project-level context including configuration, attached glossaries, translation memories, and TMS links. Returns metadata and counts, not full entries.",
    inputSchema: z.object({
      projectId: z.string().describe("The project ID to load context for."),
    }),
    execute: async ({ projectId }) => {
      const db = ctx.db;

      const accessibleProject = await toolCanAccessProject(ctx, projectId);
      if (!accessibleProject) {
        return { error: `Project ${projectId} not found.` };
      }

      const normalizedProjectId = normalizeProjectId(projectId);
      if (typeof normalizedProjectId !== "string") {
        return { error: `Project ${projectId} not found.` };
      }

      if (isEncodedProviderProjectId(normalizedProjectId)) {
        const liveProject = await resolveAttachedProjectSummary(ctx, normalizedProjectId);
        if (!liveProject) {
          return { error: `Project ${projectId} not found.` };
        }

        return {
          project: {
            id: liveProject.id,
            name: liveProject.name,
            description: "",
            translationContext: "",
          },
          glossaries: { count: 0, items: [] },
          memories: { count: 0, items: [] },
          tmsLinks: [],
        };
      }

      const project = await db
        .select({
          id: schema.projects.id,
          name: schema.projects.name,
          description: schema.projects.description,
          translationContext: schema.projects.translationContext,
        })
        .from(schema.projects)
        .where(eq(schema.projects.id, normalizedProjectId))
        .limit(1)
        .then((rows) => rows[0] ?? null);

      if (!project) {
        return { error: `Project ${projectId} not found.` };
      }

      const attachedGlossaries = await db
        .select({
          id: schema.glossaries.id,
          name: schema.glossaries.name,
          sourceLocale: schema.glossaries.sourceLocale,
          targetLocale: schema.glossaries.targetLocale,
          status: schema.glossaries.status,
        })
        .from(schema.projectGlossaries)
        .innerJoin(schema.glossaries, eq(schema.projectGlossaries.glossaryId, schema.glossaries.id))
        .where(eq(schema.projectGlossaries.projectId, normalizedProjectId))
        .orderBy(schema.projectGlossaries.priority);

      const attachedMemories = await db
        .select({
          id: schema.memories.id,
          name: schema.memories.name,
          status: schema.memories.status,
        })
        .from(schema.projectMemories)
        .innerJoin(schema.memories, eq(schema.projectMemories.memoryId, schema.memories.id))
        .where(eq(schema.projectMemories.projectId, normalizedProjectId))
        .orderBy(schema.projectMemories.priority);

      const tmsLinks = await db
        .select({
          id: schema.tmsLinks.id,
          provider: schema.tmsLinks.provider,
          externalAccountId: schema.tmsLinks.externalAccountId,
          externalProjectId: schema.tmsLinks.externalProjectId,
        })
        .from(schema.tmsLinks)
        .where(
          and(
            eq(schema.tmsLinks.projectId, normalizedProjectId),
            eq(schema.tmsLinks.organizationId, ctx.organizationId),
          ),
        );

      return {
        project,
        glossaries: {
          count: attachedGlossaries.length,
          items: attachedGlossaries,
        },
        memories: {
          count: attachedMemories.length,
          items: attachedMemories,
        },
        tmsLinks,
      };
    },
  });
}

/**
 * Update which project an interaction is attached to.
 */
export function createUpdateInteractionProjectTool(ctx: ToolContext) {
  return tool({
    description:
      "Attach the current conversation to a different project so that project context (glossaries, TMs, rules) applies.",
    inputSchema: z.object({
      projectId: z.string().describe("The project ID to attach this interaction to."),
    }),
    execute: async ({ projectId }) => {
      const db = ctx.db;

      const accessibleProject = await toolCanAccessProject(ctx, projectId);
      if (!accessibleProject) {
        return { success: false, error: `Project ${projectId} not found.` };
      }

      const normalizedProjectId = normalizeProjectId(projectId);
      if (typeof normalizedProjectId !== "string") {
        return { success: false, error: `Project ${projectId} not found.` };
      }

      const project = await resolveAttachedProjectSummary(ctx, normalizedProjectId);
      if (!project) {
        return { success: false, error: `Project ${projectId} not found.` };
      }

      const now = new Date();

      await db
        .update(schema.interactions)
        .set({ projectId: project.id, updatedAt: now })
        .where(
          and(
            eq(schema.interactions.id, ctx.conversationId),
            eq(schema.interactions.organizationId, ctx.organizationId),
          ),
        );

      await db
        .update(schema.inboxItems)
        .set({ projectId: project.id, updatedAt: now })
        .where(
          and(
            eq(schema.inboxItems.interactionId, ctx.conversationId),
            eq(schema.inboxItems.organizationId, ctx.organizationId),
          ),
        );

      ctx.projectId = project.id;

      return {
        success: true,
        project: {
          id: project.id,
          name: project.name,
        },
      };
    },
  });
}
