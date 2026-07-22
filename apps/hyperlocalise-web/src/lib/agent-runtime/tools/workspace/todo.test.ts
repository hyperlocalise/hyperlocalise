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
import { describe, expect, it } from "vite-plus/test";

import { ensureAgentSession } from "@/lib/agent-contracts/tool-context";

import { createTodoWriteTool } from "./todo";

const toolCallInfo = { toolCallId: "test-tool-call", messages: [] };

describe("createTodoWriteTool", () => {
  it("stores todos on the tool context session", async () => {
    const ctx = { conversationId: "c1" } as Parameters<typeof ensureAgentSession>[0] & {
      conversationId: string;
    };
    const tool = createTodoWriteTool(() => ctx);
    const todos = [
      { id: "1", content: "Search repo", status: "in-progress" as const },
      { id: "2", content: "Summarize", status: "todo" as const },
    ];

    const result = await tool.execute!({ todos }, toolCallInfo);
    expect(result).toMatchObject({ success: true, todos });
    expect(ensureAgentSession(ctx).todos).toEqual(todos);
  });
});
