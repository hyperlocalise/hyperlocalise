import { describe, expect, it } from "vite-plus/test";

import { extractLastUserMessage } from "./chat-stream-message";

describe("extractLastUserMessage", () => {
  it("returns the last user message id and text", () => {
    expect(
      extractLastUserMessage([
        {
          id: "msg_user_1",
          role: "user",
          parts: [{ type: "text", text: "first" }],
        },
        {
          id: "msg_agent_1",
          role: "assistant",
          parts: [{ type: "text", text: "reply" }],
        },
        {
          id: "msg_user_2",
          role: "user",
          parts: [{ type: "text", text: "second" }],
        },
      ]),
    ).toEqual({
      id: "msg_user_2",
      text: "second",
    });
  });

  it("returns null when no user message is present", () => {
    expect(
      extractLastUserMessage([
        {
          id: "msg_agent_1",
          role: "assistant",
          parts: [{ type: "text", text: "reply" }],
        },
      ]),
    ).toBeNull();
  });
});
