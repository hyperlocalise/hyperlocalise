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
