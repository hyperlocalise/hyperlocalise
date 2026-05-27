import type { HyperlocaliseConversationMode } from "@/lib/agent-runtime/loops/conversation-mode";
import { repositoryWorkspaceToolNames } from "@/lib/agent-runtime/tools/manifest";
import type { ToolContext } from "@/lib/tools/types";

export const conversationFileTranslationToolNames = ["createTranslationJob"] as const;

export const conversationRepoSearchToolNames = [...repositoryWorkspaceToolNames] as const;

export function getConversationActiveTools(
  ctx: ToolContext,
  input: {
    hasFileAttachments?: boolean;
    mode?: HyperlocaliseConversationMode;
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
