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

import { z } from "zod";

import { projectIdSchema } from "@/lib/projects/identity/project-id";

export const mcpGetKnowledgeMemoryInputSchema = z
  .object({
    query: z
      .string()
      .trim()
      .min(1)
      .describe("Question or source text the retrieved guideline documents must be relevant to."),
    scope: z
      .enum(["organization", "project"])
      .default("organization")
      .describe("Guideline scope to search."),
    projectId: projectIdSchema
      .optional()
      .describe("ID of the accessible project; required for project scope."),
    targetLocale: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe("BCP-47 locale narrowing retrieval to locale-scoped documents."),
  })
  .superRefine((input, ctx) => {
    if (input.scope === "project" && !input.projectId) {
      ctx.addIssue({
        code: "custom",
        path: ["projectId"],
        message: "projectId is required when scope is project",
      });
    }
  });

export type McpGetKnowledgeMemoryInput = z.infer<typeof mcpGetKnowledgeMemoryInputSchema>;
