import { describe, expect, it, vi } from "vite-plus/test";

const { stepCountIsMock, toolLoopAgentMock } = vi.hoisted(() => ({
  stepCountIsMock: vi.fn((count: number) => ({ stepLimit: count })),
  toolLoopAgentMock: vi.fn(function ToolLoopAgent(settings: unknown) {
    return { settings };
  }),
}));

vi.mock("ai", async () => {
  const actual = await vi.importActual<typeof import("ai")>("ai");

  return {
    ...actual,
    stepCountIs: stepCountIsMock,
    ToolLoopAgent: toolLoopAgentMock,
  };
});

vi.mock("@/lib/agent-runtime/loops/model", () => ({
  getHyperlocaliseAgentModel: vi.fn(() => "mock-model"),
}));

import { WORKSPACE_ORCHESTRATOR_STEP_LIMIT } from "@/lib/agent-runtime/subagents/constants";
import type {
  WorkspaceAutomationRecord,
  WorkspaceAutomationRunRecord,
} from "@/lib/agents/workspace-automations";

import { createWorkspaceOrchestratorAgent } from "./agent";
import { createWorkspaceOrchestratorSession } from "./context";

function automation(): WorkspaceAutomationRecord {
  return {
    id: "automation-1",
    organizationId: "org-1",
    authorUserId: null,
    status: "active",
    name: "Test automation",
    instructions: "",
    triggerConfig: { mode: "manual" },
    repositoryTarget: { kind: "none" },
    toolConfig: {
      github: {
        enabled: true,
        mode: "sync",
        projectId: "project-1",
        pushSource: true,
        pullTranslations: false,
        validation: false,
      },
      slack: { enabled: true, channelId: "C123" },
    },
    configVersion: 1,
    nextRunAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function run(): WorkspaceAutomationRunRecord {
  return {
    id: "run-1",
    automationId: "automation-1",
    organizationId: "org-1",
    triggerSource: "manual",
    status: "queued",
    inputSnapshot: {},
    outputSummary: {},
    error: null,
    githubRepositoryAutomationJobId: null,
    idempotencyKey: null,
    startedAt: null,
    completedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

describe("workspace orchestrator agent", () => {
  it("forces planned tools in order via prepareStep", () => {
    const session = createWorkspaceOrchestratorSession({
      organizationId: "org-1",
      automation: automation(),
      run: run(),
      plan: {
        tools: ["run_github_workflows", "notify_slack"],
      },
      repository: null,
      composedInstructions: "Run the automation.",
    });

    createWorkspaceOrchestratorAgent(session);

    expect(stepCountIsMock).toHaveBeenCalledWith(3);
    expect(toolLoopAgentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        activeTools: ["run_github_workflows", "notify_slack"],
        prepareStep: expect.any(Function),
      }),
    );

    const settings = toolLoopAgentMock.mock.calls.at(-1)?.[0] as {
      prepareStep: (input: { stepNumber: number }) => unknown;
    };

    expect(settings.prepareStep({ stepNumber: 0 })).toEqual({
      activeTools: ["run_github_workflows"],
      toolChoice: { type: "tool", toolName: "run_github_workflows" },
    });
    expect(settings.prepareStep({ stepNumber: 1 })).toEqual({
      activeTools: ["notify_slack"],
      toolChoice: { type: "tool", toolName: "notify_slack" },
    });
    expect(settings.prepareStep({ stepNumber: 2 })).toEqual({
      toolChoice: "none",
    });
    expect(settings.prepareStep({ stepNumber: WORKSPACE_ORCHESTRATOR_STEP_LIMIT })).toEqual({
      toolChoice: "none",
    });
  });
});
