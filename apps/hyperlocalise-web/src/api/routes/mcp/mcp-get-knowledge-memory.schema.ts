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
    scope: z
      .enum(["organization", "project"])
      .default("organization")
      .describe("Knowledge memory scope to read."),
    projectId: projectIdSchema
      .optional()
      .describe("ID of the accessible project; required for project scope."),
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
