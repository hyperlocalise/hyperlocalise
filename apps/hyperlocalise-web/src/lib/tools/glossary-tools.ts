import { and, desc, eq, sql } from "drizzle-orm";
import { tool } from "ai";
import { z } from "zod";

import { schema } from "@/lib/database";

import type { ToolContext } from "./types";

const localePattern = /^[a-z]{2,3}(-[A-Z]{2,3})?$/;

/* ------------------------------------------------------------------ */
/* Ownership helpers                                                  */
/* ------------------------------------------------------------------ */

async function getOwnedGlossary(db: ToolContext["db"], organizationId: string, glossaryId: string) {
  const [glossary] = await db
    .select()
    .from(schema.glossaries)
    .where(
      and(
        eq(schema.glossaries.id, glossaryId),
        eq(schema.glossaries.organizationId, organizationId),
      ),
    )
    .limit(1);
  return glossary ?? null;
}

/* ------------------------------------------------------------------ */
/* Glossary CRUD                                                      */
/* ------------------------------------------------------------------ */

export function createListGlossariesTool(ctx: ToolContext) {
  return tool({
    description: "List glossaries in the current organization.",
    inputSchema: z.object({
      limit: z.number().min(1).max(50).default(20).describe("Maximum glossaries to return."),
      offset: z.number().min(0).default(0).describe("Number of glossaries to skip."),
    }),
    execute: async ({ limit, offset }) => {
      const glossaries = await ctx.db
        .select({
          id: schema.glossaries.id,
          name: schema.glossaries.name,
          description: schema.glossaries.description,
          sourceLocale: schema.glossaries.sourceLocale,
          targetLocale: schema.glossaries.targetLocale,
          status: schema.glossaries.status,
          createdAt: schema.glossaries.createdAt,
        })
        .from(schema.glossaries)
        .where(eq(schema.glossaries.organizationId, ctx.organizationId))
        .orderBy(desc(schema.glossaries.createdAt))
        .limit(limit)
        .offset(offset);

      return { glossaries };
    },
  });
}

export function createCreateGlossaryTool(ctx: ToolContext) {
  return tool({
    description: "Create a new glossary in the current organization.",
    inputSchema: z.object({
      name: z.string().trim().min(1).max(200).describe("Glossary name."),
      description: z.string().max(10_000).optional().describe("Optional description."),
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
    }),
    execute: async ({ name, description, sourceLocale, targetLocale }) => {
      const [glossary] = await ctx.db
        .insert(schema.glossaries)
        .values({
          organizationId: ctx.organizationId,
          name,
          description: description ?? "",
          sourceLocale,
          targetLocale,
        })
        .returning();

      return { glossary };
    },
  });
}

export function createUpdateGlossaryTool(ctx: ToolContext) {
  return tool({
    description: "Update an existing glossary by ID.",
    inputSchema: z.object({
      glossaryId: z.string().describe("The glossary ID to update."),
      name: z.string().trim().min(1).max(200).optional().describe("New glossary name."),
      description: z.string().max(10_000).optional().describe("New description."),
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
      status: z.enum(["draft", "active", "archived"]).optional().describe("New status."),
    }),
    execute: async (input) => {
      const { glossaryId, ...rest } = input;
      const updates = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined));

      if (Object.keys(updates).length === 0) {
        return { success: false, error: "No fields provided to update." };
      }

      const [glossary] = await ctx.db
        .update(schema.glossaries)
        .set(updates)
        .where(
          and(
            eq(schema.glossaries.id, glossaryId),
            eq(schema.glossaries.organizationId, ctx.organizationId),
          ),
        )
        .returning();

      if (!glossary) {
        return { success: false, error: `Glossary ${glossaryId} not found.` };
      }

      return { success: true, glossary };
    },
  });
}

export function createDeleteGlossaryTool(ctx: ToolContext) {
  return tool({
    description: "Delete a glossary and all of its terms by ID.",
    inputSchema: z.object({
      glossaryId: z.string().describe("The glossary ID to delete."),
    }),
    execute: async ({ glossaryId }) => {
      const deleted = await ctx.db
        .delete(schema.glossaries)
        .where(
          and(
            eq(schema.glossaries.id, glossaryId),
            eq(schema.glossaries.organizationId, ctx.organizationId),
          ),
        )
        .returning({ id: schema.glossaries.id });

      if (deleted.length === 0) {
        return { success: false, error: `Glossary ${glossaryId} not found.` };
      }

      return { success: true, deletedId: deleted[0].id };
    },
  });
}

/* ------------------------------------------------------------------ */
/* Glossary Term CRUD                                                 */
/* ------------------------------------------------------------------ */

export function createListGlossaryTermsTool(ctx: ToolContext) {
  return tool({
    description: "List terms for a specific glossary.",
    inputSchema: z.object({
      glossaryId: z.string().describe("The glossary ID to list terms for."),
      limit: z.number().min(1).max(100).default(50).describe("Maximum terms to return."),
      offset: z.number().min(0).default(0).describe("Number of terms to skip."),
    }),
    execute: async ({ glossaryId, limit, offset }) => {
      const glossary = await getOwnedGlossary(ctx.db, ctx.organizationId, glossaryId);
      if (!glossary) {
        return { success: false, error: `Glossary ${glossaryId} not found.`, terms: [] };
      }

      const terms = await ctx.db
        .select({
          id: schema.glossaryTerms.id,
          sourceTerm: schema.glossaryTerms.sourceTerm,
          targetTerm: schema.glossaryTerms.targetTerm,
          description: schema.glossaryTerms.description,
          partOfSpeech: schema.glossaryTerms.partOfSpeech,
          caseSensitive: schema.glossaryTerms.caseSensitive,
          forbidden: schema.glossaryTerms.forbidden,
          reviewStatus: schema.glossaryTerms.reviewStatus,
          createdAt: schema.glossaryTerms.createdAt,
        })
        .from(schema.glossaryTerms)
        .where(eq(schema.glossaryTerms.glossaryId, glossaryId))
        .orderBy(schema.glossaryTerms.sourceTerm)
        .limit(limit)
        .offset(offset);

      return { success: true, terms };
    },
  });
}

export function createCreateGlossaryTermTool(ctx: ToolContext) {
  return tool({
    description: "Add a new term to a glossary.",
    inputSchema: z.object({
      glossaryId: z.string().describe("The glossary ID to add the term to."),
      sourceTerm: z.string().trim().min(1).describe("Source language term."),
      targetTerm: z.string().trim().min(1).describe("Target language translation."),
      description: z.string().optional().describe("Optional description or context."),
      partOfSpeech: z.string().optional().describe("Optional part of speech (e.g., noun, verb)."),
      caseSensitive: z.boolean().default(false).describe("Whether matching is case-sensitive."),
      forbidden: z.boolean().default(false).describe("Whether this translation is forbidden."),
    }),
    execute: async (input) => {
      const { glossaryId, ...termData } = input;

      const glossary = await getOwnedGlossary(ctx.db, ctx.organizationId, glossaryId);
      if (!glossary) {
        return { success: false, error: `Glossary ${glossaryId} not found.` };
      }

      // Check for duplicate terms within the same glossary.
      const duplicateCheck = termData.caseSensitive
        ? eq(schema.glossaryTerms.sourceTerm, termData.sourceTerm)
        : sql`lower(${schema.glossaryTerms.sourceTerm}) = lower(${termData.sourceTerm})`;

      const existing = await ctx.db
        .select({ id: schema.glossaryTerms.id })
        .from(schema.glossaryTerms)
        .where(and(eq(schema.glossaryTerms.glossaryId, glossaryId), duplicateCheck))
        .limit(1);

      if (existing.length > 0) {
        return {
          success: false,
          error: `Term "${termData.sourceTerm}" already exists in this glossary.`,
        };
      }

      const [term] = await ctx.db
        .insert(schema.glossaryTerms)
        .values({
          glossaryId,
          sourceTerm: termData.sourceTerm,
          targetTerm: termData.targetTerm,
          description: termData.description ?? "",
          partOfSpeech: termData.partOfSpeech ?? "",
          caseSensitive: termData.caseSensitive,
          forbidden: termData.forbidden,
        })
        .returning();

      return { success: true, term };
    },
  });
}

export function createUpdateGlossaryTermTool(ctx: ToolContext) {
  return tool({
    description: "Update an existing glossary term by ID.",
    inputSchema: z.object({
      termId: z.string().describe("The term ID to update."),
      sourceTerm: z.string().trim().min(1).optional().describe("New source term."),
      targetTerm: z.string().trim().min(1).optional().describe("New target term."),
      description: z.string().optional().describe("New description."),
      partOfSpeech: z.string().optional().describe("New part of speech."),
      caseSensitive: z.boolean().optional().describe("New case sensitivity flag."),
      forbidden: z.boolean().optional().describe("New forbidden flag."),
      reviewStatus: z
        .enum(["approved", "pending", "rejected"])
        .optional()
        .describe("New review status."),
    }),
    execute: async (input) => {
      const { termId, ...rest } = input;
      const updates = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined));

      if (Object.keys(updates).length === 0) {
        return { success: false, error: "No fields provided to update." };
      }

      // Verify ownership via the parent glossary.
      const [termWithGlossary] = await ctx.db
        .select({ glossaryOrgId: schema.glossaries.organizationId })
        .from(schema.glossaryTerms)
        .innerJoin(schema.glossaries, eq(schema.glossaryTerms.glossaryId, schema.glossaries.id))
        .where(eq(schema.glossaryTerms.id, termId))
        .limit(1);

      if (!termWithGlossary || termWithGlossary.glossaryOrgId !== ctx.organizationId) {
        return { success: false, error: `Term ${termId} not found.` };
      }

      const [term] = await ctx.db
        .update(schema.glossaryTerms)
        .set(updates)
        .where(eq(schema.glossaryTerms.id, termId))
        .returning();

      return { success: true, term };
    },
  });
}

export function createDeleteGlossaryTermTool(ctx: ToolContext) {
  return tool({
    description: "Delete a glossary term by ID.",
    inputSchema: z.object({
      termId: z.string().describe("The term ID to delete."),
    }),
    execute: async ({ termId }) => {
      // Verify ownership via the parent glossary.
      const [termWithGlossary] = await ctx.db
        .select({ glossaryOrgId: schema.glossaries.organizationId })
        .from(schema.glossaryTerms)
        .innerJoin(schema.glossaries, eq(schema.glossaryTerms.glossaryId, schema.glossaries.id))
        .where(eq(schema.glossaryTerms.id, termId))
        .limit(1);

      if (!termWithGlossary || termWithGlossary.glossaryOrgId !== ctx.organizationId) {
        return { success: false, error: `Term ${termId} not found.` };
      }

      const deleted = await ctx.db
        .delete(schema.glossaryTerms)
        .where(eq(schema.glossaryTerms.id, termId))
        .returning({ id: schema.glossaryTerms.id });

      return { success: true, deletedId: deleted[0].id };
    },
  });
}
