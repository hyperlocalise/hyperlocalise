import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const { openaiMock, stepCountIsMock, toolLoopAgentMock, buildToolsMock } = vi.hoisted(() => ({
  openaiMock: vi.fn(() => "mock-model"),
  stepCountIsMock: vi.fn((count: number) => ({ stepLimit: count })),
  toolLoopAgentMock: vi.fn(function ToolLoopAgent(settings: unknown) {
    return { settings };
  }),
  buildToolsMock: vi.fn(() => ({ listProjects: { description: "mock tool" } })),
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

vi.mock("@/lib/tools/registry", () => ({
  buildTools: buildToolsMock,
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

import {
  buildHyperlocaliseAgentInstructions,
  createConversationToolLoopAgent,
  createHyperlocaliseAgent,
  hyperlocaliseAgentStepLimit,
  replaceLastUserMessage,
  toModelMessages,
} from "./hyperlocalise-agent";

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
    expect(instructions).toContain("This conversation is attached to project proj_123.");
    expect(instructions).toContain("Call getProjectContext");
  });

  it("builds missing-project guidance for web conversations", () => {
    const instructions = buildHyperlocaliseAgentInstructions({
      surface: "web",
      projectId: null,
    });

    expect(instructions).toContain("This conversation is NOT attached to a project yet.");
    expect(instructions).toContain("call listProjects");
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
        stopWhen: { stepLimit: 5 },
      }),
    );
  });

  it("builds request-scoped tools for conversational agents", () => {
    const toolContext = {
      conversationId: "conv_123",
      organizationId: "org_123",
      membershipRole: "admin" as const,
      projectId: null,
      db: {} as never,
    };

    createConversationToolLoopAgent({
      surface: "web",
      toolContext,
    });

    expect(buildToolsMock).toHaveBeenCalledWith(toolContext);
    expect(toolLoopAgentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tools: { listProjects: { description: "mock tool" } },
      }),
    );
  });
});
