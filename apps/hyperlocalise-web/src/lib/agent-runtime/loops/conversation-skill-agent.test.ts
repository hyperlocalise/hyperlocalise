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

describe("conversation skill agent", () => {
  beforeEach(() => {
    clearAgentManifestCache();
    vi.clearAllMocks();
  });

  it("exposes TMS tools by default without intents", () => {
    createConversationSkillAgent({
      surface: "slack",
      hasFileAttachments: false,
      toolContext: {
        conversationId: "conversation_123",
        organizationId: "org_123",
        localUserId: "user_123",
        membershipRole: "member",
        projectId: null,
        db: {} as never,
      },
    });

    expect(toolLoopAgentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        activeTools: expect.arrayContaining([
          "list_projects",
          "get_project_context",
          "update_interaction_project",
          "check_crowdin_progress",
        ]),
        tools: expect.objectContaining({
          list_projects: expect.any(Object),
          check_crowdin_progress: expect.any(Object),
        }),
        timeout: DEFAULT_AGENT_TIMEOUT,
        stopWhen: { stepLimit: hyperlocaliseAgentStepLimit },
      }),
    );

    const settings = toolLoopAgentMock.mock.calls.at(-1)?.[0] as {
      instructions: string;
      prepareStep?: unknown;
    };

    expect(settings.instructions).toContain("TMS tools");
    expect(settings.instructions).toContain("Crowdin TMS");
    expect(settings.prepareStep).toBeUndefined();
  });

  it("adds repo and translation tools when runtime context allows them", () => {
    createConversationSkillAgent({
      surface: "slack",
      hasFileAttachments: true,
      toolContext: {
        conversationId: "conversation_123",
        organizationId: "org_123",
        localUserId: "user_123",
        membershipRole: "member",
        projectId: "proj_123",
        db: {} as never,
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
