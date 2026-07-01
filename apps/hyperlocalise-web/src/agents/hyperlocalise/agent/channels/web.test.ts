import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const {
  prepareConversationAgentTurnMock,
  getWebConversationRepositorySessionMock,
  setWebConversationRepositorySessionMock,
} = vi.hoisted(() => ({
  prepareConversationAgentTurnMock: vi.fn(),
  getWebConversationRepositorySessionMock: vi.fn(),
  setWebConversationRepositorySessionMock: vi.fn(),
}));

vi.mock("@/lib/agent-runtime/loops/conversation-turn", () => ({
  prepareConversationAgentTurn: prepareConversationAgentTurnMock,
}));

vi.mock("@/lib/agent-runtime/loops/conversation-repository-session", () => ({
  getWebConversationRepositorySession: getWebConversationRepositorySessionMock,
  setWebConversationRepositorySession: setWebConversationRepositorySessionMock,
}));

import { runWebChatAgentTurn } from "./web";

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
    prepareConversationAgentTurnMock.mockResolvedValue({
      classification: baseClassification,
      agent: { stream: vi.fn(async () => ({ textStream: (async function* () {})() })) },
      chatMessages: [],
      clarificationFollowUp: null,
      updatedRepositorySession: updatedSession,
      staleSandboxId: "sandbox_stale",
    });
  });

  it("reuses only the committed repository sandbox after repeated session write failures", async () => {
    await runWebChatAgentTurn({
      conversationId: "conv_123",
      messageText: "where is the login copy?",
      toolContext: {
        conversationId: "conv_123",
        organizationId: "org_123",
        localUserId: "user_123",
        membershipRole: "admin",
        projectId: null,
        db: {} as never,
      },
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
});
