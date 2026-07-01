import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const { stepCountIsMock, toolLoopAgentMock } = vi.hoisted(() => ({
  stepCountIsMock: vi.fn((count: number) => ({ stepLimit: count })),
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
    stepCountIs: stepCountIsMock,
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
        timeout: DEFAULT_AGENT_TIMEOUT,
        stopWhen: { stepLimit: hyperlocaliseAgentStepLimit },
      }),
    );

    const settings = toolLoopAgentMock.mock.calls.at(-1)?.[0] as {
      instructions: string;
      activeTools: string[];
      prepareStep?: unknown;
    };

    expect(settings.instructions).toContain("Translation tools");
    expect(settings.instructions).not.toContain("TMS tools");
    expect(settings.activeTools).not.toContain("check_crowdin_progress");
    expect(settings.prepareStep).toBeUndefined();
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
  });
});
