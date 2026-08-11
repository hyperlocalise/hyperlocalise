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
import { hasWorkspaceAutomationKnowledgeTool } from "@/lib/agents/workspace-automations";
import { resolveWorkspaceKnowledgeFlag } from "@/lib/flags/workspace-flags";
import { getKnowledgeMemoryForOrganization } from "@/lib/knowledge-memory/knowledge-memory";
import { selectKnowledgeMemoryContext } from "@/lib/knowledge-memory/knowledge-memory-selection";

import type { WorkspaceOrchestratorSession } from "../context";

/**
 * Looks up guidance from the organization's shared Memory.md relevant to a model-supplied query.
 * Replaces the old behaviour of silently pasting a fixed excerpt into the composed instructions
 * before the run started — the agent now asks a targeted question instead, reusing the same
 * query-aware excerpting (selectKnowledgeMemoryContext) that already exists for translation jobs.
 *
 * Also re-checks the workspace-knowledge feature flag at call time, not just toolConfig — see
 * save_memory.ts's docstring for why a stored toolConfig alone isn't a reliable gate. recall_memory
 * is the first forced tool whenever Memory is planned at all, so this returning a nonfatal "not
 * found" instead of throwing when the flag is off matters even more here: a thrown error on the
 * very first step (whether from this or a transient flag-lookup failure) shouldn't be able to
 * threaten the workflow/notification tools planned after it — feature availability is an expected
 * condition callers should branch on, not an invariant failure (AGENTS.md's Result-pattern
 * guidance), so this is treated the same way as "Memory is empty".
 */
export function createRecallMemoryTool(session: WorkspaceOrchestratorSession) {
  return defineAgentTool({
    description:
      "Look up guidance from the organization's shared Memory.md relevant to a specific question. Returns nothing found if Memory is empty or has no relevant content.",
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

      const memory = await getKnowledgeMemoryForOrganization(session.organizationId);
      if (!memory.content.trim()) {
        session.stepResults.recall_memory = { found: false };
        return { found: false, content: null };
      }

      const selected = selectKnowledgeMemoryContext({
        content: memory.content,
        sourceText: query,
        context: session.automation.name,
      });

      const compactText = selected.compactText.trim();
      const found = compactText.length > 0;

      // Record only whether something was found, never the recalled text itself — matches the
      // repo's no-content-in-logs rule (AGENTS.md). The actual content only ever reaches the
      // model's own context via the return value below, not a persisted column.
      session.stepResults.recall_memory = { found };
      return { found, content: found ? compactText : null };
    },
  });
}
