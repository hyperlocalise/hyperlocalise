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

import { defineAgentTool } from "@/agents/_runtime/define-agent-tool";
import { hasWorkspaceAutomationKnowledgeTool } from "@/lib/agents/workspace-automation-types";
import { resolveWorkspaceKnowledgeFlag } from "@/lib/flags/workspace-flags";
import { loadUploadedGuidelinesContext } from "@/lib/knowledge-memory/uploaded-guidelines-context";

import type { WorkspaceOrchestratorSession } from "../context";

/**
 * Looks up guidance from the organization's guideline documents relevant to a model-supplied
 * query. Automation runs carry no locale context, so retrieval is locale-independent: only
 * documents that apply to every locale are considered, mirroring translation jobs that exceed
 * the per-request locale budget.
 *
 * Also re-checks the Autumn `guidelines` entitlement at call time, not just toolConfig — a
 * stored toolConfig alone isn't a reliable gate. recall_memory is the first forced tool whenever
 * guideline lookup is planned at all, so this returning a nonfatal "not found" instead of
 * throwing when the flag is off matters even more here: a thrown error on the very first step
 * (whether from this or a transient flag-lookup failure) shouldn't be able to threaten the
 * workflow/notification tools planned after it — feature availability is an expected condition
 * callers should branch on, not an invariant failure (AGENTS.md's Result-pattern guidance), so
 * this is treated the same way as "no document matched the query".
 */
export function createRecallMemoryTool(session: WorkspaceOrchestratorSession) {
  return defineAgentTool({
    description:
      "Look up workspace and project guideline documents relevant to a specific question. Returns nothing found if no document matches.",
    inputSchema: z.object({
      query: z.string().trim().min(1),
    }),
    execute: async ({ query }) => {
      if (!hasWorkspaceAutomationKnowledgeTool(session.automation.toolConfig)) {
        throw new Error("memory_not_enabled");
      }

      const knowledgeFeatureEnabled = await resolveWorkspaceKnowledgeFlag({
        organizationId: session.organizationId,
      });
      if (!knowledgeFeatureEnabled) {
        session.stepResults.recall_memory = { found: false };
        return { found: false, content: null };
      }

      const projectId = session.automation.projectId?.trim() || undefined;
      const guidelines = await loadUploadedGuidelinesContext({
        organizationId: session.organizationId,
        projectId,
        targetLocales: [],
        sourceText: query,
      });

      const found = guidelines.text.length > 0;

      // Record only whether something was found, never the recalled text itself — matches the
      // repo's no-content-in-logs rule (AGENTS.md). The actual content only ever reaches the
      // model's own context via the return value below, not a persisted column.
      session.stepResults.recall_memory = { found };
      return { found, content: found ? guidelines.text : null };
    },
  });
}
