import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { Message, Thread } from "chat";

import {
  extractTeamId,
  getOrCreateInteraction,
  handleNewConversation,
  handleSubscribedMessage,
  wrapThreadPost,
} from "./bot";

vi.mock("@/lib/env", () => ({
  env: {
    SLACK_BOT_TOKEN: "test-token",
    SLACK_SIGNING_SECRET: "test-secret",
  },
}));

vi.mock("@/lib/agents/slack/helpers", () => ({
  findSlackConnector: vi.fn(),
}));

vi.mock("@/lib/interactions", () => ({
  addInteractionMessage: vi.fn(),
  createInteraction: vi.fn(),
  findInteractionBySourceThreadId: vi.fn(),
}));

vi.mock("@/lib/agents/runtime/state", () => ({
  createChatStateAdapter: vi.fn(),
}));

vi.mock("@/lib/log", () => ({
  createChatLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

import { findSlackConnector } from "@/lib/agents/slack/helpers";
import {
  addInteractionMessage,
  createInteraction,
  findInteractionBySourceThreadId,
} from "@/lib/interactions";

function createMessage(
  input: {
    text?: string;
    isBot?: boolean;
    raw?: Record<string, unknown>;
  } = {},
): Message {
  return {
    id: "msg_123",
    threadId: "slack:C123:1234567890.123456",
    text: input.text ?? "Hello bot",
    raw: input.raw ?? { team_id: "T123" },
    author: {
      userId: "U123",
      userName: "alice",
      fullName: "Alice",
      isBot: input.isBot ?? false,
      isMe: false,
    },
    metadata: { dateSent: new Date(), edited: false },
    formatted: { type: "root", children: [] },
  } as unknown as Message;
}

function createThread() {
  const posts: unknown[] = [];
  let subscribed = false;

  const thread = {
    id: "slack:C123:1234567890.123456",
    post: vi.fn(async (message: unknown) => {
      posts.push(message);
      return { id: "sent_123" };
    }),
    subscribe: vi.fn(async () => {
      subscribed = true;
    }),
  } as unknown as Thread<Record<string, unknown>>;

  return { thread, posts, getSubscribed: () => subscribed };
}

describe("extractTeamId", () => {
  it("returns team_id from message raw", () => {
    const message = createMessage({ raw: { team_id: "T456" } });
    expect(extractTeamId(message)).toBe("T456");
  });

  it("falls back to team field", () => {
    const message = createMessage({ raw: { team: "T789" } });
    expect(extractTeamId(message)).toBe("T789");
  });

  it("prefers team_id over team", () => {
    const message = createMessage({ raw: { team_id: "T111", team: "T222" } });
    expect(extractTeamId(message)).toBe("T111");
  });

  it("returns null when neither is present", () => {
    const message = createMessage({ raw: {} });
    expect(extractTeamId(message)).toBeNull();
  });
});

describe("wrapThreadPost", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("persists agent replies after posting", async () => {
    const { thread } = createThread();
    await wrapThreadPost(thread, "interaction-123");

    await thread.post("Agent reply");

    expect(addInteractionMessage).toHaveBeenCalledWith({
      interactionId: "interaction-123",
      senderType: "agent",
      text: "Agent reply",
    });
  });

  it("does not persist non-string posts", async () => {
    const { thread } = createThread();
    await wrapThreadPost(thread, "interaction-123");

    await thread.post({ markdown: "complex" });

    expect(addInteractionMessage).not.toHaveBeenCalled();
  });
});

describe("getOrCreateInteraction", () => {
  it("returns existing interaction when found", async () => {
    const existing = { id: "interaction-123", title: "Existing" };
    vi.mocked(findInteractionBySourceThreadId).mockResolvedValue(existing as never);

    const result = await getOrCreateInteraction("org-123", "thread-123", "Title");

    expect(result).toBe(existing);
    expect(findInteractionBySourceThreadId).toHaveBeenCalledWith({
      organizationId: "org-123",
      source: "slack_agent",
      sourceThreadId: "thread-123",
    });
    expect(createInteraction).not.toHaveBeenCalled();
  });

  it("creates new interaction when not found", async () => {
    vi.mocked(findInteractionBySourceThreadId).mockResolvedValue(null as never);
    vi.mocked(createInteraction).mockResolvedValue({
      id: "interaction-456",
      title: "Title",
    } as never);

    const result = await getOrCreateInteraction("org-123", "thread-123", "Title");

    expect(result).toEqual({ id: "interaction-456", title: "Title" });
    expect(createInteraction).toHaveBeenCalledWith({
      organizationId: "org-123",
      source: "slack_agent",
      title: "Title",
      sourceThreadId: "thread-123",
    });
  });
});

describe("handleNewConversation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("ignores bot messages", async () => {
    const { thread } = createThread();
    const message = createMessage({ isBot: true });

    await handleNewConversation(thread, message);

    expect(findSlackConnector).not.toHaveBeenCalled();
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(thread.subscribe).not.toHaveBeenCalled();
  });

  it("ignores messages without team id", async () => {
    const { thread } = createThread();
    const message = createMessage({ raw: {} });

    await handleNewConversation(thread, message);

    expect(findSlackConnector).not.toHaveBeenCalled();
  });

  it("ignores messages from unknown workspaces", async () => {
    const { thread } = createThread();
    const message = createMessage();
    vi.mocked(findSlackConnector).mockResolvedValue(null as never);

    await handleNewConversation(thread, message);

    expect(findSlackConnector).toHaveBeenCalledWith("T123");
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(thread.subscribe).not.toHaveBeenCalled();
  });

  it("creates interaction, persists message, subscribes, and posts greeting", async () => {
    const { thread, posts, getSubscribed } = createThread();
    const message = createMessage({ text: "Help me translate" });

    vi.mocked(findSlackConnector).mockResolvedValue({
      id: "connector-123",
      organizationId: "org-123",
      enabled: true,
    } as never);
    vi.mocked(findInteractionBySourceThreadId).mockResolvedValue(null as never);
    vi.mocked(createInteraction).mockResolvedValue({
      id: "interaction-123",
      title: "Help me translate",
    } as never);
    vi.mocked(addInteractionMessage).mockResolvedValue({ id: "msg-123" } as never);

    await handleNewConversation(thread, message);

    expect(findInteractionBySourceThreadId).toHaveBeenCalledWith({
      organizationId: "org-123",
      source: "slack_agent",
      sourceThreadId: thread.id,
    });
    expect(createInteraction).toHaveBeenCalledWith({
      organizationId: "org-123",
      source: "slack_agent",
      title: "Help me translate",
      sourceThreadId: thread.id,
    });
    expect(addInteractionMessage).toHaveBeenCalledWith({
      interactionId: "interaction-123",
      senderType: "user",
      text: "Help me translate",
    });
    expect(getSubscribed()).toBe(true);
    expect(posts).toEqual(["Hello! I'm the Hyperlocalise agent. How can I help?"]);
  });

  it("resumes existing interaction and persists agent reply", async () => {
    const { thread, posts } = createThread();
    const message = createMessage({ text: "Follow up" });

    vi.mocked(findSlackConnector).mockResolvedValue({
      id: "connector-123",
      organizationId: "org-123",
      enabled: true,
    } as never);
    vi.mocked(findInteractionBySourceThreadId).mockResolvedValue({
      id: "interaction-123",
      title: "Existing",
    } as never);
    vi.mocked(addInteractionMessage).mockResolvedValue({ id: "msg-123" } as never);

    await handleNewConversation(thread, message);

    expect(createInteraction).not.toHaveBeenCalled();
    expect(addInteractionMessage).toHaveBeenCalledWith({
      interactionId: "interaction-123",
      senderType: "user",
      text: "Follow up",
    });
    expect(posts).toEqual(["Hello! I'm the Hyperlocalise agent. How can I help?"]);

    // Agent reply should also be persisted via wrapped post
    expect(addInteractionMessage).toHaveBeenLastCalledWith({
      interactionId: "interaction-123",
      senderType: "agent",
      text: "Hello! I'm the Hyperlocalise agent. How can I help?",
    });
  });
});

describe("handleSubscribedMessage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("ignores bot messages", async () => {
    const { thread } = createThread();
    const message = createMessage({ isBot: true });

    await handleSubscribedMessage(thread, message);

    expect(findSlackConnector).not.toHaveBeenCalled();
  });

  it("creates or resumes interaction and posts reply", async () => {
    const { thread, posts } = createThread();
    const message = createMessage({ text: "Second message" });

    vi.mocked(findSlackConnector).mockResolvedValue({
      id: "connector-123",
      organizationId: "org-123",
      enabled: true,
    } as never);
    vi.mocked(findInteractionBySourceThreadId).mockResolvedValue({
      id: "interaction-123",
      title: "Existing",
    } as never);
    vi.mocked(addInteractionMessage).mockResolvedValue({ id: "msg-123" } as never);

    await handleSubscribedMessage(thread, message);

    expect(addInteractionMessage).toHaveBeenCalledWith({
      interactionId: "interaction-123",
      senderType: "user",
      text: "Second message",
    });
    expect(posts).toEqual(["You said: Second message"]);

    // Agent reply should also be persisted
    expect(addInteractionMessage).toHaveBeenLastCalledWith({
      interactionId: "interaction-123",
      senderType: "agent",
      text: "You said: Second message",
    });
  });
});
