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
import { tool } from "ai";
import { z } from "zod";

import { ensureAgentSession, type AgentTodoItem } from "@/lib/agent-contracts/tool-context";

const todoItemSchema = z.object({
  id: z.string(),
  content: z.string(),
  status: z.enum(["todo", "in-progress", "completed"]),
});

export function createTodoWriteTool(
  getToolContext: () => { agentSession?: { todos: AgentTodoItem[] } },
) {
  return tool({
    description: `Create and manage a structured task list for the current agent run.

WHEN TO USE:
- Multi-step repository or workflow tasks with 3+ distinct steps
- After receiving a checklist of requirements

WHEN NOT TO USE:
- Single-step questions or one grep/read cycle
- Conversation orchestrator (use task tool to delegate instead)

USAGE:
- Replaces the entire todo list — send the full updated list each time
- Only one todo should be in-progress at a time`,
    inputSchema: z.object({
      todos: z
        .array(todoItemSchema)
        .describe("The complete list of todo items. This replaces existing todos."),
    }),
    execute: async ({ todos }) => {
      const session = ensureAgentSession(getToolContext());
      session.todos = todos;

      return {
        success: true as const,
        message: `Updated task list with ${todos.length} items`,
        todos,
      };
    },
  });
}
