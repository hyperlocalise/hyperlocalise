/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
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
