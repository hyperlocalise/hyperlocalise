import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const { generateTextMock } = vi.hoisted(() => ({
  generateTextMock: vi.fn(),
}));

vi.mock("ai", async () => {
  const actual = await vi.importActual<typeof import("ai")>("ai");

  return {
    ...actual,
    generateText: generateTextMock,
  };
});

vi.mock("@/lib/agent-runtime/loops/model", () => ({
  getHyperlocaliseAgentModel: vi.fn(() => "mock-model"),
}));

import {
  classifyConversation,
  fallbackConversationClassification,
  getRecentUserConversationText,
  shouldAttemptRepositoryContextResolution,
  shouldRequireRepositoryContextClarification,
  type ConversationClassification,
} from "./conversation-classifier";

function repositoryClassification(
  overrides: Partial<ConversationClassification> = {},
): ConversationClassification {
  return {
    needsRepositoryTools: true,
    requiresPullRequest: false,
    shouldAskForRepositoryClarification: false,
    continuesRepositoryThread: false,
    currentMessageSpecifiesRepository: false,
    confidence: 0.95,
    ...overrides,
  };
}

describe("conversation classifier", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("enables repository resolution when repository tools are needed", () => {
    expect(
      shouldAttemptRepositoryContextResolution({
        classification: repositoryClassification(),
      }),
    ).toBe(true);
  });

  it("keeps repository tools on thread follow-ups when context was stored", () => {
    expect(
      shouldAttemptRepositoryContextResolution({
        classification: repositoryClassification({
          needsRepositoryTools: false,
          continuesRepositoryThread: true,
        }),
        storedRepositoryContext: {
          resolved: true,
          installationId: 1,
          repositoryFullName: "acme/web",
        },
      }),
    ).toBe(true);
  });

  it("uses model output for repository clarification", () => {
    expect(
      shouldRequireRepositoryContextClarification(
        repositoryClassification({ shouldAskForRepositoryClarification: true }),
      ),
    ).toBe(true);
  });

  it("builds recent user conversation text for classification", () => {
    expect(
      getRecentUserConversationText(
        [{ role: "user", content: "what's the context of Providers" }],
        "Github repo",
      ),
    ).toBe("what's the context of Providers\nGithub repo");
  });

  it("classifies conversations through the AI SDK", async () => {
    generateTextMock.mockResolvedValueOnce({
      output: repositoryClassification({
        continuesRepositoryThread: true,
      }),
    });

    await expect(
      classifyConversation({
        currentMessage: "What are the words nearby?",
        conversationText: "what's the context of Providers\nWhat are the words nearby?",
        hasFileAttachments: false,
        hasStoredRepositoryContext: true,
        surface: "slack",
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        needsRepositoryTools: true,
        continuesRepositoryThread: true,
      }),
    );

    expect(generateTextMock).toHaveBeenCalledOnce();
  });

  it("includes a repository lookup example for context-of string questions", async () => {
    generateTextMock.mockResolvedValueOnce({
      output: repositoryClassification({
        shouldAskForRepositoryClarification: true,
      }),
    });

    await expect(
      classifyConversation({
        currentMessage: "do you know the context of Knowledge?",
        conversationText: "do you know the context of Knowledge?",
        hasFileAttachments: false,
        hasStoredRepositoryContext: false,
        surface: "slack",
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        needsRepositoryTools: true,
        shouldAskForRepositoryClarification: true,
        currentMessageSpecifiesRepository: false,
      }),
    );

    expect(generateTextMock).toHaveBeenCalledOnce();
    expect(generateTextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining(
          'Latest user message: "do you know the context of Knowledge?"',
        ),
      }),
    );
    expect(generateTextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining(
          "they usually mean context in the connected GitHub repository",
        ),
      }),
    );
  });

  it("keeps using model classification for stored repository context follow-ups", async () => {
    generateTextMock.mockResolvedValueOnce({
      output: repositoryClassification({
        shouldAskForRepositoryClarification: false,
        continuesRepositoryThread: true,
      }),
    });

    await expect(
      classifyConversation({
        currentMessage: 'What is the context of "Knowledge"?',
        conversationText: 'What is the context of "Knowledge"?',
        hasFileAttachments: false,
        hasStoredRepositoryContext: true,
        surface: "slack",
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        needsRepositoryTools: true,
        shouldAskForRepositoryClarification: false,
        continuesRepositoryThread: true,
      }),
    );

    expect(generateTextMock).toHaveBeenCalledOnce();
  });

  it("falls back when AI classification fails", async () => {
    generateTextMock.mockRejectedValueOnce(new Error("model unavailable"));

    await expect(
      classifyConversation({
        currentMessage: "Hello",
        conversationText: "Hello",
        hasFileAttachments: false,
        hasStoredRepositoryContext: false,
        surface: "web",
      }),
    ).resolves.toEqual(
      fallbackConversationClassification({
        hasFileAttachments: false,
        hasStoredRepositoryContext: false,
      }),
    );
  });

  it("falls back without repository tooling when classification fails", () => {
    expect(
      fallbackConversationClassification({
        hasFileAttachments: true,
        hasStoredRepositoryContext: false,
      }),
    ).toEqual(
      expect.objectContaining({
        needsRepositoryTools: false,
        confidence: 0,
      }),
    );
  });
});
