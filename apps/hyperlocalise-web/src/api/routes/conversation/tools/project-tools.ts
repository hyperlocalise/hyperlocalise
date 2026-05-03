import { and, eq } from "drizzle-orm";
import { tool } from "ai";
import { z } from "zod";

import { schema } from "@/lib/database";

import type { ToolContext } from "./types";

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

      const project = await db
        .select({
          id: schema.projects.id,
          name: schema.projects.name,
          description: schema.projects.description,
          translationContext: schema.projects.translationContext,
        })
        .from(schema.projects)
        .where(
          and(
            eq(schema.projects.id, projectId),
            eq(schema.projects.organizationId, ctx.organizationId),
          ),
        )
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
        .where(eq(schema.projectGlossaries.projectId, projectId))
        .orderBy(schema.projectGlossaries.priority);

      const attachedMemories = await db
        .select({
          id: schema.memories.id,
          name: schema.memories.name,
          status: schema.memories.status,
        })
        .from(schema.projectMemories)
        .innerJoin(schema.memories, eq(schema.projectMemories.memoryId, schema.memories.id))
        .where(eq(schema.projectMemories.projectId, projectId))
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
            eq(schema.tmsLinks.projectId, projectId),
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

      const project = await db
        .select({
          id: schema.projects.id,
          name: schema.projects.name,
        })
        .from(schema.projects)
        .where(
          and(
            eq(schema.projects.id, projectId),
            eq(schema.projects.organizationId, ctx.organizationId),
          ),
        )
        .limit(1)
        .then((rows) => rows[0] ?? null);

      if (!project) {
        return { success: false, error: `Project ${projectId} not found.` };
      }

      const now = new Date();

      await db
        .update(schema.interactions)
        .set({ projectId, updatedAt: now })
        .where(
          and(
            eq(schema.interactions.id, ctx.conversationId),
            eq(schema.interactions.organizationId, ctx.organizationId),
          ),
        );

      await db
        .update(schema.inboxItems)
        .set({ projectId, updatedAt: now })
        .where(
          and(
            eq(schema.inboxItems.interactionId, ctx.conversationId),
            eq(schema.inboxItems.organizationId, ctx.organizationId),
          ),
        );

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
