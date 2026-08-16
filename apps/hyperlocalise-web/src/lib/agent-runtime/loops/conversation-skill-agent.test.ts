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

const { isStepCountMock, toolLoopAgentMock, resolveHyperlocaliseAgentLanguageModelMock } =
  vi.hoisted(() => ({
    isStepCountMock: vi.fn((count: number) => ({ stepLimit: count })),
    toolLoopAgentMock: vi.fn(function ToolLoopAgent(settings: unknown) {
      return { settings };
    }),
    resolveHyperlocaliseAgentLanguageModelMock: vi.fn(
      async (): Promise<{
        model: string;
        source: "gateway" | "openai" | "anthropic" | "gemini" | "groq" | "mistral";
        modelId: string;
      }> => ({
        model: "mock-model",
        source: "gateway",
        modelId: "openai/gpt-5.6-luna",
      }),
    ),
  }));

vi.mock("ai", async () => {
  const actual = await vi.importActual<typeof import("ai")>("ai");

  return {
    ...actual,
    isStepCount: isStepCountMock,
    ToolLoopAgent: toolLoopAgentMock,
  };
});

vi.mock("@/lib/providers/language-model", () => ({
  getAgentProviderOptions: (source: string) =>
    source === "openai" || source === "gateway"
      ? { openai: { reasoningSummary: "auto" as const } }
      : undefined,
}));

vi.mock("@/lib/providers/organization-language-model", () => ({
  resolveHyperlocaliseAgentLanguageModel: resolveHyperlocaliseAgentLanguageModelMock,
}));

import { clearAgentManifestCache } from "@/agents/_runtime/loader";
import { DEFAULT_AGENT_TIMEOUT } from "@/lib/agent-runtime/subagents/constants";
import { hyperlocaliseAgentStepLimit } from "./hyperlocalise-agent";

import { createConversationSkillAgent } from "./conversation-skill-agent";

const baseToolContext = {
  conversationId: "conversation_123",
  organizationId: "org_123",
  localUserId: "user_123",
  membershipRole: "member" as const,
  projectId: null,
  db: {} as never,
};

describe("conversation skill agent", () => {
  beforeEach(() => {
    clearAgentManifestCache();
    vi.clearAllMocks();
  });

  it("exposes project and translation tools without TMS integration", async () => {
    await createConversationSkillAgent({
      surface: "slack",
      hasFileAttachments: false,
      hasTmsIntegration: false,
      toolContext: {
        ...baseToolContext,
        glossarySearchEnabled: true,
      },
    });

    expect(toolLoopAgentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        activeTools: expect.arrayContaining([
          "list_projects",
          "get_project_context",
          "update_interaction_project",
          "search_native_glossary",
          "translate_string",
        ]),
        tools: expect.objectContaining({
          list_projects: expect.any(Object),
          search_native_glossary: expect.any(Object),
          translate_string: expect.any(Object),
        }),
        providerOptions: {
          openai: {
            reasoningSummary: "auto",
          },
        },
        timeout: DEFAULT_AGENT_TIMEOUT,
        stopWhen: { stepLimit: hyperlocaliseAgentStepLimit },
      }),
    );

    const settings = toolLoopAgentMock.mock.calls.at(-1)?.[0] as {
      instructions: string;
      activeTools: string[];
      prepareStep?: (input: { stepNumber: number }) => unknown;
    };

    expect(settings.instructions).toContain("Translation tools");
    expect(settings.instructions).not.toContain("TMS tools");
    expect(settings.activeTools).not.toContain("check_crowdin_progress");
    expect(settings.activeTools).not.toContain("get_knowledge_memory");
    expect(settings.activeTools).not.toContain("update_knowledge_memory");
    expect(settings.prepareStep).toEqual(expect.any(Function));
    expect(settings.prepareStep?.({ stepNumber: 0 })).toBeUndefined();
    expect(settings.prepareStep?.({ stepNumber: hyperlocaliseAgentStepLimit - 1 })).toEqual({
      toolChoice: "none",
    });
  });

  it("adds Knowledge Memory read and write tools for an enabled web admin", async () => {
    await createConversationSkillAgent({
      surface: "web",
      hasFileAttachments: false,
      hasTmsIntegration: false,
      toolContext: {
        ...baseToolContext,
        membershipRole: "admin",
        knowledgeMemoryEnabled: true,
      },
    });

    expect(toolLoopAgentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        activeTools: expect.arrayContaining(["get_knowledge_memory", "update_knowledge_memory"]),
        tools: expect.objectContaining({
          get_knowledge_memory: expect.any(Object),
          update_knowledge_memory: expect.any(Object),
        }),
      }),
    );
  });

  it("keeps Knowledge Memory read-only for an enabled reviewer", async () => {
    await createConversationSkillAgent({
      surface: "web",
      hasFileAttachments: false,
      hasTmsIntegration: false,
      toolContext: {
        ...baseToolContext,
        membershipRole: "reviewer",
        knowledgeMemoryEnabled: true,
      },
    });

    const settings = toolLoopAgentMock.mock.calls.at(-1)?.[0] as {
      activeTools: string[];
      tools: Record<string, unknown>;
    };
    expect(settings.activeTools).toContain("get_knowledge_memory");
    expect(settings.activeTools).not.toContain("update_knowledge_memory");
    expect(settings.tools.get_knowledge_memory).toBeDefined();
    expect(settings.tools.update_knowledge_memory).toBeUndefined();
  });

  it("adds TMS tools when integration is available", async () => {
    await createConversationSkillAgent({
      surface: "slack",
      hasFileAttachments: false,
      hasTmsIntegration: true,
      toolContext: {
        ...baseToolContext,
        glossarySearchEnabled: true,
      },
    });

    expect(toolLoopAgentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        activeTools: expect.arrayContaining(["check_crowdin_progress", "search_crowdin_glossary"]),
        tools: expect.objectContaining({
          check_crowdin_progress: expect.any(Object),
          search_crowdin_glossary: expect.any(Object),
        }),
      }),
    );

    const settings = toolLoopAgentMock.mock.calls.at(-1)?.[0] as {
      instructions: string;
      activeTools: string[];
    };

    expect(settings.instructions).toContain("TMS tools");
    expect(settings.instructions).toContain("Crowdin TMS");
    expect(settings.instructions).toContain(
      "Before advising on product names, feature names, or UI terms, call `search_crowdin_glossary`.",
    );
  });

  it("omits glossary search tools when the feature flag is off", async () => {
    await createConversationSkillAgent({
      surface: "web",
      hasFileAttachments: false,
      hasTmsIntegration: true,
      toolContext: baseToolContext,
    });

    const settings = toolLoopAgentMock.mock.calls.at(-1)?.[0] as {
      instructions: string;
      activeTools: string[];
    };

    expect(settings.activeTools).toContain("check_crowdin_progress");
    expect(settings.activeTools).not.toContain("search_native_glossary");
    expect(settings.activeTools).not.toContain("search_crowdin_glossary");
    expect(settings.instructions).not.toContain("## Crowdin glossary tools");
    expect(settings.instructions).not.toContain(
      "Before advising on product names, feature names, or UI terms, call `search_crowdin_glossary`.",
    );
  });

  it("adds repo and file job tools when runtime context allows them", async () => {
    await createConversationSkillAgent({
      surface: "slack",
      hasFileAttachments: true,
      hasTmsIntegration: true,
      toolContext: {
        ...baseToolContext,
        projectId: "proj_123",
        sandboxId: "sbx_123",
      },
    });

    expect(toolLoopAgentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        activeTools: expect.arrayContaining(["grep", "createTranslationJob", "translate_string"]),
      }),
    );

    const settings = toolLoopAgentMock.mock.calls.at(-1)?.[0] as {
      instructions: string;
    };
    expect(settings.instructions).toContain("Repository tools");
    expect(settings.instructions).toContain("Find context in repository");
    expect(settings.instructions).toContain("Recent changes with full context");
    expect(settings.instructions).toContain("exist in the current source files now");
  });

  it("exposes todoWrite in both tools and activeTools for repo skills", async () => {
    await createConversationSkillAgent({
      surface: "web",
      hasFileAttachments: false,
      hasTmsIntegration: false,
      hasVisualMockSkill: true,
      toolContext: {
        ...baseToolContext,
        sandboxId: "sbx_123",
        workMode: "write",
        repositorySource: "chat_ui",
        actor: { sourceUserId: "user_123", role: "admin" },
        membershipRole: "admin",
      },
    });

    expect(toolLoopAgentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        activeTools: expect.arrayContaining(["todoWrite", "grep", "captureScreenshot"]),
        tools: expect.objectContaining({
          todoWrite: expect.any(Object),
          grep: expect.any(Object),
          captureScreenshot: expect.any(Object),
        }),
      }),
    );

    const settings = toolLoopAgentMock.mock.calls.at(-1)?.[0] as {
      activeTools: string[];
      tools: Record<string, unknown>;
    };
    for (const toolName of settings.activeTools) {
      expect(settings.tools[toolName]).toBeDefined();
    }
  });

  it("omits OpenAI provider options when the organization uses Anthropic BYOK", async () => {
    resolveHyperlocaliseAgentLanguageModelMock.mockResolvedValueOnce({
      model: "anthropic-model",
      source: "anthropic",
      modelId: "claude-sonnet-4-6",
    });

    await createConversationSkillAgent({
      surface: "web",
      hasFileAttachments: false,
      hasTmsIntegration: false,
      toolContext: baseToolContext,
    });

    expect(toolLoopAgentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "anthropic-model",
        providerOptions: undefined,
      }),
    );
  });
});
