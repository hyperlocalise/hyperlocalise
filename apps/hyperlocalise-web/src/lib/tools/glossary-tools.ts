import { and, desc, eq, sql } from "drizzle-orm";
import { tool } from "ai";
import { z } from "zod";

import { schema } from "@/lib/database";
import { hasCapability } from "@/api/auth/policy";

import { localePattern } from "./locale";
import { toolCanAccessGlossary, toolProjectLinkedGlossaryWhere } from "./tool-access";
import type { ToolContext } from "./types";

/* ------------------------------------------------------------------ */
/* Ownership helpers                                                  */
/* ------------------------------------------------------------------ */

async function getAccessibleGlossary(ctx: ToolContext, glossaryId: string) {
  const accessible = await toolCanAccessGlossary(ctx, glossaryId);
  if (!accessible) {
    return null;
  }

  const [glossary] = await ctx.db
    .select()
    .from(schema.glossaries)
    .where(
      and(
        eq(schema.glossaries.id, glossaryId),
        eq(schema.glossaries.organizationId, ctx.organizationId),
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
        .where(await toolProjectLinkedGlossaryWhere(ctx))
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
      if (!hasCapability(ctx.membershipRole, "glossaries:write")) {
        return {
          success: false,
          error:
            "You do not have permission to create glossaries. Only organization owners and admins can perform this action.",
        };
      }

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
      if (!hasCapability(ctx.membershipRole, "glossaries:write")) {
        return {
          success: false,
          error:
            "You do not have permission to update glossaries. Only organization owners and admins can perform this action.",
        };
      }

      const { glossaryId, ...rest } = input;
      const updates = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined));

      if (Object.keys(updates).length === 0) {
        return { success: false, error: "No fields provided to update." };
      }

      const existing = await getAccessibleGlossary(ctx, glossaryId);
      if (!existing) {
        return { success: false, error: `Glossary ${glossaryId} not found.` };
      }

      const [glossary] = await ctx.db
        .update(schema.glossaries)
        .set(updates)
        .where(eq(schema.glossaries.id, glossaryId))
        .returning();

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
      if (!hasCapability(ctx.membershipRole, "glossaries:write")) {
        return {
          success: false,
          error:
            "You do not have permission to delete glossaries. Only organization owners and admins can perform this action.",
        };
      }

      const existing = await getAccessibleGlossary(ctx, glossaryId);
      if (!existing) {
        return { success: false, error: `Glossary ${glossaryId} not found.` };
      }

      const deleted = await ctx.db
        .delete(schema.glossaries)
        .where(eq(schema.glossaries.id, glossaryId))
        .returning({ id: schema.glossaries.id });

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
      const glossary = await getAccessibleGlossary(ctx, glossaryId);
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
      if (!hasCapability(ctx.membershipRole, "glossaries:write")) {
        return {
          success: false,
          error:
            "You do not have permission to create glossary terms. Only organization owners and admins can perform this action.",
        };
      }

      const { glossaryId, ...termData } = input;

      const glossary = await getAccessibleGlossary(ctx, glossaryId);
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
        .onConflictDoNothing()
        .returning();

      if (!term) {
        return {
          success: false,
          error: `Term "${termData.sourceTerm}" already exists in this glossary.`,
        };
      }

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
      if (!hasCapability(ctx.membershipRole, "glossaries:write")) {
        return {
          success: false,
          error:
            "You do not have permission to update glossary terms. Only organization owners and admins can perform this action.",
        };
      }

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
      if (!hasCapability(ctx.membershipRole, "glossaries:write")) {
        return {
          success: false,
          error:
            "You do not have permission to delete glossary terms. Only organization owners and admins can perform this action.",
        };
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

      const deleted = await ctx.db
        .delete(schema.glossaryTerms)
        .where(eq(schema.glossaryTerms.id, termId))
        .returning({ id: schema.glossaryTerms.id });

      if (deleted.length === 0) {
        return { success: false, error: `Term ${termId} not found.` };
      }

      return { success: true, deletedId: deleted[0].id };
    },
  });
}
