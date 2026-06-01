import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const { openaiMock, stepCountIsMock, toolLoopAgentMock } = vi.hoisted(() => ({
  openaiMock: vi.fn(() => "mock-model"),
  stepCountIsMock: vi.fn((count: number) => ({ stepLimit: count })),
  toolLoopAgentMock: vi.fn(function ToolLoopAgent(settings: unknown) {
    return { settings };
  }),
}));

vi.mock("@ai-sdk/openai", () => ({
  openai: openaiMock,
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

vi.mock("@/lib/database", () => ({
  db: {},
  schema: {
    interactionMessages: {
      senderType: "senderType",
      text: "text",
      interactionId: "interactionId",
      createdAt: "createdAt",
    },
  },
}));

vi.mock("@/lib/agent-runtime/loops/orchestrator", () => ({
  createConversationOrchestratorAgent: vi.fn((runtime: unknown, onFinish: unknown) => ({
    runtime,
    onFinish,
  })),
}));

import {
  buildHyperlocaliseAgentInstructions,
  createConversationToolLoopAgent,
  createHyperlocaliseAgent,
  hyperlocaliseAgentStepLimit,
  replaceLastUserMessage,
  toModelMessages,
} from "./hyperlocalise-agent";
import { createConversationOrchestratorAgent } from "./orchestrator";

describe("hyperlocalise agent core", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("builds project-aware Slack instructions", () => {
    const instructions = buildHyperlocaliseAgentInstructions({
      surface: "slack",
      projectId: "proj_123",
    });

    expect(instructions).toContain("Slack-friendly");
    expect(instructions).toContain("translate uploaded files");
    expect(instructions).toContain("find localization context");
  });

  it("converts interaction rows to model messages", () => {
    expect(
      toModelMessages([
        { senderType: "user", text: "Hello" },
        { senderType: "agent", text: "Hi" },
      ]),
    ).toEqual([
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi" },
    ]);
  });

  it("replaces the freshest user message", () => {
    expect(
      replaceLastUserMessage(
        [
          { role: "user", content: "old" },
          { role: "assistant", content: "reply" },
        ],
        "fresh",
      ),
    ).toEqual([
      { role: "user", content: "fresh" },
      { role: "assistant", content: "reply" },
    ]);
  });

  it("creates a ToolLoopAgent with shared defaults", () => {
    const tools = { example: { description: "tool" } } as never;

    createHyperlocaliseAgent({
      surface: "github",
      projectId: null,
      tools,
      activeTools: ["example"],
    });

    expect(openaiMock).toHaveBeenCalledWith("gpt-5.4-mini");
    expect(stepCountIsMock).toHaveBeenCalledWith(hyperlocaliseAgentStepLimit);
    expect(toolLoopAgentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "mock-model",
        tools,
        activeTools: ["example"],
        stopWhen: { stepLimit: hyperlocaliseAgentStepLimit },
      }),
    );
  });

  it("creates an orchestrator runtime for translation mode", () => {
    createConversationToolLoopAgent({
      surface: "web",
      suggestedIntents: ["translation"],
      toolContext: {
        conversationId: "conv_123",
        organizationId: "org_123",
        localUserId: "user_123",
        membershipRole: "admin",
        projectId: null,
        db: {} as never,
      },
      hasFileAttachments: true,
    });

    expect(createConversationOrchestratorAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        surface: "web",
        suggestedMode: "translation",
        hasFileAttachments: true,
      }),
      undefined,
    );
  });

  it("creates an orchestrator runtime for repository mode", () => {
    createConversationToolLoopAgent({
      surface: "slack",
      suggestedIntents: ["repository"],
      toolContext: {
        conversationId: "conv_123",
        organizationId: "org_123",
        localUserId: "user_123",
        membershipRole: "admin",
        projectId: null,
        db: {} as never,
        sandboxId: "sbx_123",
      },
    });

    expect(createConversationOrchestratorAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        suggestedMode: "repository",
        toolContext: expect.objectContaining({ sandboxId: "sbx_123" }),
      }),
      undefined,
    );
  });
});
