/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const {
  prepareConversationAgentTurnMock,
  getWebConversationRepositorySessionMock,
  setWebConversationRepositorySessionMock,
  reserveAgentRuntimeUsageMock,
  trackSucceededAgentRuntimeUsageMock,
  addInteractionMessageMock,
  saveConversationRunSnapshotMock,
  finishConversationRunMock,
  saveInteractionMessageToolOutputsMock,
} = vi.hoisted(() => ({
  prepareConversationAgentTurnMock: vi.fn(),
  getWebConversationRepositorySessionMock: vi.fn(),
  setWebConversationRepositorySessionMock: vi.fn(),
  reserveAgentRuntimeUsageMock: vi.fn(),
  trackSucceededAgentRuntimeUsageMock: vi.fn(),
  addInteractionMessageMock: vi.fn(),
  saveConversationRunSnapshotMock: vi.fn(),
  finishConversationRunMock: vi.fn(),
  saveInteractionMessageToolOutputsMock: vi.fn(),
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
  addAiTokenUsage: (
    first: Record<string, number> | null | undefined,
    second: Record<string, number> | null | undefined,
  ) => {
    if (!first) return second ?? null;
    if (!second) return first;
    return {
      inputTokens: first.inputTokens + second.inputTokens,
      outputTokens: first.outputTokens + second.outputTokens,
      totalTokens: first.totalTokens + second.totalTokens,
    };
  },
  extractAiSdkTokenUsage: (usage: unknown) => usage,
  reserveAgentRuntimeUsage: reserveAgentRuntimeUsageMock,
  trackSucceededAgentRuntimeUsage: trackSucceededAgentRuntimeUsageMock,
}));

vi.mock("@/lib/conversations/conversation-runs", () => ({
  saveConversationRunSnapshot: saveConversationRunSnapshotMock,
  finishConversationRun: finishConversationRunMock,
  saveInteractionMessageToolOutputs: saveInteractionMessageToolOutputsMock,
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
    getWebConversationRepositorySessionMock.mockResolvedValue({
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
    setWebConversationRepositorySessionMock.mockResolvedValue(false);
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

  it.each([
    { capability: true, expected: true },
    { capability: false, expected: false },
    { capability: undefined, expected: false },
  ])(
    "passes a $expected Knowledge Memory capability into turn preparation",
    async ({ capability, expected }) => {
      setWebConversationRepositorySessionMock.mockResolvedValue(true);

      await runWebChatAgentTurn({
        conversationId: "conv_123",
        messageText: "What is in Memory.md?",
        toolContext: {
          ...createToolContext(),
          knowledgeMemoryEnabled: capability,
        },
        hasTranslationAttachments: false,
      });

      expect(prepareConversationAgentTurnMock).toHaveBeenCalledWith(
        expect.objectContaining({ knowledgeMemoryEnabled: expected }),
      );
    },
  );

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
    expect(setWebConversationRepositorySessionMock).toHaveBeenCalledWith(
      "conv_123",
      expect.objectContaining({
        organizationId: "org_123",
      }),
    );
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
    getWebConversationRepositorySessionMock.mockResolvedValue(null);
    setWebConversationRepositorySessionMock.mockResolvedValue(true);
    reserveAgentRuntimeUsageMock.mockResolvedValue(true);
    trackSucceededAgentRuntimeUsageMock.mockResolvedValue(undefined);
    addInteractionMessageMock.mockResolvedValue({ id: "msg_agent" });
    saveConversationRunSnapshotMock.mockResolvedValue({ cancelRequested: false });
    finishConversationRunMock.mockResolvedValue(undefined);
    saveInteractionMessageToolOutputsMock.mockResolvedValue(undefined);
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
      runId: "run_123",
      messageText: "where is the login copy?",
      toolContext: { ...createToolContext(), knowledgeMemoryEnabled: true },
      hasTranslationAttachments: false,
    });

    const body = await readSseText(response);
    expect(prepareConversationAgentTurnMock).toHaveBeenCalledWith(
      expect.objectContaining({ knowledgeMemoryEnabled: true }),
    );
    expect(body).toContain("data-status");
    expect(body).toContain("Setting up workspace");
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

  it("streams request-scoped tool progress from turn preparation", async () => {
    prepareConversationAgentTurnMock.mockImplementationOnce(async (input) => {
      input.reportToolProgress({
        toolCallId: "call_1",
        message: "Loading story…",
      });
      return {
        classification: baseClassification,
        agent: { stream: vi.fn() },
        chatMessages: [],
        clarificationFollowUp: "Done.",
        updatedRepositorySession: null,
        staleSandboxId: null,
        repositorySandboxId: null,
      };
    });

    const response = createWebChatAgentUIStreamResponse({
      conversationId: "conv_123",
      runId: "run_123",
      messageText: "capture the story",
      toolContext: createToolContext(),
      hasTranslationAttachments: false,
    });

    const body = await readSseText(response);
    expect(body).toContain("data-toolProgress");
    expect(body).toContain("call_1");
    expect(body).toContain("Loading story");
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
          controller.enqueue({ type: "reasoning-start", id: "reasoning_1" });
          controller.enqueue({
            type: "reasoning-delta",
            id: "reasoning_1",
            delta: "I should inspect the relevant files.",
          });
          controller.enqueue({ type: "reasoning-end", id: "reasoning_1" });
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
      runId: "run_123",
      messageText: "where is the login copy?",
      toolContext: createToolContext(),
      hasTranslationAttachments: false,
      usageOperationKey: "chat-agent-turn:msg_123:agent_runs",
    });

    const body = await readSseText(response);
    expect(body).toContain("data-status");
    expect(body).toContain("tool-input-available");
    expect(body).toContain("reasoning-delta");
    expect(body).toContain("I should inspect the relevant files.");
    expect(body).toContain("Found it.");
    expect(toUIMessageStream).toHaveBeenCalledWith({
      sendReasoning: true,
      sendStart: true,
    });
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

  it("tracks classifier and multi-step agent token usage after the stream completes", async () => {
    const toUIMessageStream = vi.fn(
      () =>
        new ReadableStream({
          start(controller) {
            controller.enqueue({ type: "start", messageId: "assistant_1" });
            controller.enqueue({ type: "text-start", id: "text_1" });
            controller.enqueue({ type: "text-delta", id: "text_1", delta: "Done." });
            controller.enqueue({ type: "text-end", id: "text_1" });
            controller.enqueue({ type: "finish" });
            controller.close();
          },
        }),
    );
    prepareConversationAgentTurnMock.mockResolvedValueOnce({
      classification: baseClassification,
      classificationTokenUsage: {
        inputTokens: 10,
        outputTokens: 2,
        totalTokens: 12,
      },
      languageModel: {
        model: "openai/gpt-6-luna",
        source: "gateway",
        modelId: "openai/gpt-6-luna",
      },
      agent: {
        stream: vi.fn(async () => ({
          usage: Promise.resolve({
            inputTokens: 40,
            outputTokens: 8,
            totalTokens: 48,
          }),
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
      runId: "run_123",
      messageText: "Help me",
      toolContext: createToolContext(),
      hasTranslationAttachments: false,
      usageOperationKey: "chat-agent-turn:msg_123:agent_runs",
      languageModel: {
        model: "openai/gpt-6-luna",
        source: "gateway",
        modelId: "openai/gpt-6-luna",
      },
    });

    await readSseText(response);

    expect(trackSucceededAgentRuntimeUsageMock).toHaveBeenCalledWith({
      organizationId: "org_123",
      operationKey: "chat-agent-turn:msg_123:agent_runs",
      dimensions: {
        surface: "web",
        agent_surface: "chat",
        repository_tools: false,
      },
      tokenUsage: {
        inputTokens: 50,
        outputTokens: 10,
        totalTokens: 60,
      },
      aiCreditModelId: "openai/gpt-6-luna",
      aiCreditCredentialSource: "gateway",
      interactionId: "conv_123",
    });
  });

  it("tracks token usage even when assistant persistence fails", async () => {
    const toUIMessageStream = vi.fn(
      () =>
        new ReadableStream({
          start(controller) {
            controller.enqueue({ type: "start", messageId: "assistant_1" });
            controller.enqueue({ type: "text-start", id: "text_1" });
            controller.enqueue({ type: "text-delta", id: "text_1", delta: "Done." });
            controller.enqueue({ type: "text-end", id: "text_1" });
            controller.enqueue({ type: "finish" });
            controller.close();
          },
        }),
    );
    prepareConversationAgentTurnMock.mockResolvedValueOnce({
      classification: baseClassification,
      classificationTokenUsage: {
        inputTokens: 10,
        outputTokens: 2,
        totalTokens: 12,
      },
      agent: {
        stream: vi.fn(async () => ({
          usage: Promise.resolve({
            inputTokens: 40,
            outputTokens: 8,
            totalTokens: 48,
          }),
          toUIMessageStream,
        })),
      },
      chatMessages: [],
      clarificationFollowUp: null,
      updatedRepositorySession: null,
      staleSandboxId: null,
      repositorySandboxId: null,
    });
    addInteractionMessageMock.mockRejectedValueOnce(new Error("database unavailable"));

    const response = createWebChatAgentUIStreamResponse({
      conversationId: "conv_123",
      runId: "run_123",
      messageText: "Help me",
      toolContext: createToolContext(),
      hasTranslationAttachments: false,
      usageOperationKey: "chat-agent-turn:msg_persist_fail:agent_runs",
      languageModel: {
        model: "openai/gpt-6-luna",
        source: "gateway",
        modelId: "openai/gpt-6-luna",
      },
    });

    await readSseText(response);

    expect(trackSucceededAgentRuntimeUsageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        operationKey: "chat-agent-turn:msg_persist_fail:agent_runs",
        tokenUsage: {
          inputTokens: 50,
          outputTokens: 10,
          totalTokens: 60,
        },
        aiCreditModelId: "openai/gpt-6-luna",
        aiCreditCredentialSource: "gateway",
      }),
    );
  });

  it.each([
    {
      name: "rejects",
      createUsage: () => Promise.reject(new Error("usage unavailable")),
    },
    {
      name: "resolves empty",
      createUsage: () =>
        Promise.resolve({
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
        }),
    },
    {
      name: "resolves null",
      createUsage: () => Promise.resolve(null),
    },
  ])("tracks classification tokens when streamed agent usage $name", async ({ createUsage }) => {
    const toUIMessageStream = vi.fn(
      () =>
        new ReadableStream({
          start(controller) {
            controller.enqueue({ type: "start", messageId: "assistant_1" });
            controller.enqueue({ type: "text-start", id: "text_1" });
            controller.enqueue({ type: "text-delta", id: "text_1", delta: "Done." });
            controller.enqueue({ type: "text-end", id: "text_1" });
            controller.enqueue({ type: "finish" });
            controller.close();
          },
        }),
    );
    prepareConversationAgentTurnMock.mockResolvedValueOnce({
      classification: baseClassification,
      classificationTokenUsage: {
        inputTokens: 10,
        outputTokens: 2,
        totalTokens: 12,
      },
      agent: {
        stream: vi.fn(async () => ({
          usage: createUsage(),
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
      runId: "run_123",
      messageText: "Help me",
      toolContext: createToolContext(),
      hasTranslationAttachments: false,
      usageOperationKey: "chat-agent-turn:msg_missing_agent_usage:agent_runs",
      languageModel: {
        model: "openai/gpt-6-luna",
        source: "gateway",
        modelId: "openai/gpt-6-luna",
      },
    });

    await readSseText(response);

    expect(trackSucceededAgentRuntimeUsageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        operationKey: "chat-agent-turn:msg_missing_agent_usage:agent_runs",
        tokenUsage: {
          inputTokens: 10,
          outputTokens: 2,
          totalTokens: 12,
        },
        aiCreditModelId: "openai/gpt-6-luna",
        aiCreditCredentialSource: "gateway",
      }),
    );
  });

  it("tracks the agent_runs meter without tokens when a completed chat reports no usage", async () => {
    const toUIMessageStream = vi.fn(
      () =>
        new ReadableStream({
          start(controller) {
            controller.enqueue({ type: "start", messageId: "assistant_1" });
            controller.enqueue({ type: "text-start", id: "text_1" });
            controller.enqueue({ type: "text-delta", id: "text_1", delta: "Done." });
            controller.enqueue({ type: "text-end", id: "text_1" });
            controller.enqueue({ type: "finish" });
            controller.close();
          },
        }),
    );
    prepareConversationAgentTurnMock.mockResolvedValueOnce({
      classification: baseClassification,
      classificationTokenUsage: null,
      agent: {
        stream: vi.fn(async () => ({
          usage: Promise.resolve(null),
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
      runId: "run_123",
      messageText: "Help me",
      toolContext: createToolContext(),
      hasTranslationAttachments: false,
      usageOperationKey: "chat-agent-turn:msg_no_usage:agent_runs",
      languageModel: {
        model: "openai/gpt-6-luna",
        source: "gateway",
        modelId: "openai/gpt-6-luna",
      },
    });

    await readSseText(response);

    expect(trackSucceededAgentRuntimeUsageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        operationKey: "chat-agent-turn:msg_no_usage:agent_runs",
        tokenUsage: null,
        aiCreditModelId: undefined,
        aiCreditCredentialSource: undefined,
      }),
    );
  });

  function preparedTurnWithStream(toUIMessageStream: (signal?: AbortSignal) => ReadableStream) {
    const stream = vi.fn(async ({ abortSignal }: { abortSignal?: AbortSignal }) => ({
      usage: Promise.resolve(null),
      toUIMessageStream: () => toUIMessageStream(abortSignal),
    }));
    prepareConversationAgentTurnMock.mockResolvedValueOnce({
      classification: baseClassification,
      agent: { stream },
      chatMessages: [],
      clarificationFollowUp: null,
      updatedRepositorySession: null,
      staleSandboxId: null,
      repositorySandboxId: null,
    });
    return stream;
  }

  async function waitFor(assertion: () => void, timeoutMs = 3_000) {
    const startedAt = Date.now();
    while (true) {
      try {
        assertion();
        return;
      } catch (error) {
        if (Date.now() - startedAt > timeoutMs) {
          throw error;
        }
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    }
  }

  it("finishes and saves the turn after the client disconnects", async () => {
    let releaseText: () => void = () => {};
    const textReady = new Promise<void>((resolve) => {
      releaseText = resolve;
    });
    const stream = preparedTurnWithStream(
      () =>
        new ReadableStream({
          async start(controller) {
            controller.enqueue({ type: "start", messageId: "assistant_1" });
            await textReady;
            controller.enqueue({ type: "text-start", id: "text_1" });
            controller.enqueue({ type: "text-delta", id: "text_1", delta: "Still here." });
            controller.enqueue({ type: "text-end", id: "text_1" });
            controller.enqueue({ type: "finish" });
            controller.close();
          },
        }),
    );
    const deferred: Array<() => Promise<unknown>> = [];

    const response = createWebChatAgentUIStreamResponse({
      conversationId: "conv_123",
      runId: "run_123",
      messageText: "Help me",
      toolContext: createToolContext(),
      hasTranslationAttachments: false,
      deferAfterResponse: (task) => deferred.push(task),
    });

    await response.body?.cancel();
    releaseText();
    expect(deferred).toHaveLength(1);
    await deferred[0]?.();

    expect(stream.mock.calls[0]?.[0].abortSignal?.aborted).toBe(false);
    expect(addInteractionMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({ senderType: "agent", text: "Still here." }),
    );
    expect(finishConversationRunMock).toHaveBeenCalledWith({
      runId: "run_123",
      status: "completed",
      agentMessageId: "msg_agent",
    });
  });

  it("stops the turn on a cancel request and keeps what it produced", async () => {
    saveConversationRunSnapshotMock.mockResolvedValue({ cancelRequested: true });
    preparedTurnWithStream(
      (signal) =>
        new ReadableStream({
          start(controller) {
            controller.enqueue({ type: "start", messageId: "assistant_1" });
            controller.enqueue({ type: "text-start", id: "text_1" });
            controller.enqueue({ type: "text-delta", id: "text_1", delta: "Partial answer" });
            signal?.addEventListener("abort", () => {
              controller.enqueue({ type: "abort" });
              controller.close();
            });
          },
        }),
    );

    const response = createWebChatAgentUIStreamResponse({
      conversationId: "conv_123",
      runId: "run_123",
      messageText: "Help me",
      toolContext: createToolContext(),
      hasTranslationAttachments: false,
    });
    await readSseText(response);

    await waitFor(() =>
      expect(finishConversationRunMock).toHaveBeenCalledWith({
        runId: "run_123",
        status: "interrupted",
        agentMessageId: "msg_agent",
      }),
    );
    expect(addInteractionMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        text: "Partial answer",
        parts: expect.arrayContaining([
          { type: "data-interrupted", data: { reason: "user_cancelled" } },
        ]),
      }),
    );
    expect(trackSucceededAgentRuntimeUsageMock).not.toHaveBeenCalled();
  });

  it("sends a shortened tool result and stores the full one", async () => {
    const longOutput = { content: "x".repeat(5_000) };
    preparedTurnWithStream(
      () =>
        new ReadableStream({
          start(controller) {
            controller.enqueue({ type: "start", messageId: "assistant_1" });
            controller.enqueue({
              type: "tool-input-available",
              toolCallId: "call_1",
              toolName: "readFile",
              input: { path: "a.txt" },
            });
            controller.enqueue({
              type: "tool-output-available",
              toolCallId: "call_1",
              output: longOutput,
            });
            controller.enqueue({ type: "finish" });
            controller.close();
          },
        }),
    );

    const response = createWebChatAgentUIStreamResponse({
      conversationId: "conv_123",
      runId: "run_123",
      messageText: "Read it",
      toolContext: createToolContext(),
      hasTranslationAttachments: false,
    });
    const body = await readSseText(response);

    expect(body).toContain("data-toolOutputTruncated");
    expect(body).toContain("more characters");
    expect(body).not.toContain("x".repeat(3_000));
    await waitFor(() => expect(saveInteractionMessageToolOutputsMock).toHaveBeenCalled());
    const saved = saveInteractionMessageToolOutputsMock.mock.calls[0]?.[0];
    expect(saved.messageId).toBe("msg_agent");
    expect(saved.outputs.get("call_1")).toEqual(longOutput);
  });

  it("offers clarification options as a data part", async () => {
    prepareConversationAgentTurnMock.mockResolvedValueOnce({
      classification: baseClassification,
      agent: { stream: vi.fn() },
      chatMessages: [],
      clarificationFollowUp: "Which repository should I use?",
      clarificationOptions: ["acme/web", "acme/api"],
      updatedRepositorySession: null,
      staleSandboxId: null,
      repositorySandboxId: null,
    });

    const response = createWebChatAgentUIStreamResponse({
      conversationId: "conv_123",
      runId: "run_123",
      messageText: "fix the copy",
      toolContext: createToolContext(),
      hasTranslationAttachments: false,
    });
    const body = await readSseText(response);

    expect(body).toContain("data-clarification");
    expect(addInteractionMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        parts: expect.arrayContaining([
          {
            type: "data-clarification",
            data: { question: "Which repository should I use?", options: ["acme/web", "acme/api"] },
          },
        ]),
      }),
    );
    await waitFor(() =>
      expect(finishConversationRunMock).toHaveBeenCalledWith({
        runId: "run_123",
        status: "completed",
        agentMessageId: "msg_agent",
      }),
    );
  });
});
