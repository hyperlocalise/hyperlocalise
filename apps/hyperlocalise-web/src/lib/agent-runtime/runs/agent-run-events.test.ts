import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { Thread } from "chat";

vi.mock("@/lib/interactions", () => ({
  addInteractionMessage: vi.fn(),
}));

import { wrapThreadPostForInteraction } from "./agent-run-events";

function createThread() {
  const posts: unknown[] = [];
  const thread = {
    post: vi.fn(async (message: unknown) => {
      posts.push(message);
      return { id: "sent_123" };
    }),
  } as unknown as Thread<Record<string, unknown>>;

  return { posts, thread };
}

describe("wrapThreadPostForInteraction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("persists string agent posts", async () => {
    const addMessage = vi.fn(async () => ({ id: "msg_123" }));
    const { thread } = createThread();

    wrapThreadPostForInteraction(thread, "interaction_123", addMessage);
    await thread.post("Agent reply");

    expect(addMessage).toHaveBeenCalledWith({
      interactionId: "interaction_123",
      senderType: "agent",
      text: "Agent reply",
    });
  });

  it("persists markdown object agent posts", async () => {
    const addMessage = vi.fn(async () => ({ id: "msg_123" }));
    const { thread } = createThread();

    wrapThreadPostForInteraction(thread, "interaction_123", addMessage);
    await thread.post({ markdown: "complex" });

    expect(addMessage).toHaveBeenCalledWith({
      interactionId: "interaction_123",
      senderType: "agent",
      text: "complex",
    });
  });

  it("does not persist posts without text content", async () => {
    const addMessage = vi.fn(async () => ({ id: "msg_123" }));
    const { thread } = createThread();

    wrapThreadPostForInteraction(thread, "interaction_123", addMessage);
    await thread.post({ card: { type: "card", children: [] } });

    expect(addMessage).not.toHaveBeenCalled();
  });

  it("persists raw object agent posts", async () => {
    const addMessage = vi.fn(async () => ({ id: "msg_123" }));
    const { thread } = createThread();

    wrapThreadPostForInteraction(thread, "interaction_123", addMessage);
    await thread.post({ raw: "Agent reply", files: [] });

    expect(addMessage).toHaveBeenCalledWith({
      interactionId: "interaction_123",
      senderType: "agent",
      text: "Agent reply",
    });
  });

  it("updates the tracked interaction without double wrapping", async () => {
    const addMessage = vi.fn(async () => ({ id: "msg_123" }));
    const { thread } = createThread();

    wrapThreadPostForInteraction(thread, "interaction_123", addMessage);
    wrapThreadPostForInteraction(thread, "interaction_456", addMessage);
    await thread.post("Agent reply");

    expect(addMessage).toHaveBeenCalledTimes(1);
    expect(addMessage).toHaveBeenCalledWith({
      interactionId: "interaction_456",
      senderType: "agent",
      text: "Agent reply",
    });
  });
});
