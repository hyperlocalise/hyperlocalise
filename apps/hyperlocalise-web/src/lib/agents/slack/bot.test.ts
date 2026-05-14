import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { emoji } from "chat";
import type { Message, Thread } from "chat";

import {
  extractTeamId,
  getOrCreateInteraction,
  handleNewConversation,
  handleSubscribedMessage,
  wrapThreadPost,
} from "./bot";

const { agentGenerateMock, createConversationToolLoopAgentMock, loadMessagesMock } = vi.hoisted(
  () => ({
    agentGenerateMock: vi.fn(),
    createConversationToolLoopAgentMock: vi.fn(() => ({
      generate: agentGenerateMock,
    })),
    loadMessagesMock: vi.fn(async () => []),
  }),
);

vi.mock("@/lib/env", () => ({
  env: {
    SLACK_CLIENT_ID: "test-client-id",
    SLACK_CLIENT_SECRET: "test-client-secret",
    OPENAI_API_KEY: "test-openai-key",
  },
}));

vi.mock("@/lib/agents/hyperlocalise-agent", () => {
  return {
    createConversationToolLoopAgent: createConversationToolLoopAgentMock,
    loadInteractionModelMessages: loadMessagesMock,
    replaceLastUserMessage: (
      messages: Array<{ role: "user" | "assistant"; content: string }>,
      text: string,
    ) => {
      const nextMessages = [...messages];
      const lastUserIndex = nextMessages.findLastIndex((message) => message.role === "user");
      if (lastUserIndex >= 0) {
        nextMessages[lastUserIndex] = { role: "user", content: text };
        return nextMessages;
      }
      nextMessages.push({ role: "user", content: text });
      return nextMessages;
    },
  };
});

vi.mock("@ai-sdk/openai", () => ({
  openai: vi.fn(() => "mock-model"),
}));

vi.mock("ai", async () => {
  const actual = await vi.importActual<typeof import("ai")>("ai");

  return {
    ...actual,
    generateText: vi.fn(),
    stepCountIs: vi.fn((n: number) => n),
  };
});

vi.mock("@/lib/tools/registry", () => ({
  buildTools: vi.fn(() => ({})),
}));

vi.mock("@/lib/image-generation", () => ({
  regenerateImageFromAttachment: vi.fn(),
}));

vi.mock("@/lib/file-storage/records", () => ({
  createStoredFile: vi.fn(async (input: { filename: string; contentType: string }) => ({
    id: "file_123",
    filename: input.filename,
    contentType: input.contentType,
    downloadUrl: null,
    storageUrl: "https://files.example/file_123",
  })),
}));

vi.mock("@/lib/agents/slack/helpers", () => ({
  findSlackConnector: vi.fn(),
  lookupMembership: vi.fn(),
}));

vi.mock("@/lib/interactions", () => ({
  addInteractionMessage: vi.fn(async () => ({ id: "msg-123" })),
  createInteraction: vi.fn(),
  findInteractionBySourceThreadId: vi.fn(),
  updateInteractionMessage: vi.fn(),
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

vi.mock("@/lib/database", () => {
  return {
    db: {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            orderBy: vi.fn(() => ({
              limit: vi.fn(() => Promise.resolve([])),
            })),
          })),
        })),
      })),
    },
    schema: {
      interactionMessages: {
        senderType: "senderType",
        text: "text",
        interactionId: "interactionId",
        createdAt: "createdAt",
      },
    },
  };
});

import { generateText } from "ai";
import { findSlackConnector, lookupMembership } from "@/lib/agents/slack/helpers";
import { createStoredFile } from "@/lib/file-storage/records";
import { regenerateImageFromAttachment } from "@/lib/image-generation";
import {
  addInteractionMessage,
  createInteraction,
  findInteractionBySourceThreadId,
  updateInteractionMessage,
} from "@/lib/interactions";

function createMessage(
  input: {
    text?: string;
    isBot?: boolean;
    raw?: Record<string, unknown>;
    attachments?: Message["attachments"];
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
    attachments: input.attachments ?? [],
  } as unknown as Message;
}

function createThread(initialState?: Record<string, unknown>) {
  const posts: unknown[] = [];
  const reactions: Array<{ messageId: string; emoji: string }> = [];
  const removedReactions: Array<{ messageId: string; emoji: string }> = [];
  let subscribed = false;
  let state: Record<string, unknown> | null = initialState ?? null;

  const thread = {
    id: "slack:C123:1234567890.123456",
    post: vi.fn(async (message: unknown) => {
      posts.push(message);
      return { id: "sent_123" };
    }),
    subscribe: vi.fn(async () => {
      subscribed = true;
    }),
    adapter: {
      getUser: vi.fn(async (userId: string) => ({
        id: userId,
        email: "alice@example.com",
      })),
      addReaction: vi.fn(async (_threadId: string, messageId: string, emoji: string) => {
        reactions.push({ messageId, emoji });
      }),
      removeReaction: vi.fn(async (_threadId: string, messageId: string, emoji: string) => {
        removedReactions.push({ messageId, emoji });
      }),
    },
    get state() {
      return Promise.resolve(state);
    },
    setState: vi.fn(async (newState: Record<string, unknown>) => {
      state = { ...state, ...newState };
    }),
  } as unknown as Thread<Record<string, unknown>>;

  return {
    thread,
    posts,
    reactions,
    removedReactions,
    getSubscribed: () => subscribed,
    getState: () => state,
  };
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
    wrapThreadPost(thread, "interaction-123");

    await thread.post("Agent reply");

    expect(addInteractionMessage).toHaveBeenCalledWith({
      interactionId: "interaction-123",
      senderType: "agent",
      text: "Agent reply",
    });
  });

  it("persists markdown object posts", async () => {
    const { thread } = createThread();
    wrapThreadPost(thread, "interaction-123");

    await thread.post({ markdown: "complex" });

    expect(addInteractionMessage).toHaveBeenCalledWith({
      interactionId: "interaction-123",
      senderType: "agent",
      text: "complex",
    });
  });

  it("persists raw object posts", async () => {
    const { thread } = createThread();
    wrapThreadPost(thread, "interaction-123");

    await thread.post({ raw: "Agent reply", files: [] });

    expect(addInteractionMessage).toHaveBeenCalledWith({
      interactionId: "interaction-123",
      senderType: "agent",
      text: "Agent reply",
    });
  });

  it("does not double-wrap the same thread", async () => {
    const { thread } = createThread();
    wrapThreadPost(thread, "interaction-123");
    wrapThreadPost(thread, "interaction-123");

    await thread.post("Agent reply");

    expect(addInteractionMessage).toHaveBeenCalledTimes(1);
  });
});

describe("getOrCreateInteraction", () => {
  it("returns existing interaction when found", async () => {
    const existing = { id: "interaction-123", title: "Existing", projectId: null };
    vi.mocked(findInteractionBySourceThreadId).mockResolvedValue(existing as never);

    const result = await getOrCreateInteraction("org-123", "thread-123", "Title");

    expect(result).toEqual({ interaction: existing, isNew: false });
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
      projectId: null,
    } as never);

    const result = await getOrCreateInteraction("org-123", "thread-123", "Title");

    expect(result).toEqual({
      interaction: { id: "interaction-456", title: "Title", projectId: null },
      isNew: true,
    });
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
    agentGenerateMock.mockResolvedValue({ text: "AI response" });
    loadMessagesMock.mockResolvedValue([]);
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

  it("creates interaction, persists message, subscribes, and posts AI response", async () => {
    const { thread, posts, getSubscribed } = createThread();
    const message = createMessage({ text: "Help me translate" });

    vi.mocked(findSlackConnector).mockResolvedValue({
      id: "connector-123",
      organizationId: "org-123",
      enabled: true,
    } as never);
    vi.mocked(lookupMembership).mockResolvedValue({
      role: "member",
      localUserId: "user-123",
    } as never);
    vi.mocked(findInteractionBySourceThreadId).mockResolvedValue(null as never);
    vi.mocked(createInteraction).mockResolvedValue({
      id: "interaction-123",
      title: "Help me translate",
      projectId: null,
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
      senderEmail: "alice@example.com",
    });
    expect(getSubscribed()).toBe(true);
    expect(createConversationToolLoopAgentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        surface: "slack",
        toolContext: expect.objectContaining({
          conversationId: "interaction-123",
          organizationId: "org-123",
          membershipRole: "member",
          projectId: null,
        }),
      }),
    );
    expect(agentGenerateMock).toHaveBeenCalledWith({
      messages: [{ role: "user", content: "Help me translate" }],
    });
    expect(posts).toEqual([{ markdown: "AI response" }]);
  });

  it("resumes existing interaction and posts AI response", async () => {
    const { thread, posts, getSubscribed } = createThread();
    const message = createMessage({ text: "Follow up" });

    vi.mocked(findSlackConnector).mockResolvedValue({
      id: "connector-123",
      organizationId: "org-123",
      enabled: true,
    } as never);
    vi.mocked(lookupMembership).mockResolvedValue({
      role: "member",
      localUserId: "user-123",
    } as never);
    vi.mocked(findInteractionBySourceThreadId).mockResolvedValue({
      id: "interaction-123",
      title: "Existing",
      projectId: "proj-456",
    } as never);
    vi.mocked(addInteractionMessage).mockResolvedValue({ id: "msg-123" } as never);

    await handleNewConversation(thread, message);

    expect(createInteraction).not.toHaveBeenCalled();
    expect(addInteractionMessage).toHaveBeenCalledWith({
      interactionId: "interaction-123",
      senderType: "user",
      text: "Follow up",
      senderEmail: "alice@example.com",
    });
    expect(getSubscribed()).toBe(false);
    expect(agentGenerateMock).toHaveBeenCalled();
    expect(posts).toEqual([{ markdown: "AI response" }]);
  });

  it("adds an eyes reaction while processing a message and removes it on reply", async () => {
    const { thread, reactions, removedReactions } = createThread();
    const message = createMessage({ text: "Help me translate" });

    vi.mocked(findSlackConnector).mockResolvedValue({
      id: "connector-123",
      organizationId: "org-123",
      enabled: true,
    } as never);
    vi.mocked(lookupMembership).mockResolvedValue({
      role: "member",
      localUserId: "user-123",
    } as never);
    vi.mocked(findInteractionBySourceThreadId).mockResolvedValue({
      id: "interaction-123",
      title: "Existing",
      projectId: null,
    } as never);
    vi.mocked(addInteractionMessage).mockResolvedValue({ id: "msg-123" } as never);

    await handleNewConversation(thread, message);

    expect(reactions).toEqual([{ messageId: "msg_123", emoji: emoji.eyes }]);
    expect(removedReactions).toEqual([{ messageId: "msg_123", emoji: emoji.eyes }]);
  });

  it("warns non-member once and tracks them in thread state", async () => {
    const { thread, posts, getState, removedReactions } = createThread();
    const message = createMessage({ text: "Help me translate" });

    vi.mocked(findSlackConnector).mockResolvedValue({
      id: "connector-123",
      organizationId: "org-123",
      enabled: true,
    } as never);
    vi.mocked(lookupMembership).mockResolvedValue(null as never);
    vi.mocked(findInteractionBySourceThreadId).mockResolvedValue({
      id: "interaction-123",
      title: "Existing",
      projectId: null,
    } as never);
    vi.mocked(addInteractionMessage).mockResolvedValue({ id: "msg-123" } as never);

    await handleNewConversation(thread, message);

    expect(posts).toEqual([
      "I couldn't verify your account in this Hyperlocalise workspace. Please make sure your Slack email matches your Hyperlocalise account email.",
    ]);
    expect(getState()).toEqual({ warnedNonMemberUsers: ["U123"] });
    expect(removedReactions).toEqual([{ messageId: "msg_123", emoji: emoji.eyes }]);
  });

  it("reacts with x for repeat non-member messages", async () => {
    const { thread, posts, reactions, removedReactions } = createThread({
      warnedNonMemberUsers: ["U123"],
    });
    const message = createMessage({ text: "Help me translate" });

    vi.mocked(findSlackConnector).mockResolvedValue({
      id: "connector-123",
      organizationId: "org-123",
      enabled: true,
    } as never);
    vi.mocked(lookupMembership).mockResolvedValue(null as never);
    vi.mocked(findInteractionBySourceThreadId).mockResolvedValue({
      id: "interaction-123",
      title: "Existing",
      projectId: null,
    } as never);
    vi.mocked(addInteractionMessage).mockResolvedValue({ id: "msg-123" } as never);

    await handleNewConversation(thread, message);

    expect(posts).toEqual([]);
    expect(reactions).toEqual([
      { messageId: "msg_123", emoji: emoji.eyes },
      { messageId: "msg_123", emoji: emoji.x },
    ]);
    expect(removedReactions).toEqual([{ messageId: "msg_123", emoji: emoji.eyes }]);
  });
});

describe("handleSubscribedMessage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    agentGenerateMock.mockResolvedValue({ text: "AI response" });
    loadMessagesMock.mockResolvedValue([]);
  });

  it("ignores bot messages", async () => {
    const { thread } = createThread();
    const message = createMessage({ isBot: true });

    await handleSubscribedMessage(thread, message);

    expect(findSlackConnector).not.toHaveBeenCalled();
  });

  it("creates or resumes interaction and posts AI response", async () => {
    const { thread, posts } = createThread();
    const message = createMessage({ text: "Second message" });

    vi.mocked(findSlackConnector).mockResolvedValue({
      id: "connector-123",
      organizationId: "org-123",
      enabled: true,
    } as never);
    vi.mocked(lookupMembership).mockResolvedValue({
      role: "member",
      localUserId: "user-123",
    } as never);
    vi.mocked(findInteractionBySourceThreadId).mockResolvedValue({
      id: "interaction-123",
      title: "Existing",
      projectId: null,
    } as never);
    vi.mocked(addInteractionMessage).mockResolvedValue({ id: "msg-123" } as never);

    await handleSubscribedMessage(thread, message);

    expect(addInteractionMessage).toHaveBeenCalledWith({
      interactionId: "interaction-123",
      senderType: "user",
      text: "Second message",
      senderEmail: "alice@example.com",
    });
    expect(agentGenerateMock).toHaveBeenCalled();
    expect(posts).toEqual([{ markdown: "AI response" }]);

    // Agent reply should also be persisted
    expect(addInteractionMessage).toHaveBeenLastCalledWith({
      interactionId: "interaction-123",
      senderType: "agent",
      text: "AI response",
    });
  });

  it("stores supported Slack file attachments for file translation jobs", async () => {
    const { thread, posts } = createThread();
    const fileData = Buffer.from('{"hello":"Hello"}');
    const fetchData = vi.fn(async () => fileData);
    const message = createMessage({
      text: "Translate this to French",
      attachments: [
        {
          type: "file",
          name: "en-US.json",
          mimeType: "application/json",
          fetchData,
        },
      ],
    });

    vi.mocked(findSlackConnector).mockResolvedValue({
      id: "connector-123",
      organizationId: "org-123",
      enabled: true,
    } as never);
    vi.mocked(lookupMembership).mockResolvedValue({
      role: "admin",
      localUserId: "user-123",
    } as never);
    vi.mocked(findInteractionBySourceThreadId).mockResolvedValue({
      id: "interaction-123",
      title: "Existing",
      projectId: "project-123",
    } as never);
    vi.mocked(addInteractionMessage).mockResolvedValue({ id: "msg-123" } as never);

    await handleSubscribedMessage(thread, message);

    expect(fetchData).toHaveBeenCalledOnce();
    expect(createStoredFile).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org-123",
        projectId: "project-123",
        createdByUserId: "user-123",
        role: "source",
        sourceKind: "chat_upload",
        sourceInteractionId: "interaction-123",
        filename: "en-US.json",
        contentType: "application/json",
        content: fileData,
        metadata: expect.objectContaining({
          uploadSurface: "slack_agent",
          translationSource: true,
        }),
      }),
    );
    expect(addInteractionMessage).toHaveBeenCalledWith({
      interactionId: "interaction-123",
      senderType: "user",
      text: "Translate this to French",
      senderEmail: "alice@example.com",
    });
    expect(updateInteractionMessage).toHaveBeenCalledWith("msg-123", {
      text: expect.stringContaining("sourceFileId=file_123"),
      attachments: [
        {
          id: "file_123",
          filename: "en-US.json",
          contentType: "application/json",
          url: "https://files.example/file_123",
        },
      ],
    });
    expect(createConversationToolLoopAgentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        additionalInstructions: expect.stringContaining('Use sourceLocale "auto"'),
      }),
    );
    expect(agentGenerateMock).toHaveBeenCalledWith({
      messages: [
        expect.objectContaining({
          role: "user",
          content: expect.stringContaining("sourceFileId=file_123"),
        }),
      ],
    });
    expect(agentGenerateMock.mock.calls[0]?.[0]?.messages[0]?.content).toContain("fileFormat=json");
    expect(posts).toEqual([{ markdown: "AI response" }]);
  });

  it("localizes images and creates file translation jobs when both are attached", async () => {
    const { thread, posts } = createThread();
    const fileData = Buffer.from('{"hello":"Hello"}');
    const imageData = Buffer.from("source-image");
    const generatedImage = Buffer.from("generated-image");
    const fetchFileData = vi.fn(async () => fileData);
    const fetchImageData = vi.fn(async () => imageData);
    const message = createMessage({
      text: "Translate these to French",
      attachments: [
        {
          type: "file",
          name: "en-US.json",
          mimeType: "application/json",
          fetchData: fetchFileData,
        },
        {
          type: "image",
          name: "banner.png",
          mimeType: "image/png",
          fetchData: fetchImageData,
        },
      ],
    });

    vi.mocked(findSlackConnector).mockResolvedValue({
      id: "connector-123",
      organizationId: "org-123",
      enabled: true,
    } as never);
    vi.mocked(lookupMembership).mockResolvedValue({
      role: "admin",
      localUserId: "user-123",
    } as never);
    vi.mocked(findInteractionBySourceThreadId).mockResolvedValue({
      id: "interaction-123",
      title: "Existing",
      projectId: "project-123",
    } as never);
    vi.mocked(addInteractionMessage).mockResolvedValue({ id: "msg-123" } as never);
    vi.mocked(generateText).mockResolvedValueOnce({
      output: {
        targetLocale: "fr",
        instructions: null,
        confidence: 0.98,
        missingFields: [],
      },
    } as never);
    vi.mocked(regenerateImageFromAttachment).mockResolvedValueOnce({
      image: generatedImage,
      mimeType: "image/webp",
      prompt: "prompt",
    });

    await handleSubscribedMessage(thread, message);

    expect(fetchFileData).toHaveBeenCalledOnce();
    expect(fetchImageData).toHaveBeenCalledOnce();
    expect(createStoredFile).toHaveBeenCalledWith(
      expect.objectContaining({
        filename: "en-US.json",
        content: fileData,
      }),
    );
    expect(generateText).toHaveBeenCalledOnce();
    expect(regenerateImageFromAttachment).toHaveBeenCalledWith(
      imageData,
      "image/png",
      expect.stringContaining("Target locale: fr"),
    );
    expect(agentGenerateMock).toHaveBeenCalledWith({
      messages: [
        expect.objectContaining({
          role: "user",
          content: expect.stringContaining("sourceFileId=file_123"),
        }),
      ],
    });
    expect(posts).toEqual([
      {
        raw: expect.stringContaining("localized version of banner.png for fr"),
        files: [
          {
            data: generatedImage,
            filename: "banner-fr.webp",
            mimeType: "image/webp",
          },
        ],
      },
      { markdown: "AI response" },
    ]);
  });

  it("rejects unsupported Slack file attachments before calling the model", async () => {
    const { thread, posts } = createThread();
    const message = createMessage({
      text: "Translate this PDF to French",
      attachments: [
        {
          type: "file",
          name: "brief.pdf",
          mimeType: "application/pdf",
          fetchData: vi.fn(async () => Buffer.from("pdf")),
        },
      ],
    });

    vi.mocked(findSlackConnector).mockResolvedValue({
      id: "connector-123",
      organizationId: "org-123",
      enabled: true,
    } as never);
    vi.mocked(lookupMembership).mockResolvedValue({
      role: "admin",
      localUserId: "user-123",
    } as never);
    vi.mocked(findInteractionBySourceThreadId).mockResolvedValue({
      id: "interaction-123",
      title: "Existing",
      projectId: "project-123",
    } as never);
    vi.mocked(addInteractionMessage).mockResolvedValue({ id: "msg-123" } as never);

    await handleSubscribedMessage(thread, message);

    expect(createStoredFile).not.toHaveBeenCalled();
    expect(generateText).not.toHaveBeenCalled();
    expect(agentGenerateMock).not.toHaveBeenCalled();
    expect(posts).toEqual([expect.stringContaining("not a supported text translation source")]);
  });

  it("reports unsupported files while still localizing attached images", async () => {
    const { thread, posts } = createThread();
    const imageData = Buffer.from("source-image");
    const generatedImage = Buffer.from("generated-image");
    const message = createMessage({
      text: "Localize this image to French",
      attachments: [
        {
          type: "file",
          name: "brief.pdf",
          mimeType: "application/pdf",
          fetchData: vi.fn(async () => Buffer.from("pdf")),
        },
        {
          type: "image",
          name: "banner.png",
          mimeType: "image/png",
          fetchData: vi.fn(async () => imageData),
        },
      ],
    });

    vi.mocked(findSlackConnector).mockResolvedValue({
      id: "connector-123",
      organizationId: "org-123",
      enabled: true,
    } as never);
    vi.mocked(lookupMembership).mockResolvedValue({
      role: "member",
      localUserId: "user-123",
    } as never);
    vi.mocked(findInteractionBySourceThreadId).mockResolvedValue({
      id: "interaction-123",
      title: "Existing",
      projectId: null,
    } as never);
    vi.mocked(addInteractionMessage).mockResolvedValue({ id: "msg-123" } as never);
    vi.mocked(generateText).mockResolvedValueOnce({
      output: {
        targetLocale: "fr",
        instructions: null,
        confidence: 0.98,
        missingFields: [],
      },
    } as never);
    vi.mocked(regenerateImageFromAttachment).mockResolvedValueOnce({
      image: generatedImage,
      mimeType: "image/webp",
      prompt: "prompt",
    });

    await handleSubscribedMessage(thread, message);

    expect(createStoredFile).not.toHaveBeenCalled();
    expect(agentGenerateMock).not.toHaveBeenCalled();
    expect(posts).toEqual([
      expect.stringContaining("brief.pdf"),
      {
        raw: expect.stringContaining("localized version of banner.png for fr"),
        files: [
          {
            data: generatedImage,
            filename: "banner-fr.webp",
            mimeType: "image/webp",
          },
        ],
      },
    ]);
  });

  it("uses LLM intent extraction before localizing Slack image attachments", async () => {
    const { thread, posts } = createThread();
    const imageData = Buffer.from("source-image");
    const generatedImage = Buffer.from("generated-image");
    const message = createMessage({
      text: "Localize this campaign image to French",
      attachments: [
        {
          type: "image",
          name: "banner.png",
          mimeType: "image/png",
          fetchData: vi.fn(async () => imageData),
        },
      ],
    });

    vi.mocked(findSlackConnector).mockResolvedValue({
      id: "connector-123",
      organizationId: "org-123",
      enabled: true,
    } as never);
    vi.mocked(lookupMembership).mockResolvedValue({
      role: "member",
      localUserId: "user-123",
    } as never);
    vi.mocked(findInteractionBySourceThreadId).mockResolvedValue({
      id: "interaction-123",
      title: "Existing",
      projectId: null,
    } as never);
    vi.mocked(addInteractionMessage).mockResolvedValue({ id: "msg-123" } as never);
    vi.mocked(generateText).mockResolvedValueOnce({
      output: {
        targetLocale: "fr",
        instructions: "Use refined campaign copy.",
        confidence: 0.98,
        missingFields: [],
      },
    } as never);
    vi.mocked(regenerateImageFromAttachment).mockResolvedValue({
      image: generatedImage,
      mimeType: "image/webp",
      prompt: "prompt",
    });

    await handleSubscribedMessage(thread, message);

    expect(generateText).toHaveBeenCalledOnce();
    expect(generateText).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining(
          "Current Slack message:\nLocalize this campaign image to French",
        ),
      }),
    );
    expect(regenerateImageFromAttachment).toHaveBeenCalledWith(
      imageData,
      "image/png",
      expect.stringContaining("Target locale: fr"),
    );
    expect(regenerateImageFromAttachment).toHaveBeenCalledWith(
      imageData,
      "image/png",
      expect.stringContaining("User instructions: Use refined campaign copy."),
    );
    expect(posts).toEqual([
      {
        raw: expect.stringContaining("localized version of banner.png for fr"),
        files: [
          {
            data: generatedImage,
            filename: "banner-fr.webp",
            mimeType: "image/webp",
          },
        ],
      },
    ]);
    expect(addInteractionMessage).toHaveBeenLastCalledWith({
      interactionId: "interaction-123",
      senderType: "agent",
      text: expect.stringContaining("localized version of banner.png for fr"),
    });
  });

  it("asks for a target language before localizing Slack images", async () => {
    const { thread, posts } = createThread();
    const message = createMessage({
      text: "Localize this campaign image",
      attachments: [
        {
          type: "image",
          name: "banner.png",
          mimeType: "image/png",
          fetchData: vi.fn(async () => Buffer.from("source-image")),
        },
      ],
    });

    vi.mocked(findSlackConnector).mockResolvedValue({
      id: "connector-123",
      organizationId: "org-123",
      enabled: true,
    } as never);
    vi.mocked(lookupMembership).mockResolvedValue({
      role: "member",
      localUserId: "user-123",
    } as never);
    vi.mocked(findInteractionBySourceThreadId).mockResolvedValue({
      id: "interaction-123",
      title: "Existing",
      projectId: null,
    } as never);
    vi.mocked(addInteractionMessage).mockResolvedValue({ id: "msg-123" } as never);
    vi.mocked(generateText).mockResolvedValueOnce({
      output: {
        targetLocale: null,
        instructions: null,
        confidence: 0.92,
        missingFields: ["targetLocale"],
      },
    } as never);

    await handleSubscribedMessage(thread, message);

    expect(generateText).toHaveBeenCalledOnce();
    expect(regenerateImageFromAttachment).not.toHaveBeenCalled();
    expect(posts).toEqual([expect.stringContaining("I need the target language")]);
  });

  it("logs image localization failures while posting the fallback message", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const { thread, posts } = createThread();
    const error = new Error("image service unavailable");
    const message = createMessage({
      text: "Localize this campaign image to French",
      attachments: [
        {
          type: "image",
          name: "banner.png",
          mimeType: "image/png",
          fetchData: vi.fn(async () => Buffer.from("source-image")),
        },
      ],
    });

    vi.mocked(findSlackConnector).mockResolvedValue({
      id: "connector-123",
      organizationId: "org-123",
      enabled: true,
    } as never);
    vi.mocked(lookupMembership).mockResolvedValue({
      role: "member",
      localUserId: "user-123",
    } as never);
    vi.mocked(findInteractionBySourceThreadId).mockResolvedValue({
      id: "interaction-123",
      title: "Existing",
      projectId: null,
    } as never);
    vi.mocked(addInteractionMessage).mockResolvedValue({ id: "msg-123" } as never);
    vi.mocked(generateText).mockResolvedValueOnce({
      output: {
        targetLocale: "fr",
        instructions: null,
        confidence: 0.98,
        missingFields: [],
      },
    } as never);
    vi.mocked(regenerateImageFromAttachment).mockRejectedValueOnce(error);

    try {
      await handleSubscribedMessage(thread, message);

      expect(consoleError).toHaveBeenCalledWith("Failed to localize Slack image attachment", {
        error,
        imageName: "banner.png",
        targetLocale: "fr",
      });
      expect(posts).toEqual([
        "Sorry, I couldn't localize banner.png right now. Please try again with the image and target language.",
      ]);
    } finally {
      consoleError.mockRestore();
    }
  });

  it("adds an eyes reaction while processing a subscribed message and removes it on reply", async () => {
    const { thread, reactions, removedReactions } = createThread();
    const message = createMessage({ text: "Second message" });

    vi.mocked(findSlackConnector).mockResolvedValue({
      id: "connector-123",
      organizationId: "org-123",
      enabled: true,
    } as never);
    vi.mocked(lookupMembership).mockResolvedValue({
      role: "member",
      localUserId: "user-123",
    } as never);
    vi.mocked(findInteractionBySourceThreadId).mockResolvedValue({
      id: "interaction-123",
      title: "Existing",
      projectId: null,
    } as never);
    vi.mocked(addInteractionMessage).mockResolvedValue({ id: "msg-123" } as never);

    await handleSubscribedMessage(thread, message);

    expect(reactions).toEqual([{ messageId: "msg_123", emoji: emoji.eyes }]);
    expect(removedReactions).toEqual([{ messageId: "msg_123", emoji: emoji.eyes }]);
  });

  it("warns non-member once on subscribed messages and tracks them", async () => {
    const { thread, posts, getState, removedReactions } = createThread();
    const message = createMessage({ text: "Second message" });

    vi.mocked(findSlackConnector).mockResolvedValue({
      id: "connector-123",
      organizationId: "org-123",
      enabled: true,
    } as never);
    vi.mocked(lookupMembership).mockResolvedValue(null as never);
    vi.mocked(findInteractionBySourceThreadId).mockResolvedValue({
      id: "interaction-123",
      title: "Existing",
      projectId: null,
    } as never);
    vi.mocked(addInteractionMessage).mockResolvedValue({ id: "msg-123" } as never);

    await handleSubscribedMessage(thread, message);

    expect(posts).toEqual([
      "I couldn't verify your account in this Hyperlocalise workspace. Please make sure your Slack email matches your Hyperlocalise account email.",
    ]);
    expect(getState()).toEqual({ warnedNonMemberUsers: ["U123"] });
    expect(removedReactions).toEqual([{ messageId: "msg_123", emoji: emoji.eyes }]);
  });

  it("reacts with x for repeat non-member subscribed messages", async () => {
    const { thread, posts, reactions, removedReactions } = createThread({
      warnedNonMemberUsers: ["U123"],
    });
    const message = createMessage({ text: "Second message" });

    vi.mocked(findSlackConnector).mockResolvedValue({
      id: "connector-123",
      organizationId: "org-123",
      enabled: true,
    } as never);
    vi.mocked(lookupMembership).mockResolvedValue(null as never);
    vi.mocked(findInteractionBySourceThreadId).mockResolvedValue({
      id: "interaction-123",
      title: "Existing",
      projectId: null,
    } as never);
    vi.mocked(addInteractionMessage).mockResolvedValue({ id: "msg-123" } as never);

    await handleSubscribedMessage(thread, message);

    expect(posts).toEqual([]);
    expect(reactions).toEqual([
      { messageId: "msg_123", emoji: emoji.eyes },
      { messageId: "msg_123", emoji: emoji.x },
    ]);
    expect(removedReactions).toEqual([{ messageId: "msg_123", emoji: emoji.eyes }]);
  });
});
