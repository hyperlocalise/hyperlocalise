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

vi.mock("@/lib/agent-runtime/loops/conversation-skill-agent", () => ({
  createConversationSkillAgent: vi.fn((runtime: unknown, onFinish: unknown) => ({
    runtime,
    onFinish,
  })),
}));

import {
  buildHyperlocaliseAgentInstructions,
  createConversationToolLoopAgent,
  createHyperlocaliseAgent,
  hyperlocaliseAgentModelId,
  hyperlocaliseAgentStepLimit,
  replaceLastUserMessage,
  toModelMessages,
} from "./hyperlocalise-agent";
import { createConversationSkillAgent } from "./conversation-skill-agent";
import { DEFAULT_AGENT_TIMEOUT } from "@/lib/agent-runtime/subagents/constants";

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

    expect(openaiMock).toHaveBeenCalledWith(hyperlocaliseAgentModelId);
    expect(stepCountIsMock).toHaveBeenCalledWith(hyperlocaliseAgentStepLimit);
    expect(toolLoopAgentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "mock-model",
        tools,
        activeTools: ["example"],
        timeout: DEFAULT_AGENT_TIMEOUT,
        stopWhen: { stepLimit: hyperlocaliseAgentStepLimit },
      }),
    );
  });

  it("creates a skill-based conversation agent from runtime context", () => {
    createConversationToolLoopAgent({
      surface: "web",
      toolContext: {
        conversationId: "conv_123",
        organizationId: "org_123",
        localUserId: "user_123",
        membershipRole: "admin",
        projectId: "proj_123",
        db: {} as never,
      },
      hasFileAttachments: true,
    });

    expect(createConversationSkillAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        surface: "web",
        hasFileAttachments: true,
        toolContext: expect.objectContaining({ projectId: "proj_123" }),
      }),
      undefined,
    );
  });
});
