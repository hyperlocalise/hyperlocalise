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
import { listWorkspaceAutomationKnowledgeFileContents } from "@/lib/agents/workspace-automation-knowledge-files";
import { selectKnowledgeMemoryContext } from "@/lib/knowledge-memory/knowledge-memory-selection";

export function createRecallKnowledgeFilesTool(input: {
  organizationId: string;
  automationId: string;
}) {
  return defineAgentTool({
    description:
      "Look up guidance from files the agent creator uploaded (PDFs, markdown, and similar). Use this when the visitor asks about product, policy, or document-specific details.",
    inputSchema: z.object({
      query: z.string().trim().min(1).max(2000),
    }),
    execute: async ({ query }) => {
      const files = await listWorkspaceAutomationKnowledgeFileContents({
        organizationId: input.organizationId,
        automationId: input.automationId,
      });
      const withText = files.filter((file) => file.extractedText.trim().length > 0);
      if (withText.length === 0) {
        return { found: false, excerpts: [] };
      }

      const excerpts = withText.flatMap((file) => {
        const selected = selectKnowledgeMemoryContext({
          content: file.extractedText,
          sourceText: query,
          context: file.filename,
        });
        const compactText = selected.compactText.trim();
        if (!compactText) {
          return [];
        }
        return [{ filename: file.filename, content: compactText }];
      });

      return {
        found: excerpts.length > 0,
        excerpts,
      };
    },
  });
}
