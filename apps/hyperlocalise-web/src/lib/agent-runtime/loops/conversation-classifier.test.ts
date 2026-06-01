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
  classificationHasIntent,
  fallbackConversationClassification,
  getPrimarySuggestedMode,
  getRecentUserConversationText,
  normalizeConversationIntents,
  shouldAttemptRepositoryContextResolution,
  shouldRequireRepositoryContextClarification,
  type ConversationClassification,
} from "./conversation-classifier";

function repositoryClassification(
  overrides: Partial<ConversationClassification> = {},
): ConversationClassification {
  return {
    intents: ["repository"],
    needsRepositoryTools: true,
    requiresPullRequest: false,
    shouldAskForRepositoryClarification: false,
    continuesRepositoryThread: false,
    currentMessageSpecifiesRepository: false,
    confidence: 0.95,
    ...overrides,
  };
}

describe("conversation classifier routing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("normalizes multi-intent output and drops general when specific intents exist", () => {
    expect(normalizeConversationIntents(["translation", "repository", "general"])).toEqual([
      "translation",
      "repository",
    ]);
  });

  it("uses general orchestrator mode when translation and repository are both active", () => {
    expect(getPrimarySuggestedMode(["translation", "repository"])).toBe("general");
  });

  it("accepts readonly intent arrays when normalizing", () => {
    const intents = ["translation", "repository"] as const;

    expect(normalizeConversationIntents(intents)).toEqual(["translation", "repository"]);
  });

  it("enables repository resolution when repository is among intents", () => {
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
          intents: ["repository"],
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

  it("detects translation intent in multi-intent classification", () => {
    const classification = repositoryClassification({
      intents: ["translation", "repository"],
    });
    expect(classificationHasIntent(classification, "translation")).toBe(true);
    expect(classificationHasIntent(classification, "repository")).toBe(true);
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
        intents: ["repository"],
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
        intents: ["repository"],
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

  it("falls back to translation intent when attachments are present", () => {
    expect(
      fallbackConversationClassification({
        hasFileAttachments: true,
        hasStoredRepositoryContext: false,
      }),
    ).toEqual(
      expect.objectContaining({
        intents: ["translation"],
        confidence: 0,
      }),
    );
  });
});
