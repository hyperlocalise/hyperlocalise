import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const {
  classifyConversationMock,
  createConversationToolLoopAgentMock,
  loadInteractionModelMessagesMock,
  resolveConversationRepositoryGitHubContextMock,
  createRepositorySandboxMock,
  resolveOrganizationHasTmsIntegrationMock,
} = vi.hoisted(() => ({
  classifyConversationMock: vi.fn(),
  createConversationToolLoopAgentMock: vi.fn(() => ({ stream: vi.fn() })),
  loadInteractionModelMessagesMock: vi.fn(),
  resolveConversationRepositoryGitHubContextMock: vi.fn(),
  createRepositorySandboxMock: vi.fn(),
  resolveOrganizationHasTmsIntegrationMock: vi.fn(),
}));

vi.mock("@/lib/env", () => ({
  env: {
    OPENAI_API_KEY: "test-openai-key",
  },
}));

vi.mock("./hyperlocalise-agent", () => ({
  classifyConversation: classifyConversationMock,
  createConversationToolLoopAgent: createConversationToolLoopAgentMock,
  loadInteractionModelMessages: loadInteractionModelMessagesMock,
  getRecentUserConversationText: vi.fn((_messages: unknown[], latestText: string) => latestText),
  replaceLastUserMessage: vi.fn(
    (messages: Array<{ role: string; content: string }>, text: string) => [
      ...messages.slice(0, -1),
      { role: "user", content: text },
    ],
  ),
  shouldAttemptRepositoryContextResolution: vi.fn(
    ({ classification }: { classification: { needsRepositoryTools: boolean } }) =>
      classification.needsRepositoryTools,
  ),
  shouldRequireRepositoryContextClarification: vi.fn(
    (classification: { shouldAskForRepositoryClarification: boolean }) =>
      classification.shouldAskForRepositoryClarification,
  ),
}));

vi.mock("@/lib/agents/repository-context", () => ({
  buildRepositoryGitHubContextInstructions: vi.fn(() => "resolved-context"),
  getOrganizationRepositoryConnectorConfig: vi.fn(async () => null),
  resolveConversationRepositoryGitHubContext: resolveConversationRepositoryGitHubContextMock,
}));

vi.mock("@/lib/agent-runtime/workspaces/repository-sandbox", () => ({
  createRepositorySandbox: createRepositorySandboxMock,
  stopRepositorySandbox: vi.fn(),
}));

vi.mock("../skills/conversation-tms-integration", () => ({
  resolveOrganizationHasTmsIntegration: resolveOrganizationHasTmsIntegrationMock,
}));

vi.mock("@/lib/log", () => ({
  createLogger: vi.fn(() => ({
    child: vi.fn(() => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    })),
  })),
  serializeErrorForLog: vi.fn((error: unknown) => ({ error })),
}));

import {
  prepareConversationAgentTurn,
  resolveConversationRepositoryContext,
} from "./conversation-turn";

const baseClassification = {
  needsRepositoryTools: false,
  requiresPullRequest: false,
  shouldAskForRepositoryClarification: false,
  continuesRepositoryThread: false,
  currentMessageSpecifiesRepository: false,
  confidence: 0.9,
};

describe("conversation turn preparation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    classifyConversationMock.mockResolvedValue(baseClassification);
    loadInteractionModelMessagesMock.mockResolvedValue([
      { role: "user", content: "what's the progress of HL test project?" },
    ]);
    resolveOrganizationHasTmsIntegrationMock.mockResolvedValue(true);
    resolveConversationRepositoryGitHubContextMock.mockResolvedValue({
      status: "not_applicable",
    });
  });

  it("runs the shared agent for web chat without requiring attachments", async () => {
    const result = await prepareConversationAgentTurn({
      surface: "web",
      conversationId: "conv_123",
      organizationId: "org_123",
      localUserId: "user_123",
      membershipRole: "admin",
      projectId: null,
      messageText: "what's the progress of HL test project?",
      hasTranslationAttachments: false,
      db: {} as never,
    });

    expect(result.clarificationFollowUp).toBeNull();
    expect(createConversationToolLoopAgentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        surface: "web",
        hasFileAttachments: false,
        hasTmsIntegration: true,
      }),
    );
  });

  it("returns clarification follow-up when repository context is required but unresolved", async () => {
    resolveConversationRepositoryGitHubContextMock.mockResolvedValue({
      status: "unresolved",
      context: {
        resolved: false,
        reason: "missing repository",
        hint: "send a repo",
      },
      followUp: "Which GitHub repository should I search?",
    });

    const result = await resolveConversationRepositoryContext({
      surface: "web",
      organizationId: "org_123",
      projectId: null,
      conversationText: "where is the login copy?",
      classification: {
        ...baseClassification,
        needsRepositoryTools: true,
        shouldAskForRepositoryClarification: true,
      },
      repositorySession: null,
    });

    expect(result.clarificationFollowUp).toBe("Which GitHub repository should I search?");
  });

  it("creates a sandbox when repository context resolves", async () => {
    const githubContext = {
      resolved: true as const,
      installationId: 42,
      repositoryFullName: "acme/web",
    };
    classifyConversationMock.mockResolvedValue({
      ...baseClassification,
      needsRepositoryTools: true,
    });
    resolveConversationRepositoryGitHubContextMock.mockResolvedValue({
      status: "resolved",
      source: "single_installed_repository",
      context: githubContext,
    });
    createRepositorySandboxMock.mockResolvedValue("sandbox_123");

    const result = await prepareConversationAgentTurn({
      surface: "web",
      conversationId: "conv_123",
      organizationId: "org_123",
      localUserId: "user_123",
      membershipRole: "admin",
      projectId: null,
      messageText: "where is the login copy?",
      hasTranslationAttachments: false,
      db: {} as never,
    });

    expect(createRepositorySandboxMock).toHaveBeenCalledWith(githubContext);
    expect(createConversationToolLoopAgentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        toolContext: expect.objectContaining({
          sandboxId: "sandbox_123",
          repositorySource: "chat_ui",
        }),
      }),
    );
    expect(result.updatedRepositorySession?.repositorySandboxSession?.sandboxId).toBe(
      "sandbox_123",
    );
  });
});
