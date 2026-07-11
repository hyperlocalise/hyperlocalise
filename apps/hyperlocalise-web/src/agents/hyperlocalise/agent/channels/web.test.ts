import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const {
  prepareConversationAgentTurnMock,
  getWebConversationRepositorySessionMock,
  setWebConversationRepositorySessionMock,
  reserveAgentRuntimeUsageMock,
  trackSucceededAgentRuntimeUsageMock,
  addInteractionMessageMock,
} = vi.hoisted(() => ({
  prepareConversationAgentTurnMock: vi.fn(),
  getWebConversationRepositorySessionMock: vi.fn(),
  setWebConversationRepositorySessionMock: vi.fn(),
  reserveAgentRuntimeUsageMock: vi.fn(),
  trackSucceededAgentRuntimeUsageMock: vi.fn(),
  addInteractionMessageMock: vi.fn(),
}));

vi.mock("@/lib/agent-runtime/loops/conversation-turn", () => ({
  prepareConversationAgentTurn: prepareConversationAgentTurnMock,
  REPOSITORY_ACCESS_CONTENTION_FOLLOW_UP:
    "I'm still preparing repository access for this conversation. Please send your message again in a moment.",
}));

vi.mock("@/lib/agent-runtime/loops/conversation-repository-session", () => ({
  getWebConversationRepositorySession: getWebConversationRepositorySessionMock,
  setWebConversationRepositorySession: setWebConversationRepositorySessionMock,
  acquireWebRepositorySandboxLease: vi.fn(() => vi.fn()),
}));

vi.mock("@/lib/billing/agent-runtime-usage", () => ({
  reserveAgentRuntimeUsage: reserveAgentRuntimeUsageMock,
  trackSucceededAgentRuntimeUsage: trackSucceededAgentRuntimeUsageMock,
}));

vi.mock("@/lib/conversations/interactions", () => ({
  addInteractionMessage: addInteractionMessageMock,
}));

import { createWebChatAgentUIStreamResponse, runWebChatAgentTurn } from "./web";

const baseClassification = {
  needsRepositoryTools: false,
  requiresPullRequest: false,
  shouldAskForRepositoryClarification: false,
  continuesRepositoryThread: false,
  currentMessageSpecifiesRepository: false,
  confidence: 0.9,
};

const updatedSession = {
  repositorySandboxSession: {
    sandboxId: "sandbox_new",
    repositoryContextKey: "ctx_new",
    createdAt: "2026-07-01T12:00:00.000Z",
    lastUsedAt: "2026-07-01T12:00:00.000Z",
  },
};

function createToolContext() {
  return {
    conversationId: "conv_123",
    organizationId: "org_123",
    localUserId: "user_123",
    membershipRole: "admin" as const,
    projectId: null,
    db: {} as never,
  };
}

async function readSseText(response: Response) {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("missing response body");
  }

  const decoder = new TextDecoder();
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    text += decoder.decode(value, { stream: true });
  }
  return text;
}

describe("runWebChatAgentTurn", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getWebConversationRepositorySessionMock.mockReturnValue({
      session: {
        repositorySandboxSession: {
          sandboxId: "sandbox_committed",
          repositoryContextKey: "ctx_committed",
          createdAt: "2026-07-01T12:00:00.000Z",
          lastUsedAt: "2026-07-01T12:00:00.000Z",
        },
      },
      version: 1,
    });
    setWebConversationRepositorySessionMock.mockReturnValue(false);
    reserveAgentRuntimeUsageMock.mockResolvedValue(true);
    trackSucceededAgentRuntimeUsageMock.mockResolvedValue(undefined);
    addInteractionMessageMock.mockResolvedValue({ id: "msg_agent" });
    prepareConversationAgentTurnMock.mockResolvedValue({
      classification: baseClassification,
      agent: { stream: vi.fn(async () => ({ textStream: (async function* () {})() })) },
      chatMessages: [],
      clarificationFollowUp: null,
      updatedRepositorySession: updatedSession,
      staleSandboxId: "sandbox_stale",
      repositorySandboxId: "sandbox_new",
    });
  });

  it("reuses only the committed repository sandbox after repeated session write failures", async () => {
    await runWebChatAgentTurn({
      conversationId: "conv_123",
      messageText: "where is the login copy?",
      toolContext: createToolContext(),
      hasTranslationAttachments: false,
    });

    expect(prepareConversationAgentTurnMock).toHaveBeenCalledTimes(4);
    expect(prepareConversationAgentTurnMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        conversationId: "conv_123",
        reuseCommittedRepositorySandboxOnly: true,
        repositorySession: {
          repositorySandboxSession: {
            sandboxId: "sandbox_committed",
            repositoryContextKey: "ctx_committed",
            createdAt: "2026-07-01T12:00:00.000Z",
            lastUsedAt: "2026-07-01T12:00:00.000Z",
          },
        },
      }),
    );
    expect(setWebConversationRepositorySessionMock).toHaveBeenCalledTimes(3);
  });

  it("returns a clarification instead of streaming when repository access is contended", async () => {
    prepareConversationAgentTurnMock.mockImplementation(async (input) => {
      if (input.reuseCommittedRepositorySandboxOnly) {
        return {
          classification: baseClassification,
          agent: { stream: vi.fn() },
          chatMessages: [],
          clarificationFollowUp:
            "I'm still preparing repository access for this conversation. Please send your message again in a moment.",
          updatedRepositorySession: null,
          staleSandboxId: null,
          repositorySandboxId: null,
        };
      }

      return {
        classification: baseClassification,
        agent: { stream: vi.fn(async () => ({ textStream: (async function* () {})() })) },
        chatMessages: [],
        clarificationFollowUp: null,
        updatedRepositorySession: updatedSession,
        staleSandboxId: "sandbox_stale",
        repositorySandboxId: "sandbox_new",
      };
    });

    const turn = await runWebChatAgentTurn({
      conversationId: "conv_123",
      messageText: "search acme/other",
      toolContext: createToolContext(),
      hasTranslationAttachments: false,
    });

    expect(turn.clarificationFollowUp).toBe(
      "I'm still preparing repository access for this conversation. Please send your message again in a moment.",
    );
    expect(turn.textStream).toBeNull();
    expect(reserveAgentRuntimeUsageMock).not.toHaveBeenCalled();
    expect(trackSucceededAgentRuntimeUsageMock).not.toHaveBeenCalled();
  });

  it("tracks agent runtime usage after a successful response stream", async () => {
    async function* textStream() {
      yield "Done";
    }

    prepareConversationAgentTurnMock.mockResolvedValueOnce({
      classification: baseClassification,
      agent: { stream: vi.fn(async () => ({ textStream: textStream() })) },
      chatMessages: [],
      clarificationFollowUp: null,
      updatedRepositorySession: null,
      staleSandboxId: null,
      repositorySandboxId: null,
    });

    const turn = await runWebChatAgentTurn({
      conversationId: "conv_123",
      messageText: "where is the login copy?",
      toolContext: createToolContext(),
      hasTranslationAttachments: false,
      usageOperationKey: "chat-agent-turn:msg_123:agent_runs",
    });

    const chunks: string[] = [];
    for await (const chunk of turn.textStream ?? []) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual(["Done"]);
    expect(reserveAgentRuntimeUsageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org_123",
        operationKey: "chat-agent-turn:msg_123:agent_runs",
        source: "chat_agent_turn",
        interactionId: "conv_123",
      }),
    );
    expect(trackSucceededAgentRuntimeUsageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org_123",
        operationKey: "chat-agent-turn:msg_123:agent_runs",
      }),
    );
  });
});

describe("createWebChatAgentUIStreamResponse", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getWebConversationRepositorySessionMock.mockReturnValue(null);
    setWebConversationRepositorySessionMock.mockReturnValue(true);
    reserveAgentRuntimeUsageMock.mockResolvedValue(true);
    trackSucceededAgentRuntimeUsageMock.mockResolvedValue(undefined);
    addInteractionMessageMock.mockResolvedValue({ id: "msg_agent" });
  });

  it("streams a prep status event before clarification text", async () => {
    prepareConversationAgentTurnMock.mockResolvedValueOnce({
      classification: baseClassification,
      agent: { stream: vi.fn() },
      chatMessages: [],
      clarificationFollowUp: "Which repository should I search?",
      updatedRepositorySession: null,
      staleSandboxId: null,
      repositorySandboxId: null,
    });

    const response = createWebChatAgentUIStreamResponse({
      conversationId: "conv_123",
      messageText: "where is the login copy?",
      toolContext: createToolContext(),
      hasTranslationAttachments: false,
    });

    const body = await readSseText(response);
    expect(body).toContain("data-status");
    expect(body).toContain("Preparing");
    expect(body).toContain("Which repository should I search?");
    expect(addInteractionMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        interactionId: "conv_123",
        senderType: "agent",
        text: "Which repository should I search?",
        parts: [{ type: "text", text: "Which repository should I search?" }],
      }),
    );
    expect(reserveAgentRuntimeUsageMock).not.toHaveBeenCalled();
  });

  it("merges tool and text UI message chunks from the agent stream", async () => {
    const toUIMessageStream = vi.fn(() => {
      return new ReadableStream({
        start(controller) {
          controller.enqueue({ type: "start", messageId: "assistant_1" });
          controller.enqueue({
            type: "tool-input-available",
            toolCallId: "call_1",
            toolName: "grep",
            input: { pattern: "login" },
          });
          controller.enqueue({ type: "text-start", id: "text_1" });
          controller.enqueue({ type: "text-delta", id: "text_1", delta: "Found it." });
          controller.enqueue({ type: "text-end", id: "text_1" });
          controller.enqueue({ type: "finish" });
          controller.close();
        },
      });
    });

    prepareConversationAgentTurnMock.mockResolvedValueOnce({
      classification: baseClassification,
      agent: {
        stream: vi.fn(async () => ({
          textStream: (async function* () {
            yield "Found it.";
          })(),
          toUIMessageStream,
        })),
      },
      chatMessages: [],
      clarificationFollowUp: null,
      updatedRepositorySession: null,
      staleSandboxId: null,
      repositorySandboxId: null,
    });

    const response = createWebChatAgentUIStreamResponse({
      conversationId: "conv_123",
      messageText: "where is the login copy?",
      toolContext: createToolContext(),
      hasTranslationAttachments: false,
      usageOperationKey: "chat-agent-turn:msg_123:agent_runs",
    });

    const body = await readSseText(response);
    expect(body).toContain("data-status");
    expect(body).toContain("tool-input-available");
    expect(body).toContain("Found it.");
    expect(toUIMessageStream).toHaveBeenCalled();
    expect(addInteractionMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        interactionId: "conv_123",
        senderType: "agent",
        text: "Found it.",
      }),
    );
    expect(trackSucceededAgentRuntimeUsageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        operationKey: "chat-agent-turn:msg_123:agent_runs",
      }),
    );
  });
});
