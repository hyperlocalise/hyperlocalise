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

import { hasCapability } from "@/api/auth/policy";
import { defineAgentTool } from "@/agents/_runtime/define-agent-tool";
import type { ToolContext } from "@/lib/agent-contracts/tool-context";
import { loadUploadedGuidelinesContext } from "@/lib/knowledge-memory/uploaded-guidelines-context";

const knowledgeMemoryScopeSchema = z
  .enum(["organization", "project"])
  .default("organization")
  .describe(
    "Which guideline documents to search. Use project only when the conversation has a current project.",
  );

function unavailableResult() {
  return {
    success: false as const,
    code: "knowledge_memory_unavailable" as const,
    error: "Workspace Knowledge is not enabled for this organization.",
  };
}

function permissionDeniedResult() {
  return {
    success: false as const,
    code: "knowledge_memory_permission_denied" as const,
    error: "You do not have permission to read organization guideline documents.",
  };
}

function projectUnavailableResult() {
  return {
    success: false as const,
    code: "knowledge_memory_project_unavailable" as const,
    error: "No current project is available for project guideline documents.",
  };
}

export function createGetKnowledgeMemoryTool(ctx: ToolContext) {
  return defineAgentTool({
    description:
      "Search workspace and project guideline documents for passages relevant to a specific question. Returns nothing found if no document matches.",
    inputSchema: z.object({
      query: z
        .string()
        .trim()
        .min(1)
        .describe("Question or source text the retrieved guideline documents must be relevant to."),
      scope: knowledgeMemoryScopeSchema,
    }),
    execute: async ({ query, scope }) => {
      const resolvedScope = scope === "project" ? "project" : "organization";
      if (ctx.knowledgeMemoryEnabled !== true) {
        return unavailableResult();
      }

      if (!hasCapability(ctx.membershipRole, "memories:read")) {
        return permissionDeniedResult();
      }

      if (resolvedScope === "project" && !ctx.projectId) {
        return projectUnavailableResult();
      }

      const guidelines = await loadUploadedGuidelinesContext({
        organizationId: ctx.organizationId,
        projectId: resolvedScope === "project" && ctx.projectId ? ctx.projectId : undefined,
        targetLocales: [],
        sourceText: query,
      });

      return {
        success: true as const,
        scope: resolvedScope,
        found: guidelines.text.length > 0,
        guidelines,
      };
    },
  });
}
