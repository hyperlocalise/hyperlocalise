import { repositoryWorkspaceToolNames } from "@/lib/agent-contracts/repository-workspace-tools";
import type { ToolContext } from "@/lib/agent-contracts/tool-context";

export const conversationFileTranslationToolNames = ["createTranslationJob"] as const;

export const conversationRepoSearchToolNames = [...repositoryWorkspaceToolNames] as const;

type ConversationToolMode = "translation" | "repository" | "general";

export function getConversationActiveTools(
  ctx: ToolContext,
  input: {
    hasFileAttachments?: boolean;
    mode?: ConversationToolMode;
  } = {},
): string[] {
  const mode = input.mode ?? "general";
  const tools: string[] = [];

  if (mode === "translation") {
    if (input.hasFileAttachments) {
      tools.push(...conversationFileTranslationToolNames);
    }
    if (ctx.sandboxId) {
      tools.push(...conversationRepoSearchToolNames);
    }
    return tools;
  }

  if (mode === "repository") {
    if (ctx.sandboxId) {
      tools.push(...conversationRepoSearchToolNames);
    }
    return tools;
  }

  if (input.hasFileAttachments) {
    tools.push(...conversationFileTranslationToolNames);
  }

  return tools;
}
