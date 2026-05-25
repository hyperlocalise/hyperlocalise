import { and, desc, eq } from "drizzle-orm";
import { tool } from "ai";
import { z } from "zod";

import { schema } from "@/lib/database";
import { hasCapability } from "@/api/auth/policy";
import { normalizeTranslationMemorySourceText } from "@/lib/translation/normalizeTranslationMemorySourceText";

import { localePattern } from "./locale";
import {
  toolGetAccessibleMemory,
  toolMemoryOrgMutationWhere,
  toolProjectLinkedMemoryWhere,
} from "./tool-access";
import type { ToolContext } from "./types";

/* ------------------------------------------------------------------ */
/* Translation Memory CRUD                                            */
/* ------------------------------------------------------------------ */

export function createListTranslationMemoriesTool(ctx: ToolContext) {
  return tool({
    description: "List translation memories in the current organization.",
    inputSchema: z.object({
      limit: z.number().min(1).max(50).default(20).describe("Maximum memories to return."),
      offset: z.number().min(0).default(0).describe("Number of memories to skip."),
    }),
    execute: async ({ limit, offset }) => {
      const memories = await ctx.db
        .select({
          id: schema.memories.id,
          name: schema.memories.name,
          description: schema.memories.description,
          status: schema.memories.status,
          createdAt: schema.memories.createdAt,
        })
        .from(schema.memories)
        .where(await toolProjectLinkedMemoryWhere(ctx))
        .orderBy(desc(schema.memories.createdAt))
        .limit(limit)
        .offset(offset);

      return { memories };
    },
  });
}

export function createCreateTranslationMemoryTool(ctx: ToolContext) {
  return tool({
    description: "Create a new translation memory in the current organization.",
    inputSchema: z.object({
      name: z.string().trim().min(1).max(200).describe("Memory name."),
      description: z.string().max(10_000).optional().describe("Optional description."),
    }),
    execute: async ({ name, description }) => {
      if (!hasCapability(ctx.membershipRole, "memories:write")) {
        return {
          success: false,
          error:
            "You do not have permission to create translation memories. Only organization owners and admins can perform this action.",
        };
      }

      const [memory] = await ctx.db
        .insert(schema.memories)
        .values({
          organizationId: ctx.organizationId,
          name,
          description: description ?? "",
        })
        .returning();

      return { memory };
    },
  });
}

export function createUpdateTranslationMemoryTool(ctx: ToolContext) {
  return tool({
    description: "Update an existing translation memory by ID.",
    inputSchema: z.object({
      memoryId: z.string().describe("The memory ID to update."),
      name: z.string().trim().min(1).max(200).optional().describe("New memory name."),
      description: z.string().max(10_000).optional().describe("New description."),
      status: z.enum(["draft", "active", "archived"]).optional().describe("New status."),
    }),
    execute: async (input) => {
      if (!hasCapability(ctx.membershipRole, "memories:write")) {
        return {
          success: false,
          error:
            "You do not have permission to update translation memories. Only organization owners and admins can perform this action.",
        };
      }

      const { memoryId, ...rest } = input;
      const updates = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined));

      if (Object.keys(updates).length === 0) {
        return { success: false, error: "No fields provided to update." };
      }

      const existing = await toolGetAccessibleMemory(ctx, memoryId);
      if (!existing) {
        return { success: false, error: `Translation memory ${memoryId} not found.` };
      }

      const [memory] = await ctx.db
        .update(schema.memories)
        .set(updates)
        .where(toolMemoryOrgMutationWhere(ctx, memoryId))
        .returning();

      return { success: true, memory };
    },
  });
}

export function createDeleteTranslationMemoryTool(ctx: ToolContext) {
  return tool({
    description: "Delete a translation memory and all of its entries by ID.",
    inputSchema: z.object({
      memoryId: z.string().describe("The memory ID to delete."),
    }),
    execute: async ({ memoryId }) => {
      if (!hasCapability(ctx.membershipRole, "memories:write")) {
        return {
          success: false,
          error:
            "You do not have permission to delete translation memories. Only organization owners and admins can perform this action.",
        };
      }

      const existing = await toolGetAccessibleMemory(ctx, memoryId);
      if (!existing) {
        return { success: false, error: `Translation memory ${memoryId} not found.` };
      }

      const deleted = await ctx.db
        .delete(schema.memories)
        .where(toolMemoryOrgMutationWhere(ctx, memoryId))
        .returning({ id: schema.memories.id });

      return { success: true, deletedId: deleted[0].id };
    },
  });
}

/* ------------------------------------------------------------------ */
/* Memory Entry CRUD                                                  */
/* ------------------------------------------------------------------ */

export function createListMemoryEntriesTool(ctx: ToolContext) {
  return tool({
    description: "List entries for a specific translation memory.",
    inputSchema: z.object({
      memoryId: z.string().describe("The memory ID to list entries for."),
      sourceLocale: z.string().optional().describe("Optional source locale filter."),
      targetLocale: z.string().optional().describe("Optional target locale filter."),
      limit: z.number().min(1).max(100).default(50).describe("Maximum entries to return."),
      offset: z.number().min(0).default(0).describe("Number of entries to skip."),
    }),
    execute: async ({ memoryId, sourceLocale, targetLocale, limit, offset }) => {
      const memory = await toolGetAccessibleMemory(ctx, memoryId);
      if (!memory) {
        return { success: false, error: `Memory ${memoryId} not found.`, entries: [] };
      }

      const conditions = [eq(schema.memoryEntries.memoryId, memoryId)];
      if (sourceLocale) {
        conditions.push(eq(schema.memoryEntries.sourceLocale, sourceLocale));
      }
      if (targetLocale) {
        conditions.push(eq(schema.memoryEntries.targetLocale, targetLocale));
      }

      const entries = await ctx.db
        .select({
          id: schema.memoryEntries.id,
          sourceLocale: schema.memoryEntries.sourceLocale,
          targetLocale: schema.memoryEntries.targetLocale,
          sourceText: schema.memoryEntries.sourceText,
          targetText: schema.memoryEntries.targetText,
          matchScore: schema.memoryEntries.matchScore,
          provenance: schema.memoryEntries.provenance,
          reviewStatus: schema.memoryEntries.reviewStatus,
          externalKey: schema.memoryEntries.externalKey,
          createdAt: schema.memoryEntries.createdAt,
        })
        .from(schema.memoryEntries)
        .where(and(...conditions))
        .orderBy(desc(schema.memoryEntries.createdAt))
        .limit(limit)
        .offset(offset);

      return { success: true, entries };
    },
  });
}

export function createCreateMemoryEntryTool(ctx: ToolContext) {
  return tool({
    description: "Add a new entry to a translation memory.",
    inputSchema: z.object({
      memoryId: z.string().describe("The memory ID to add the entry to."),
      sourceLocale: z
        .string()
        .trim()
        .min(1)
        .max(50)
        .regex(localePattern, "invalid locale format (e.g., en, en-US, fr-FR)")
        .describe("BCP-47 source locale tag."),
      targetLocale: z
        .string()
        .trim()
        .min(1)
        .max(50)
        .regex(localePattern, "invalid locale format (e.g., en, en-US, fr-FR)")
        .describe("BCP-47 target locale tag."),
      sourceText: z.string().trim().min(1).describe("Original source text."),
      targetText: z.string().trim().min(1).describe("Translated target text."),
      matchScore: z.number().min(0).max(100).default(100).describe("Match quality score (0-100)."),
      provenance: z
        .string()
        .max(200)
        .default("manual")
        .describe("Origin of the translation (e.g., manual, mt, import)."),
      externalKey: z.string().optional().describe("Optional external identifier."),
    }),
    execute: async (input) => {
      if (!hasCapability(ctx.membershipRole, "memories:write")) {
        return {
          success: false,
          error:
            "You do not have permission to create translation memory entries. Only organization owners and admins can perform this action.",
        };
      }

      const { memoryId, ...entryData } = input;

      const memory = await toolGetAccessibleMemory(ctx, memoryId);
      if (!memory) {
        return { success: false, error: `Memory ${memoryId} not found.` };
      }

      const normalizedSourceText = normalizeTranslationMemorySourceText(entryData.sourceText);

      // Check for duplicates under the unique constraint (memoryId, sourceLocale, targetLocale, normalizedSourceText).
      const existing = await ctx.db
        .select({ id: schema.memoryEntries.id })
        .from(schema.memoryEntries)
        .where(
          and(
            eq(schema.memoryEntries.memoryId, memoryId),
            eq(schema.memoryEntries.sourceLocale, entryData.sourceLocale),
            eq(schema.memoryEntries.targetLocale, entryData.targetLocale),
            eq(schema.memoryEntries.normalizedSourceText, normalizedSourceText),
          ),
        )
        .limit(1);

      if (existing.length > 0) {
        return {
          success: false,
          error: `An entry with the same source text, locales, and memory already exists.`,
        };
      }

      const [entry] = await ctx.db
        .insert(schema.memoryEntries)
        .values({
          memoryId,
          sourceLocale: entryData.sourceLocale,
          targetLocale: entryData.targetLocale,
          sourceText: entryData.sourceText,
          normalizedSourceText,
          targetText: entryData.targetText,
          matchScore: entryData.matchScore,
          provenance: entryData.provenance,
          externalKey: entryData.externalKey ?? null,
        })
        .onConflictDoNothing()
        .returning();

      if (!entry) {
        return {
          success: false,
          error: `An entry with the same source text, locales, and memory already exists.`,
        };
      }

      return { success: true, entry };
    },
  });
}

export function createUpdateMemoryEntryTool(ctx: ToolContext) {
  return tool({
    description: "Update an existing translation memory entry by ID.",
    inputSchema: z.object({
      entryId: z.string().describe("The entry ID to update."),
      sourceText: z.string().trim().min(1).optional().describe("New source text."),
      targetText: z.string().trim().min(1).optional().describe("New target text."),
      sourceLocale: z
        .string()
        .trim()
        .min(1)
        .max(50)
        .regex(localePattern, "invalid locale format (e.g., en, en-US, fr-FR)")
        .optional()
        .describe("New source locale."),
      targetLocale: z
        .string()
        .trim()
        .min(1)
        .max(50)
        .regex(localePattern, "invalid locale format (e.g., en, en-US, fr-FR)")
        .optional()
        .describe("New target locale."),
      matchScore: z.number().min(0).max(100).optional().describe("New match score."),
      provenance: z.string().max(200).optional().describe("New provenance."),
      externalKey: z.string().optional().describe("New external key."),
      reviewStatus: z
        .enum(["approved", "pending", "rejected"])
        .optional()
        .describe("New review status."),
    }),
    execute: async (input) => {
      if (!hasCapability(ctx.membershipRole, "memories:write")) {
        return {
          success: false,
          error:
            "You do not have permission to update translation memory entries. Only organization owners and admins can perform this action.",
        };
      }

      const { entryId, sourceText, ...rest } = input;
      const updates: Record<string, unknown> = Object.fromEntries(
        Object.entries(rest).filter(([, v]) => v !== undefined),
      );

      if (sourceText !== undefined) {
        updates.sourceText = sourceText;
        updates.normalizedSourceText = normalizeTranslationMemorySourceText(sourceText);
      }

      if (Object.keys(updates).length === 0) {
        return { success: false, error: "No fields provided to update." };
      }

      // Verify ownership via the parent memory.
      const [entryWithMemory] = await ctx.db
        .select({ memoryOrgId: schema.memories.organizationId })
        .from(schema.memoryEntries)
        .innerJoin(schema.memories, eq(schema.memoryEntries.memoryId, schema.memories.id))
        .where(eq(schema.memoryEntries.id, entryId))
        .limit(1);

      if (!entryWithMemory || entryWithMemory.memoryOrgId !== ctx.organizationId) {
        return { success: false, error: `Entry ${entryId} not found.` };
      }

      const [entry] = await ctx.db
        .update(schema.memoryEntries)
        .set(updates)
        .where(eq(schema.memoryEntries.id, entryId))
        .returning();

      return { success: true, entry };
    },
  });
}

export function createDeleteMemoryEntryTool(ctx: ToolContext) {
  return tool({
    description: "Delete a translation memory entry by ID.",
    inputSchema: z.object({
      entryId: z.string().describe("The entry ID to delete."),
    }),
    execute: async ({ entryId }) => {
      if (!hasCapability(ctx.membershipRole, "memories:write")) {
        return {
          success: false,
          error:
            "You do not have permission to delete translation memory entries. Only organization owners and admins can perform this action.",
        };
      }

      // Verify ownership via the parent memory.
      const [entryWithMemory] = await ctx.db
        .select({ memoryOrgId: schema.memories.organizationId })
        .from(schema.memoryEntries)
        .innerJoin(schema.memories, eq(schema.memoryEntries.memoryId, schema.memories.id))
        .where(eq(schema.memoryEntries.id, entryId))
        .limit(1);

      if (!entryWithMemory || entryWithMemory.memoryOrgId !== ctx.organizationId) {
        return { success: false, error: `Entry ${entryId} not found.` };
      }

      const deleted = await ctx.db
        .delete(schema.memoryEntries)
        .where(eq(schema.memoryEntries.id, entryId))
        .returning({ id: schema.memoryEntries.id });

      if (deleted.length === 0) {
        return { success: false, error: `Entry ${entryId} not found.` };
      }

      return { success: true, deletedId: deleted[0].id };
    },
  });
}
