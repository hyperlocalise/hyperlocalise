import { describe, expect, it, vi } from "vite-plus/test";

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

import {
  ORCHESTRATOR_AGENT_TIMEOUT,
  ORCHESTRATOR_STEP_LIMIT,
  SUBAGENT_TIMEOUT,
} from "@/lib/agent-runtime/subagents/constants";

import { buildOrchestratorInstructions, createConversationOrchestratorAgent } from "./orchestrator";

describe("conversation orchestrator", () => {
  it("includes base agent instructions only once", () => {
    const instructions = buildOrchestratorInstructions({
      surface: "web",
      projectId: null,
      suggestedIntents: ["repository"],
      suggestedMode: "repository",
      availableSubagents: ["repository"],
      preferredSubagents: ["repository"],
      useCrowdinDirectTools: false,
    });

    const marker = "You are Hyperlocalise, a localization assistant.";
    expect(instructions.split(marker).length - 1).toBe(1);
  });

  it("includes the synthesis instruction only once", () => {
    const instructions = buildOrchestratorInstructions({
      surface: "web",
      projectId: null,
      suggestedIntents: ["repository"],
      suggestedMode: "repository",
      availableSubagents: ["repository"],
      preferredSubagents: ["repository"],
      useCrowdinDirectTools: false,
    });

    const marker =
      "After each agent returns, synthesize one clear user-facing reply that covers every intent addressed.";
    expect(instructions.split(marker).length - 1).toBe(1);
  });

  it("frames repository delegation as localization context exploration", () => {
    const instructions = buildOrchestratorInstructions({
      surface: "web",
      projectId: null,
      suggestedIntents: ["repository"],
      suggestedMode: "repository",
      availableSubagents: ["repository"],
      preferredSubagents: ["repository"],
      useCrowdinDirectTools: false,
    });

    expect(instructions).toContain("Repository context handoff");
    expect(instructions).toContain("localization context exploration");
    expect(instructions).toContain("Delegate to `repository` for this turn before answering.");
    expect(instructions).toContain("source text");
    expect(instructions).toContain("preserving capitalization and punctuation");
    expect(instructions).toContain("case-insensitive search");
    expect(instructions).toContain("Require fuzzySearch for short UI labels");
    expect(instructions).toContain("short visible UI labels");
    expect(instructions).toContain("app shell, sidebar, navigation, and config files");
    expect(instructions).toContain("lowercase route/key variants");
    expect(instructions).toContain("not to return `no match` for a short UI label");
    expect(instructions).toContain("lead with an **Answer**");
    expect(instructions).toContain("placeholder semantics");
    expect(instructions).toContain("Do not use repository context for broad architecture");
  });

  it("instructs sequential delegation when multiple intents are active", () => {
    const instructions = buildOrchestratorInstructions({
      surface: "slack",
      projectId: null,
      suggestedIntents: ["translation", "repository"],
      suggestedMode: "general",
      availableSubagents: ["repository", "translation"],
      preferredSubagents: ["repository", "translation"],
      useCrowdinDirectTools: false,
    });

    expect(instructions).toContain("Active intents");
    expect(instructions).toContain("`translation`");
    expect(instructions).toContain("`repository`");
    expect(instructions).toContain("`repository` → `translation`");
    expect(instructions).toContain("Run every agent");
    expect(instructions).toContain("complete repository context collection before translation");
  });

  it("allows enough wall-clock time for delegated subagents", () => {
    expect(ORCHESTRATOR_AGENT_TIMEOUT.totalMs).toBeGreaterThanOrEqual(
      (ORCHESTRATOR_STEP_LIMIT - 1) * SUBAGENT_TIMEOUT.totalMs +
        ORCHESTRATOR_STEP_LIMIT * ORCHESTRATOR_AGENT_TIMEOUT.stepMs,
    );
  });

  it("forces the first repository turn through the task tool", () => {
    createConversationOrchestratorAgent({
      surface: "slack",
      suggestedIntents: ["repository"],
      suggestedMode: "repository",
      hasFileAttachments: false,
      additionalInstructions: undefined,
      toolContext: {
        conversationId: "conversation_123",
        organizationId: "org_123",
        localUserId: "user_123",
        membershipRole: "member",
        projectId: null,
        db: {} as never,
        sandboxId: "sbx_123",
      },
    });

    expect(stepCountIsMock).toHaveBeenCalledWith(ORCHESTRATOR_STEP_LIMIT);
    expect(toolLoopAgentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        activeTools: ["task"],
        timeout: ORCHESTRATOR_AGENT_TIMEOUT,
        stopWhen: { stepLimit: ORCHESTRATOR_STEP_LIMIT },
        prepareStep: expect.any(Function),
      }),
    );

    const settings = toolLoopAgentMock.mock.calls.at(-1)?.[0] as {
      prepareStep: (input: { stepNumber: number }) => unknown;
    };

    expect(settings.prepareStep({ stepNumber: 0 })).toEqual({
      activeTools: ["task"],
      toolChoice: { type: "tool", toolName: "task" },
    });
    expect(settings.prepareStep({ stepNumber: 1 })).toEqual({
      toolChoice: "none",
    });
    expect(settings.prepareStep({ stepNumber: 2 })).toEqual({});
  });

  it("uses direct Crowdin tools for translation-only TMS requests", () => {
    const instructions = buildOrchestratorInstructions({
      surface: "slack",
      projectId: null,
      suggestedIntents: ["translation"],
      suggestedMode: "translation",
      availableSubagents: ["translation"],
      preferredSubagents: [],
      useCrowdinDirectTools: true,
    });

    expect(instructions).toContain("Crowdin TMS");
    expect(instructions).toContain("check_crowdin_progress");
    expect(instructions).toContain("list_projects");
    expect(instructions).not.toContain("Delegate to `translation`");
  });

  it("exposes direct Crowdin tools without forcing task delegation", () => {
    createConversationOrchestratorAgent({
      surface: "slack",
      suggestedIntents: ["translation"],
      suggestedMode: "translation",
      hasFileAttachments: false,
      additionalInstructions: undefined,
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
        activeTools: [
          "list_projects",
          "get_project_context",
          "update_interaction_project",
          "check_crowdin_progress",
        ],
        tools: expect.objectContaining({
          list_projects: expect.any(Object),
          check_crowdin_progress: expect.any(Object),
          task: expect.any(Object),
        }),
      }),
    );

    const settings = toolLoopAgentMock.mock.calls.at(-1)?.[0] as {
      prepareStep: (input: { stepNumber: number }) => unknown;
    };

    expect(settings.prepareStep({ stepNumber: 0 })).toEqual({});
  });
});
