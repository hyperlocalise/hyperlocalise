/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { and, desc, eq, isNotNull, isNull, or, sql } from "drizzle-orm";
import { tool } from "ai";
import { z } from "zod";

import { schema } from "@/lib/database";
import {
  isGlossaryContributeAllowed,
  isGlossaryContributorRole,
  isGlossaryManageAllowed,
} from "@/api/routes/glossary/glossary.shared";

import { localePattern } from "./locale";
import {
  assertNativeGlossaryTargetLocale,
  resolveNativeGlossaryTargetLocale,
} from "@/lib/glossary/resolve-native-glossary-target-locale";
import {
  toolGetAccessibleGlossary,
  toolGlossaryOrgMutationWhere,
  toolProjectLinkedGlossaryWhere,
} from "@/lib/tools/tool-access";
import type { ToolContext } from "@/lib/tools/types";

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
      if (!isGlossaryManageAllowed(ctx.membershipRole)) {
        return {
          success: false,
          error:
            "You do not have permission to create glossaries. Only organization admins can perform this action.",
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
      if (!isGlossaryManageAllowed(ctx.membershipRole)) {
        return {
          success: false,
          error:
            "You do not have permission to update glossaries. Only organization admins can perform this action.",
        };
      }

      const { glossaryId, ...rest } = input;
      const updates = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined));

      if (Object.keys(updates).length === 0) {
        return { success: false, error: "No fields provided to update." };
      }

      const existing = await toolGetAccessibleGlossary(ctx, glossaryId);
      if (!existing) {
        return { success: false, error: `Glossary ${glossaryId} not found.` };
      }

      const [glossary] = await ctx.db
        .update(schema.glossaries)
        .set(updates)
        .where(toolGlossaryOrgMutationWhere(ctx, glossaryId))
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
      if (!isGlossaryManageAllowed(ctx.membershipRole)) {
        return {
          success: false,
          error:
            "You do not have permission to delete glossaries. Only organization admins can perform this action.",
        };
      }

      const existing = await toolGetAccessibleGlossary(ctx, glossaryId);
      if (!existing) {
        return { success: false, error: `Glossary ${glossaryId} not found.` };
      }

      const deleted = await ctx.db
        .delete(schema.glossaries)
        .where(toolGlossaryOrgMutationWhere(ctx, glossaryId))
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
      const glossary = await toolGetAccessibleGlossary(ctx, glossaryId);
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
      if (!isGlossaryContributorRole(ctx.membershipRole)) {
        return {
          success: false,
          error:
            "You do not have permission to create glossary terms. Only organization admins can perform this action.",
        };
      }

      const { glossaryId, ...termData } = input;

      const glossary = await toolGetAccessibleGlossary(ctx, glossaryId);
      if (!glossary) {
        return { success: false, error: `Glossary ${glossaryId} not found.` };
      }
      if (!isGlossaryContributeAllowed(ctx.membershipRole, glossary)) {
        return {
          success: false,
          error: "You can only add terms to team glossaries you can access.",
        };
      }

      if (glossary.source === "native") {
        return createNativeConceptFromTermTool(ctx, glossary, termData);
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
      if (!isGlossaryContributorRole(ctx.membershipRole)) {
        return {
          success: false,
          error:
            "You do not have permission to update glossary terms. Only organization admins can perform this action.",
        };
      }

      const { termId, ...rest } = input;
      const updates = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined));

      if (Object.keys(updates).length === 0) {
        return { success: false, error: "No fields provided to update." };
      }

      // Verify the parent glossary is in the caller's accessible project scope.
      const accessible = await getAccessibleTermContext(ctx, termId);
      if (!accessible) {
        return { success: false, error: `Term ${termId} not found.` };
      }
      const { glossary, term: accessibleTerm } = accessible;
      if (!isGlossaryContributeAllowed(ctx.membershipRole, glossary)) {
        return {
          success: false,
          error: "You can only update terms on team glossaries you can access.",
        };
      }

      if (accessibleTerm.conceptId) {
        const nextText =
          rest.sourceTerm !== undefined
            ? rest.sourceTerm
            : rest.targetTerm !== undefined
              ? rest.targetTerm
              : undefined;
        const termUpdates = Object.fromEntries(
          Object.entries({
            description: rest.description,
            partOfSpeech: rest.partOfSpeech,
            caseSensitive: rest.caseSensitive,
            forbidden: rest.forbidden,
            reviewStatus: rest.reviewStatus,
            ...(nextText !== undefined
              ? { term: nextText, sourceTerm: nextText, targetTerm: nextText }
              : {}),
          }).filter(([, value]) => value !== undefined),
        );

        if (Object.keys(termUpdates).length === 0) {
          return { success: false, error: "No fields provided to update." };
        }

        await ctx.db.transaction(async (tx) => {
          await tx
            .update(schema.glossaryTerms)
            .set(termUpdates)
            .where(eq(schema.glossaryTerms.id, termId));

          if (
            nextText !== undefined &&
            accessibleTerm.locale === glossary.sourceLocale &&
            accessibleTerm.conceptId
          ) {
            await tx
              .update(schema.glossaryConcepts)
              .set({ primaryTerm: nextText })
              .where(eq(schema.glossaryConcepts.id, accessibleTerm.conceptId));
          }
        });

        const [term] = await ctx.db
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
          .where(eq(schema.glossaryTerms.id, termId))
          .limit(1);

        return { success: true, term };
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
      if (!isGlossaryContributorRole(ctx.membershipRole)) {
        return {
          success: false,
          error:
            "You do not have permission to delete glossary terms. Only organization admins can perform this action.",
        };
      }

      const glossary = await getAccessibleGlossaryForTerm(ctx, termId);
      if (!glossary) {
        return { success: false, error: `Term ${termId} not found.` };
      }
      if (!isGlossaryContributeAllowed(ctx.membershipRole, glossary)) {
        return {
          success: false,
          error: "You can only delete terms on team glossaries you can access.",
        };
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

async function getAccessibleGlossaryForTerm(ctx: ToolContext, termId: string) {
  const accessible = await getAccessibleTermContext(ctx, termId);
  return accessible?.glossary ?? null;
}

async function getAccessibleTermContext(ctx: ToolContext, termId: string) {
  const [term] = await ctx.db
    .select({
      glossaryId: schema.glossaryTerms.glossaryId,
      conceptId: schema.glossaryTerms.conceptId,
      locale: schema.glossaryTerms.locale,
    })
    .from(schema.glossaryTerms)
    .innerJoin(schema.glossaries, eq(schema.glossaryTerms.glossaryId, schema.glossaries.id))
    .where(eq(schema.glossaryTerms.id, termId))
    .limit(1);

  if (!term) {
    return null;
  }

  const glossary = await toolGetAccessibleGlossary(ctx, term.glossaryId);
  if (!glossary) {
    return null;
  }

  return { glossary, term };
}

async function createNativeConceptFromTermTool(
  ctx: ToolContext,
  glossary: {
    id: string;
    sourceLocale: string;
    targetLocale: string | null;
  },
  termData: {
    sourceTerm: string;
    targetTerm: string;
    description?: string;
    partOfSpeech?: string;
    caseSensitive: boolean;
    forbidden: boolean;
  },
) {
  let targetLocale: string;
  try {
    targetLocale = assertNativeGlossaryTargetLocale(
      await resolveNativeGlossaryTargetLocale({
        glossary,
        projectId: ctx.projectId,
        database: ctx.db,
      }),
    );
  } catch (error) {
    if (error instanceof Error) {
      return { success: false, error: error.message };
    }
    throw error;
  }

  const sourceTermMatch = termData.caseSensitive
    ? eq(schema.glossaryTerms.term, termData.sourceTerm)
    : sql`lower(${schema.glossaryTerms.term}) = lower(${termData.sourceTerm})`;
  const legacySourceTermMatch = termData.caseSensitive
    ? eq(schema.glossaryTerms.sourceTerm, termData.sourceTerm)
    : sql`lower(${schema.glossaryTerms.sourceTerm}) = lower(${termData.sourceTerm})`;

  const existing = await ctx.db
    .select({ id: schema.glossaryTerms.id })
    .from(schema.glossaryTerms)
    .where(
      and(
        eq(schema.glossaryTerms.glossaryId, glossary.id),
        or(
          and(
            isNotNull(schema.glossaryTerms.conceptId),
            eq(schema.glossaryTerms.locale, glossary.sourceLocale),
            sourceTermMatch,
          ),
          and(isNull(schema.glossaryTerms.conceptId), legacySourceTermMatch),
        ),
      ),
    )
    .limit(1);

  if (existing.length > 0) {
    return {
      success: false,
      error: `Term "${termData.sourceTerm}" already exists in this glossary.`,
    };
  }

  const created = await ctx.db.transaction(async (tx) => {
    const [concept] = await tx
      .insert(schema.glossaryConcepts)
      .values({
        glossaryId: glossary.id,
        primaryTerm: termData.sourceTerm,
        definition: termData.description ?? "",
        translatable: true,
      })
      .returning();

    if (!concept) {
      return null;
    }

    const sharedFields = {
      glossaryId: glossary.id,
      conceptId: concept.id,
      description: termData.description ?? "",
      partOfSpeech: termData.partOfSpeech ?? "",
      caseSensitive: termData.caseSensitive,
      forbidden: termData.forbidden,
      status: "draft" as const,
      provenance: "manual" as const,
    };

    const terms = [
      {
        ...sharedFields,
        locale: glossary.sourceLocale,
        term: termData.sourceTerm,
        sourceTerm: termData.sourceTerm,
        targetTerm: termData.targetTerm,
      },
      {
        ...sharedFields,
        locale: targetLocale,
        term: termData.targetTerm,
        sourceTerm: termData.sourceTerm,
        targetTerm: termData.targetTerm,
      },
    ];
    await tx.insert(schema.glossaryTerms).values(terms);
    return concept;
  });

  if (!created) {
    return { success: false, error: "Failed to create the glossary concept." };
  }

  return { success: true, concept: created };
}
