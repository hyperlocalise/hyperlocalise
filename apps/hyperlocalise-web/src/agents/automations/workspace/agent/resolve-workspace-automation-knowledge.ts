import {
  hasWorkspaceAutomationKnowledgeTool,
  type WorkspaceAutomationRecord,
} from "@/lib/agents/workspace-automations";
import { getKnowledgeMemoryForOrganization } from "@/lib/knowledge-memory/knowledge-memory";
import { selectKnowledgeMemoryContext } from "@/lib/knowledge-memory/knowledge-memory-selection";

export async function resolveWorkspaceAutomationKnowledgeContext(input: {
  organizationId: string;
  automation: WorkspaceAutomationRecord;
}): Promise<string | null> {
  if (!hasWorkspaceAutomationKnowledgeTool(input.automation.toolConfig)) {
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
