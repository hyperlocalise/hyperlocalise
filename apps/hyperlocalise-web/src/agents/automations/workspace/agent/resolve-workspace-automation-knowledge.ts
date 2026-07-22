/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file and at https://mariadb.com/bsl11/.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import type { WorkspaceAutomationRecord } from "@/lib/agents/workspace-automations";
import { getKnowledgeMemoryForOrganization } from "@/lib/knowledge-memory/knowledge-memory";
import { selectKnowledgeMemoryContext } from "@/lib/knowledge-memory/knowledge-memory-selection";

export async function resolveWorkspaceAutomationKnowledgeContext(input: {
  organizationId: string;
  automation: WorkspaceAutomationRecord;
}): Promise<string | null> {
  if (!input.automation.toolConfig.knowledge?.enabled) {
    return null;
  }

  const memory = await getKnowledgeMemoryForOrganization(input.organizationId);
  if (!memory.content.trim()) {
    return null;
  }

  const selected = selectKnowledgeMemoryContext({
    content: memory.content,
    sourceText: input.automation.instructions,
    context: input.automation.name,
  });

  const compactText = selected.compactText.trim();
  return compactText.length > 0 ? compactText : null;
}
