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
import { desc } from "drizzle-orm";
import { tool } from "ai";
import { z } from "zod";

import { schema } from "@/lib/database";
import { isGlossaryManageAllowed } from "@/api/routes/glossary/glossary.shared";

import { localePattern } from "./locale";
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
    }),
    execute: async ({ name, description, sourceLocale }) => {
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
          targetLocale: null,
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
