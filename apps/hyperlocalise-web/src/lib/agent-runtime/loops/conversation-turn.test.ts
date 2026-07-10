import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const {
  classifyConversationMock,
  createConversationToolLoopAgentMock,
  loadInteractionModelMessagesMock,
  resolveConversationRepositoryGitHubContextMock,
  createRepositorySandboxMock,
  resolveOrganizationHasTmsIntegrationMock,
  resolveWorkspaceVisualMockFlagMock,
  getOrganizationRepositoryConnectorConfigMock,
} = vi.hoisted(() => ({
  classifyConversationMock: vi.fn(),
  createConversationToolLoopAgentMock: vi.fn(() => ({ stream: vi.fn() })),
  loadInteractionModelMessagesMock: vi.fn(),
  resolveConversationRepositoryGitHubContextMock: vi.fn(),
  createRepositorySandboxMock: vi.fn(),
  resolveOrganizationHasTmsIntegrationMock: vi.fn(),
  resolveWorkspaceVisualMockFlagMock: vi.fn(),
  getOrganizationRepositoryConnectorConfigMock: vi.fn(
    async (): Promise<Record<string, unknown> | null> => null,
  ),
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
    (
      classification: {
        needsRepositoryTools: boolean;
        shouldAskForRepositoryClarification: boolean;
      },
      input?: { repositoryContextStatus?: string },
    ) =>
      (input?.repositoryContextStatus === "unresolved" && classification.needsRepositoryTools) ||
      classification.shouldAskForRepositoryClarification,
  ),
}));

vi.mock("@/lib/agents/repository-context", () => ({
  buildRepositoryGitHubContextInstructions: vi.fn(() => "resolved-context"),
  getOrganizationRepositoryConnectorConfig: getOrganizationRepositoryConnectorConfigMock,
  resolveConversationRepositoryGitHubContext: resolveConversationRepositoryGitHubContextMock,
}));

vi.mock("@/lib/agent-runtime/workspaces/repository-sandbox", () => ({
  createRepositorySandbox: createRepositorySandboxMock,
  stopRepositorySandbox: vi.fn(),
}));

vi.mock("../skills/conversation-tms-integration", () => ({
  resolveOrganizationHasTmsIntegration: resolveOrganizationHasTmsIntegrationMock,
}));

vi.mock("@/lib/flags/workspace-flags", () => ({
  resolveWorkspaceVisualMockFlag: resolveWorkspaceVisualMockFlagMock,
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
  REPOSITORY_ACCESS_CONTENTION_FOLLOW_UP,
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
    resolveWorkspaceVisualMockFlagMock.mockResolvedValue(false);
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

  it("returns clarification follow-up when repository tools are needed even if the classifier did not ask", async () => {
    resolveConversationRepositoryGitHubContextMock.mockResolvedValue({
      status: "unresolved",
      context: {
        resolved: false,
        reason:
          "Multiple GitHub repositories are enabled and the request did not identify which one to use.",
        hint: "Reply with owner/repository",
      },
      followUp:
        "Multiple GitHub repositories are enabled for this workspace: `acme/web`, `acme/api`. Which repository should I use?",
    });

    const result = await resolveConversationRepositoryContext({
      surface: "web",
      organizationId: "org_123",
      projectId: null,
      conversationText: 'What is the context of "Email agent"?',
      classification: {
        ...baseClassification,
        needsRepositoryTools: true,
        shouldAskForRepositoryClarification: false,
      },
      repositorySession: null,
    });

    expect(result.clarificationFollowUp).toContain("Which repository should I use?");
  });

  it("does not load Slack connector config for web repository resolution", async () => {
    getOrganizationRepositoryConnectorConfigMock.mockResolvedValue({
      repository: { github: { defaultRepositoryFullName: "acme/web" } },
    });
    resolveConversationRepositoryGitHubContextMock.mockResolvedValue({
      status: "not_applicable",
    });

    await resolveConversationRepositoryContext({
      surface: "web",
      organizationId: "org_123",
      projectId: null,
      conversationText: "where is the login copy?",
      classification: {
        ...baseClassification,
        needsRepositoryTools: true,
      },
      repositorySession: null,
    });

    expect(getOrganizationRepositoryConnectorConfigMock).not.toHaveBeenCalled();
    expect(resolveConversationRepositoryGitHubContextMock).toHaveBeenCalledWith(
      expect.objectContaining({ connectorConfig: null }),
    );
  });

  it("loads Slack connector config for slack when none is provided", async () => {
    getOrganizationRepositoryConnectorConfigMock.mockResolvedValue({
      repository: { github: { defaultRepositoryFullName: "acme/web" } },
    });
    resolveConversationRepositoryGitHubContextMock.mockResolvedValue({
      status: "not_applicable",
    });

    await resolveConversationRepositoryContext({
      surface: "slack",
      organizationId: "org_123",
      projectId: null,
      conversationText: "where is the login copy?",
      classification: {
        ...baseClassification,
        needsRepositoryTools: true,
      },
      repositorySession: null,
    });

    expect(getOrganizationRepositoryConnectorConfigMock).toHaveBeenCalledWith("org_123");
    expect(resolveConversationRepositoryGitHubContextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        connectorConfig: {
          repository: { github: { defaultRepositoryFullName: "acme/web" } },
        },
      }),
    );
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

  it("passes a chat UI actor when visual-mock enables repository writes", async () => {
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
    resolveWorkspaceVisualMockFlagMock.mockResolvedValue(true);

    await prepareConversationAgentTurn({
      surface: "web",
      conversationId: "conv_123",
      organizationId: "org_123",
      localUserId: "user_123",
      membershipRole: "admin",
      projectId: null,
      messageText: "mock the checkout screen",
      hasTranslationAttachments: false,
      db: {} as never,
    });

    expect(createConversationToolLoopAgentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        toolContext: expect.objectContaining({
          sandboxId: "sandbox_123",
          repositorySource: "chat_ui",
          workMode: "write",
          actor: {
            sourceUserId: "user_123",
            userId: "user_123",
            role: "admin",
          },
        }),
      }),
    );
  });

  it("keeps the latest lookup target as the active agent-facing message", async () => {
    const githubContext = {
      resolved: true as const,
      installationId: 42,
      repositoryFullName: "acme/web",
    };
    loadInteractionModelMessagesMock.mockResolvedValue([
      { role: "user", content: 'What is the context of "Knowledge"?' },
      { role: "assistant", content: "Knowledge is a sidebar item." },
      { role: "user", content: 'What is the context of "Dashboard"?' },
    ]);
    classifyConversationMock.mockResolvedValue({
      ...baseClassification,
      needsRepositoryTools: true,
      continuesRepositoryThread: true,
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
      messageText: 'What is the context of "Dashboard"?',
      hasTranslationAttachments: false,
      db: {} as never,
    });

    expect(result.chatMessages.at(-1)).toEqual({
      role: "user",
      content: 'What is the context of "Dashboard"?',
    });
    expect(result.chatMessages.at(-1)?.content).not.toContain("Knowledge");
  });

  it("skips creating a sandbox when only a committed sandbox may be reused", async () => {
    const storedContext = {
      resolved: true as const,
      installationId: 42,
      repositoryFullName: "acme/web",
    };
    const requestedContext = {
      resolved: true as const,
      installationId: 99,
      repositoryFullName: "acme/other",
    };
    classifyConversationMock.mockResolvedValue({
      ...baseClassification,
      needsRepositoryTools: true,
      currentMessageSpecifiesRepository: true,
    });
    resolveConversationRepositoryGitHubContextMock.mockResolvedValue({
      status: "resolved",
      source: "single_installed_repository",
      context: requestedContext,
    });

    const result = await prepareConversationAgentTurn({
      surface: "web",
      conversationId: "conv_123",
      organizationId: "org_123",
      localUserId: "user_123",
      membershipRole: "admin",
      projectId: null,
      messageText: "search acme/other",
      hasTranslationAttachments: false,
      repositorySession: {
        repositoryGitHubContext: storedContext,
        repositorySandboxSession: {
          sandboxId: "sandbox_committed",
          repositoryContextKey: JSON.stringify({
            installationId: storedContext.installationId,
            repositoryFullName: storedContext.repositoryFullName,
            pullRequestNumber: null,
            branch: null,
            commitSha: null,
            commentId: null,
          }),
          createdAt: "2026-07-01T12:00:00.000Z",
          lastUsedAt: "2026-07-01T12:00:00.000Z",
        },
      },
      reuseCommittedRepositorySandboxOnly: true,
      db: {} as never,
    });

    expect(createRepositorySandboxMock).not.toHaveBeenCalled();
    expect(createConversationToolLoopAgentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        toolContext: expect.not.objectContaining({
          sandboxId: expect.anything(),
        }),
        additionalInstructions: expect.not.stringContaining("Repository read tools are available"),
      }),
    );
    expect(result.clarificationFollowUp).toBe(REPOSITORY_ACCESS_CONTENTION_FOLLOW_UP);
    expect(result.updatedRepositorySession?.repositorySandboxSession?.sandboxId).toBe(
      "sandbox_committed",
    );
  });
});
