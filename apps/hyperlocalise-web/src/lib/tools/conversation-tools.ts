import type { ToolContext } from "./types";

export const conversationFileTranslationToolNames = ["createTranslationJob"] as const;

export const conversationRepoSearchToolNames = ["searchRepoFiles", "readRepoFile"] as const;

export function getConversationActiveTools(
  ctx: ToolContext,
  input: { hasFileAttachments?: boolean } = {},
): string[] {
  const tools: string[] = [];

  if (input.hasFileAttachments) {
    tools.push(...conversationFileTranslationToolNames);
  }

  if (ctx.sandboxId) {
    tools.push(...conversationRepoSearchToolNames);
  }

  return tools;
}
