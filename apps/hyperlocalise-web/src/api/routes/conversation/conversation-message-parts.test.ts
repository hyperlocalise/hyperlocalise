import { describe, expect, it } from "vite-plus/test";

import {
  redactSensitiveAgentMessageParts,
  sanitizeInteractionMessagesForRole,
  sanitizeLastMessagePreviewForRole,
} from "./conversation-message-parts";

describe("conversation message parts redaction", () => {
  const toolParts = [
    { type: "text", text: "Found the login copy." },
    {
      type: "tool-grep",
      state: "output-available",
      toolCallId: "call_1",
      input: { pattern: "SECRET_TOKEN" },
      output: { matches: [".env:1:SECRET_TOKEN=abc"] },
    },
    { type: "reasoning", text: "Search the repository for auth config." },
    { type: "source-url", sourceId: "src_1", url: "https://example.com/docs" },
  ];

  it("keeps tool and reasoning parts for roles that can run AI actions", () => {
    expect(redactSensitiveAgentMessageParts(toolParts, "admin")).toEqual(toolParts);
  });

  it("redacts tool and reasoning parts for read-only members", () => {
    expect(redactSensitiveAgentMessageParts(toolParts, "member")).toEqual([
      { type: "text", text: "Found the login copy." },
      { type: "source-url", sourceId: "src_1", url: "https://example.com/docs" },
    ]);
  });

  it("sanitizes only agent messages in a conversation payload", () => {
    const messages = [
      {
        id: "msg_user",
        senderType: "user",
        text: "Where is login?",
        parts: [{ type: "text", text: "Where is login?" }],
      },
      {
        id: "msg_agent",
        senderType: "agent",
        text: "Found the login copy.\nSearch the repository for auth config.",
        parts: toolParts,
      },
    ];

    expect(sanitizeInteractionMessagesForRole(messages, "member")).toEqual([
      messages[0],
      {
        ...messages[1],
        text: "Found the login copy.",
        parts: [
          { type: "text", text: "Found the login copy." },
          { type: "source-url", sourceId: "src_1", url: "https://example.com/docs" },
        ],
      },
    ]);
  });

  it("rebuilds list preview text from readable parts for read-only members", () => {
    const preview = {
      text: "Found the login copy.\nSearch the repository for auth config.",
      senderType: "agent" as const,
      createdAt: new Date("2026-07-10T00:00:00.000Z"),
      parts: toolParts,
    };

    expect(sanitizeLastMessagePreviewForRole(preview, "member")).toEqual({
      text: "Found the login copy.",
      senderType: "agent",
      createdAt: preview.createdAt,
    });
    expect(sanitizeLastMessagePreviewForRole(preview, "admin")).toEqual({
      text: preview.text,
      senderType: "agent",
      createdAt: preview.createdAt,
    });
  });
});
