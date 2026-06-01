import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { emoji } from "chat";
import type { Message, Thread } from "chat";

import type { ConversationClassification } from "@/lib/agent-runtime/loops/conversation-classifier";

import {
  extractTeamId,
  getOrCreateInteraction,
  handleNewConversation,
  handleSubscribedMessage,
  wrapThreadPost,
} from "./bot";

function createMockClassification(
  overrides: Partial<ConversationClassification> = {},
): ConversationClassification {
  return {
    intents: ["general"],
    needsRepositoryTools: false,
    requiresPullRequest: false,
    shouldAskForRepositoryClarification: false,
    continuesRepositoryThread: false,
    currentMessageSpecifiesRepository: false,
    confidence: 0.9,
    ...overrides,
  };
}

const {
  agentGenerateMock,
  classifyConversationMock,
  createConversationToolLoopAgentMock,
  loadMessagesMock,
  resolveSlackRepositoryGitHubContextMock,
} = vi.hoisted(() => ({
  agentGenerateMock: vi.fn(),
  classifyConversationMock: vi.fn(async () => createMockClassification()),
  createConversationToolLoopAgentMock: vi.fn(() => ({
    generate: agentGenerateMock,
  })),
  loadMessagesMock: vi.fn(async () => []),
  resolveSlackRepositoryGitHubContextMock: vi.fn(),
}));

const { enqueueRepositoryTaskMock } = vi.hoisted(() => ({
  enqueueRepositoryTaskMock: vi.fn(async () => ({ ids: ["run-123"] })),
}));

const { chatLoggerMock, loggerChildMock } = vi.hoisted(() => ({
  chatLoggerMock: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
  loggerChildMock: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@/workflows/adapters", () => ({
  createRepositoryAgentTaskQueue: vi.fn(() => ({ enqueue: enqueueRepositoryTaskMock })),
}));
vi.mock("@/lib/env", () => ({
  env: {
    SLACK_CLIENT_ID: "test-client-id",
    SLACK_CLIENT_SECRET: "test-client-secret",
    OPENAI_API_KEY: "test-openai-key",
  },
}));

vi.mock("@/lib/agent-runtime/loops/hyperlocalise-agent", () => {
  return vi
    .importActual<typeof import("@/lib/agent-runtime/loops/hyperlocalise-agent")>(
      "@/lib/agent-runtime/loops/hyperlocalise-agent",
    )
    .then((actual) => ({
      ...actual,
      classifyConversation: classifyConversationMock,
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
    }));
});

vi.mock("@/lib/agents/repository-context", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/agents/repository-context")>();
  return {
    ...original,
    resolveSlackRepositoryGitHubContext: resolveSlackRepositoryGitHubContextMock,
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

vi.mock("@/lib/agent-runtime/tools/registry", () => ({
  buildTools: vi.fn(() => ({})),
}));

vi.mock("@/lib/agents/image-generation", () => ({
  regenerateImageFromAttachment: vi.fn(),
}));

vi.mock("@/lib/agent-runtime/workspaces/repository-sandbox", () => ({
  createRepositorySandbox: vi.fn(async () => "sbx_test"),
  stopRepositorySandbox: vi.fn(async () => undefined),
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

const interactionHasTranslationAttachmentsMock = vi.hoisted(() => vi.fn(async () => false));

vi.mock("@/lib/conversations/interactions", () => ({
  addInteractionMessage: vi.fn(async () => ({ id: "msg-123" })),
  createInteraction: vi.fn(),
  findInteractionBySourceThreadId: vi.fn(),
  interactionHasTranslationAttachments: interactionHasTranslationAttachmentsMock,
  updateInteractionMessage: vi.fn(),
}));

const SLACK_PROCESSING_ACK_POST = {
  markdown: "On it — I'll reply here shortly.",
};

vi.mock("@/lib/agents/runtime/state", () => ({
  createChatStateAdapter: vi.fn(),
}));

vi.mock("@/lib/log", () => ({
  createChatLogger: vi.fn(() => chatLoggerMock),
  createLogger: vi.fn(() => ({
    child: vi.fn(() => loggerChildMock),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
  serializeErrorForLog: vi.fn((error: unknown) => ({ error })),
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
import { regenerateImageFromAttachment } from "@/lib/agents/image-generation";
import {
  addInteractionMessage,
  createInteraction,
  findInteractionBySourceThreadId,
  updateInteractionMessage,
} from "@/lib/conversations/interactions";

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
    interactionHasTranslationAttachmentsMock.mockResolvedValue(false);
    loggerChildMock.info.mockClear();
    resolveSlackRepositoryGitHubContextMock.mockResolvedValue({ status: "not_applicable" });
    classifyConversationMock.mockImplementation(async () => createMockClassification());
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
    expect(createConversationToolLoopAgentMock).toHaveBeenCalled();
    expect(agentGenerateMock).toHaveBeenCalled();
    expect(posts).toEqual([SLACK_PROCESSING_ACK_POST, { markdown: "AI response" }]);
  });

  it("skips GitHub context discovery for ordinary chat without attachments", async () => {
    const { thread } = createThread();
    const message = createMessage({ text: "Translate this to French" });

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

    expect(resolveSlackRepositoryGitHubContextMock).not.toHaveBeenCalled();
    expect(createConversationToolLoopAgentMock).toHaveBeenCalled();
  });

  it("exposes repository read tools when GitHub context resolves", async () => {
    const { thread, posts } = createThread();
    const message = createMessage({
      text: "Can you find context for 'Email agent'?",
      raw: { team_id: "T123", channel: "C123" },
    });

    classifyConversationMock.mockResolvedValueOnce(
      createMockClassification({
        intents: ["repository"],
        needsRepositoryTools: true,
        currentMessageSpecifiesRepository: true,
        confidence: 0.95,
      }),
    );
    resolveSlackRepositoryGitHubContextMock.mockResolvedValueOnce({
      status: "resolved",
      source: "slack_pr_url",
      context: {
        resolved: true,
        installationId: 12345,
        repositoryFullName: "acme/web",
        pullRequestNumber: 42,
      },
    });
    vi.mocked(findSlackConnector).mockResolvedValue({
      id: "connector-123",
      organizationId: "org-123",
      enabled: true,
      config: { repository: { github: { defaultRepositoryFullName: "acme/web" } } },
    } as never);
    vi.mocked(lookupMembership).mockResolvedValue({
      role: "member",
      localUserId: "user-123",
    } as never);
    vi.mocked(findInteractionBySourceThreadId).mockResolvedValue({
      id: "interaction-123",
      title: "Existing",
      projectId: "project-123",
    } as never);
    vi.mocked(addInteractionMessage).mockResolvedValue({ id: "msg-123" } as never);

    await handleNewConversation(thread, message);

    expect(resolveSlackRepositoryGitHubContextMock).toHaveBeenCalledWith({
      organizationId: "org-123",
      text: "Can you find context for 'Email agent'?",
      connectorConfig: { repository: { github: { defaultRepositoryFullName: "acme/web" } } },
      projectId: "project-123",
      channelId: "C123",
      requirePullRequest: false,
    });
    expect(enqueueRepositoryTaskMock).not.toHaveBeenCalled();
    expect(createConversationToolLoopAgentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        surface: "slack",
        toolContext: expect.objectContaining({
          sandboxId: "sbx_test",
          workMode: "read_only",
        }),
      }),
    );
    expect(agentGenerateMock).toHaveBeenCalled();
    expect(posts).toEqual([{ markdown: "AI response" }]);
  });

  it("reuses stored repository context for thread follow-ups without re-resolving", async () => {
    const { thread, posts } = createThread({
      repositoryGitHubContext: {
        resolved: true,
        installationId: 12345,
        repositoryFullName: "acme/web",
      },
    });
    const message = createMessage({
      text: "What are the words nearby?",
      raw: { team_id: "T123", channel: "C123" },
    });

    classifyConversationMock.mockResolvedValueOnce(
      createMockClassification({
        intents: ["repository"],
        needsRepositoryTools: true,
        continuesRepositoryThread: true,
        confidence: 0.95,
      }),
    );
    loadMessagesMock.mockResolvedValueOnce([
      { role: "user", content: "what's the context of Providers" },
      { role: "assistant", content: "Providers is on the landing page." },
    ] as never);
    vi.mocked(findSlackConnector).mockResolvedValue({
      id: "connector-123",
      organizationId: "org-123",
      enabled: true,
      config: {},
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

    expect(resolveSlackRepositoryGitHubContextMock).not.toHaveBeenCalled();
    const reuseLog = loggerChildMock.info.mock.calls.find(
      ([, message]) => message === "reusing stored slack thread repository context",
    );
    expect(reuseLog?.[0]).toEqual({
      installationId: 12345,
      hasPullRequestNumber: false,
    });
    expect(createConversationToolLoopAgentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        toolContext: expect.objectContaining({
          sandboxId: "sbx_test",
          githubContext: expect.objectContaining({ repositoryFullName: "acme/web" }),
        }),
      }),
    );
    expect(posts).toEqual([{ markdown: "AI response" }]);
  });

  it("resolves GitHub context using recent conversation text", async () => {
    const { thread } = createThread();
    const message = createMessage({
      text: "Find 'Email agent' in org/new-repo",
      raw: { team_id: "T123", channel: "C123" },
    });

    loadMessagesMock.mockResolvedValueOnce([
      { role: "user", content: "Find 'Email agent' in org/old-repo" },
      { role: "assistant", content: "I searched org/old-repo." },
    ] as never);
    classifyConversationMock.mockResolvedValueOnce(
      createMockClassification({
        intents: ["repository"],
        needsRepositoryTools: true,
        currentMessageSpecifiesRepository: true,
        confidence: 0.95,
      }),
    );
    resolveSlackRepositoryGitHubContextMock.mockResolvedValueOnce({
      status: "resolved",
      source: "slack_repo_reference",
      context: {
        resolved: true,
        installationId: 12345,
        repositoryFullName: "org/new-repo",
      },
    });
    vi.mocked(findSlackConnector).mockResolvedValue({
      id: "connector-123",
      organizationId: "org-123",
      enabled: true,
      config: {},
    } as never);
    vi.mocked(lookupMembership).mockResolvedValue({
      role: "member",
      localUserId: "user-123",
    } as never);
    vi.mocked(findInteractionBySourceThreadId).mockResolvedValue({
      id: "interaction-123",
      title: "Existing",
      projectId: "project-123",
    } as never);
    vi.mocked(addInteractionMessage).mockResolvedValue({ id: "msg-123" } as never);

    await handleNewConversation(thread, message);

    expect(resolveSlackRepositoryGitHubContextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining("org/new-repo"),
        requirePullRequest: false,
      }),
    );
    expect(enqueueRepositoryTaskMock).not.toHaveBeenCalled();
    expect(createConversationToolLoopAgentMock).toHaveBeenCalled();
    expect(agentGenerateMock).toHaveBeenCalledWith({
      messages: expect.arrayContaining([
        expect.objectContaining({
          role: "user",
          content: expect.stringContaining("org/old-repo"),
        }),
      ]),
    });
  });

  it("keeps fix requests out of repository context lookup", async () => {
    const { thread, posts } = createThread();
    const message = createMessage({
      text: "Please fix https://github.com/acme/web/pull/42",
      raw: { team_id: "T123", channel: "C123" },
    });

    classifyConversationMock.mockResolvedValueOnce(
      createMockClassification({
        intents: ["repository"],
        needsRepositoryTools: true,
        requiresPullRequest: true,
        currentMessageSpecifiesRepository: true,
        confidence: 0.95,
      }),
    );
    vi.mocked(findSlackConnector).mockResolvedValue({
      id: "connector-123",
      organizationId: "org-123",
      enabled: true,
      config: {},
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

    await handleNewConversation(thread, message);

    expect(resolveSlackRepositoryGitHubContextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        text: "Please fix https://github.com/acme/web/pull/42",
        requirePullRequest: true,
      }),
    );
    expect(enqueueRepositoryTaskMock).not.toHaveBeenCalled();
    expect(createConversationToolLoopAgentMock).toHaveBeenCalled();
    expect(posts).toEqual([{ markdown: "AI response" }]);
  });

  it("asks a Slack follow-up when requested repository context is unresolved", async () => {
    const { thread, posts } = createThread();
    const message = createMessage({
      text: "Can you find context for 'Email agent' in PR #42",
      raw: { team_id: "T123", channel: "C123" },
    });

    classifyConversationMock.mockResolvedValueOnce(
      createMockClassification({
        intents: ["repository"],
        needsRepositoryTools: true,
        shouldAskForRepositoryClarification: true,
        confidence: 0.95,
      }),
    );
    resolveSlackRepositoryGitHubContextMock.mockResolvedValueOnce({
      status: "unresolved",
      context: {
        resolved: false,
        reason: "No GitHub repository context was configured for this Slack request.",
      },
      followUp: "Please send a GitHub pull request URL.",
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

    await handleNewConversation(thread, message);

    expect(createConversationToolLoopAgentMock).not.toHaveBeenCalled();
    expect(posts).toEqual([{ markdown: "Please send a GitHub pull request URL." }]);
  });

  it("asks for repo context when a string context lookup is ambiguous", async () => {
    const { thread, posts } = createThread();
    const message = createMessage({
      text: 'What is the context of "Email agent"?',
      raw: { team_id: "T123", channel: "C123" },
    });

    classifyConversationMock.mockResolvedValueOnce(
      createMockClassification({
        intents: ["repository"],
        needsRepositoryTools: true,
        shouldAskForRepositoryClarification: true,
        confidence: 0.95,
      }),
    );
    resolveSlackRepositoryGitHubContextMock.mockResolvedValueOnce({
      status: "unresolved",
      context: {
        resolved: false,
        reason: "No GitHub repository context was configured for this Slack request.",
      },
      followUp: "Please include owner/repository or a pull request URL.",
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

    await handleNewConversation(thread, message);

    expect(createConversationToolLoopAgentMock).not.toHaveBeenCalled();
    expect(posts).toEqual([{ markdown: "Please include owner/repository or a pull request URL." }]);
  });

  it("resumes existing interaction and posts AI response", async () => {
    const { thread, posts, getSubscribed } = createThread();
    const message = createMessage({
      text: "Translate to French",
      attachments: [
        {
          type: "file",
          name: "copy.json",
          mimeType: "application/json",
          fetchData: vi.fn(async () => Buffer.from("{}")),
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
      projectId: "proj-456",
    } as never);
    vi.mocked(addInteractionMessage).mockResolvedValue({ id: "msg-123" } as never);

    await handleNewConversation(thread, message);

    expect(createInteraction).not.toHaveBeenCalled();
    expect(addInteractionMessage).toHaveBeenCalledWith({
      interactionId: "interaction-123",
      senderType: "user",
      text: "Translate to French",
      senderEmail: "alice@example.com",
    });
    expect(getSubscribed()).toBe(false);
    expect(createConversationToolLoopAgentMock).toHaveBeenCalled();
    expect(agentGenerateMock).toHaveBeenCalled();
    expect(posts).toEqual([SLACK_PROCESSING_ACK_POST, { markdown: "AI response" }]);
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
      {
        markdown:
          "I couldn't verify your account in this Hyperlocalise workspace. Please make sure your Slack email matches your Hyperlocalise account email.",
      },
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
    interactionHasTranslationAttachmentsMock.mockResolvedValue(false);
    resolveSlackRepositoryGitHubContextMock.mockResolvedValue({ status: "not_applicable" });
    classifyConversationMock.mockImplementation(async () => createMockClassification());
  });

  it("ignores bot messages", async () => {
    const { thread } = createThread();
    const message = createMessage({ isBot: true });

    await handleSubscribedMessage(thread, message);

    expect(findSlackConnector).not.toHaveBeenCalled();
  });

  it("creates or resumes interaction and posts AI response", async () => {
    const { thread, posts } = createThread();
    const message = createMessage({
      text: "Translate to German",
      attachments: [
        {
          type: "file",
          name: "copy.json",
          mimeType: "application/json",
          fetchData: vi.fn(async () => Buffer.from("{}")),
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

    await handleSubscribedMessage(thread, message);

    expect(addInteractionMessage).toHaveBeenCalledWith({
      interactionId: "interaction-123",
      senderType: "user",
      text: expect.stringContaining("Translate to German"),
      senderEmail: "alice@example.com",
    });
    expect(createConversationToolLoopAgentMock).toHaveBeenCalled();
    expect(agentGenerateMock).toHaveBeenCalled();
    expect(posts).toEqual([SLACK_PROCESSING_ACK_POST, { markdown: "AI response" }]);

    // Agent reply should also be persisted
    expect(addInteractionMessage).toHaveBeenLastCalledWith({
      interactionId: "interaction-123",
      senderType: "agent",
      text: "AI response",
    });
  });

  it("treats prior thread file uploads as attachments on follow-up messages", async () => {
    const { thread, posts } = createThread();
    const message = createMessage({ text: "Translate to French" });

    interactionHasTranslationAttachmentsMock.mockResolvedValue(true);
    loadMessagesMock.mockResolvedValueOnce([
      {
        role: "user",
        content:
          "Please translate the attached source file.\n\nAttached translation source files are already stored and ready for file translation jobs:\n- en-US.json: sourceFileId=file_123, fileFormat=json, contentType=application/json",
      },
      { role: "assistant", content: "Which locales should I use?" },
    ] as never);
    classifyConversationMock.mockResolvedValueOnce(
      createMockClassification({
        intents: ["translation"],
        confidence: 0.95,
      }),
    );

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
      projectId: "project-123",
    } as never);
    vi.mocked(addInteractionMessage).mockResolvedValue({ id: "msg-456" } as never);

    await handleSubscribedMessage(thread, message);

    expect(interactionHasTranslationAttachmentsMock).toHaveBeenCalledWith("interaction-123");
    expect(classifyConversationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        hasFileAttachments: true,
      }),
    );
    expect(createConversationToolLoopAgentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        hasFileAttachments: true,
      }),
    );
    expect(posts[0]).toEqual(SLACK_PROCESSING_ACK_POST);
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
    interactionHasTranslationAttachmentsMock.mockResolvedValueOnce(true);
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
    expect(interactionHasTranslationAttachmentsMock).toHaveBeenCalledWith("interaction-123");
    expect(vi.mocked(updateInteractionMessage).mock.invocationCallOrder[0]).toBeLessThan(
      interactionHasTranslationAttachmentsMock.mock.invocationCallOrder[0] ?? 0,
    );
    expect(classifyConversationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        hasFileAttachments: true,
      }),
    );
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
    expect(posts).toEqual([SLACK_PROCESSING_ACK_POST, { markdown: "AI response" }]);
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
      SLACK_PROCESSING_ACK_POST,
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
    expect(posts).toEqual([
      { markdown: expect.stringContaining("not a supported text translation source") },
    ]);
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
      { markdown: expect.stringContaining("brief.pdf") },
      SLACK_PROCESSING_ACK_POST,
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
      SLACK_PROCESSING_ACK_POST,
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
    expect(posts).toEqual([
      SLACK_PROCESSING_ACK_POST,
      expect.stringContaining("I need the target language"),
    ]);
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
        SLACK_PROCESSING_ACK_POST,
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
      {
        markdown:
          "I couldn't verify your account in this Hyperlocalise workspace. Please make sure your Slack email matches your Hyperlocalise account email.",
      },
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
