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

const { isStepCountMock, toolLoopAgentMock } = vi.hoisted(() => ({
  isStepCountMock: vi.fn((count: number) => ({ stepLimit: count })),
  toolLoopAgentMock: vi.fn(function ToolLoopAgent(settings: unknown) {
    return { settings };
  }),
}));

vi.mock("@ai-sdk/openai", () => ({
  openai: vi.fn(() => "mock-model"),
}));

vi.mock("ai", async () => {
  const actual = await vi.importActual<typeof import("ai")>("ai");

  return {
    ...actual,
    isStepCount: isStepCountMock,
    ToolLoopAgent: toolLoopAgentMock,
  };
});

vi.mock("@/lib/env", () => ({
  env: {
    OPENAI_API_KEY: "test-openai-key",
  },
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

  it("exposes project and translation tools without TMS integration", () => {
    createConversationSkillAgent({
      surface: "slack",
      hasFileAttachments: false,
      hasTmsIntegration: false,
      toolContext: baseToolContext,
    });

    expect(toolLoopAgentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        activeTools: expect.arrayContaining([
          "list_projects",
          "get_project_context",
          "update_interaction_project",
          "translate_string",
        ]),
        tools: expect.objectContaining({
          list_projects: expect.any(Object),
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

  it("adds Knowledge Memory read and write tools for an enabled web admin", () => {
    createConversationSkillAgent({
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

  it("keeps Knowledge Memory read-only for an enabled reviewer", () => {
    createConversationSkillAgent({
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

  it("adds TMS tools when integration is available", () => {
    createConversationSkillAgent({
      surface: "slack",
      hasFileAttachments: false,
      hasTmsIntegration: true,
      toolContext: baseToolContext,
    });

    expect(toolLoopAgentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        activeTools: expect.arrayContaining(["check_crowdin_progress"]),
        tools: expect.objectContaining({
          check_crowdin_progress: expect.any(Object),
        }),
      }),
    );

    const settings = toolLoopAgentMock.mock.calls.at(-1)?.[0] as {
      instructions: string;
    };

    expect(settings.instructions).toContain("TMS tools");
    expect(settings.instructions).toContain("Crowdin TMS");
  });

  it("adds repo and file job tools when runtime context allows them", () => {
    createConversationSkillAgent({
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

  it("exposes todoWrite in both tools and activeTools for repo skills", () => {
    createConversationSkillAgent({
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
});
