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
import { describe, expect, it, vi } from "vite-plus/test";

const { isStepCountMock, toolLoopAgentMock } = vi.hoisted(() => ({
  isStepCountMock: vi.fn((count: number) => ({ stepLimit: count })),
  toolLoopAgentMock: vi.fn(function ToolLoopAgent(settings: unknown) {
    return { settings };
  }),
}));

vi.mock("ai", async () => {
  const actual = await vi.importActual<typeof import("ai")>("ai");

  return {
    ...actual,
    isStepCount: isStepCountMock,
    ToolLoopAgent: toolLoopAgentMock,
  };
});

import {
  WORKFLOW_AGENT_TIMEOUT,
  WORKSPACE_ORCHESTRATOR_STEP_LIMIT,
  WORKSPACE_ORCHESTRATOR_TIMEOUT,
} from "@/lib/agent-runtime/subagents/constants";
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
    model: "openai/gpt-5.6-luna",
    projectId: "project-1",
    triggerConfig: { mode: "manual" },
    repositoryTarget: { kind: "none" },
    toolConfig: {
      github: {
        enabled: true,
        mode: "sync",
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

    // WORKSPACE_ORCHESTRATOR_STEP_LIMIT (6) is a floor, not a ceiling: a 2-tool plan still gets at
    // least that many steps even though plannedToolCount + 1 (3) is smaller.
    expect(isStepCountMock).toHaveBeenCalledWith(WORKSPACE_ORCHESTRATOR_STEP_LIMIT);
    expect(WORKSPACE_ORCHESTRATOR_TIMEOUT.stepMs).toBe(WORKFLOW_AGENT_TIMEOUT.totalMs);
    expect(WORKFLOW_AGENT_TIMEOUT.stepMs).toBeLessThan(WORKFLOW_AGENT_TIMEOUT.totalMs);
    expect(WORKSPACE_ORCHESTRATOR_TIMEOUT.stepMs).toBeLessThan(
      WORKSPACE_ORCHESTRATOR_TIMEOUT.totalMs,
    );
    expect(toolLoopAgentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "openai/gpt-5.6-luna",
        activeTools: ["run_github_workflows", "notify_slack"],
        timeout: WORKSPACE_ORCHESTRATOR_TIMEOUT,
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

  it("uses the automation's selected model", () => {
    const session = createWorkspaceOrchestratorSession({
      organizationId: "org-1",
      automation: { ...automation(), model: "anthropic/claude-opus-5" },
      run: run(),
      plan: {
        tools: ["run_github_workflows"],
      },
      repository: null,
      composedInstructions: "Run the automation.",
    });

    createWorkspaceOrchestratorAgent(session);

    expect(toolLoopAgentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "anthropic/claude-opus-5",
      }),
    );
  });

  it("never caps the step count below what a larger plan needs", () => {
    // Regression for a Codex finding: WORKSPACE_ORCHESTRATOR_STEP_LIMIT (6) used to be an upper
    // bound on stepLimit, so enabling Memory (prepending recall_memory) on an automation that
    // already planned 6 workflow/notification tools produced a 7-tool plan capped down to 6 steps
    // — silently dropping the last planned tool (often the Slack/email notification) even though
    // the run still reported success.
    const sevenTools = [
      "recall_memory",
      "use_github_repository",
      "run_github_workflows",
      "create_native_tms_job",
      "assign_translate_with_agent",
      "use_semrush",
      "notify_slack",
    ] as const;

    const session = createWorkspaceOrchestratorSession({
      organizationId: "org-1",
      automation: automation(),
      run: run(),
      plan: { tools: [...sevenTools] },
      repository: null,
      composedInstructions: "Run the automation.",
    });

    createWorkspaceOrchestratorAgent(session);

    expect(isStepCountMock).toHaveBeenCalledWith(sevenTools.length + 1);

    const settings = toolLoopAgentMock.mock.calls.at(-1)?.[0] as {
      prepareStep: (input: { stepNumber: number }) => unknown;
    };

    expect(settings.prepareStep({ stepNumber: 6 })).toEqual({
      activeTools: ["notify_slack"],
      toolChoice: { type: "tool", toolName: "notify_slack" },
    });
  });

  it("forces save_memory like any other planned tool, positioned before notifications", () => {
    // Regression for a Codex finding: an earlier version of this file gave save_memory its own
    // step with toolChoice: "auto" so the model could skip it. But the underlying ToolLoopAgent's
    // step loop only continues past a step that produced at least one tool call, so if the model
    // legitimately chose not to call it, the run ended right there — the forced notify_slack step
    // planned after it never ran, even though it was supposed to be unconditional. save_memory is
    // forced like every other planned tool now; it stays reachable-but-not-fabricating via its own
    // input schema (entry: null), not via an "auto" loop step.
    const session = createWorkspaceOrchestratorSession({
      organizationId: "org-1",
      automation: automation(),
      run: run(),
      plan: {
        tools: ["recall_memory", "run_github_workflows", "save_memory", "notify_slack"],
      },
      repository: null,
      composedInstructions: "Run the automation.",
    });

    createWorkspaceOrchestratorAgent(session);

    const settings = toolLoopAgentMock.mock.calls.at(-1)?.[0] as {
      prepareStep: (input: { stepNumber: number }) => unknown;
    };

    expect(settings.prepareStep({ stepNumber: 0 })).toEqual({
      activeTools: ["recall_memory"],
      toolChoice: { type: "tool", toolName: "recall_memory" },
    });
    expect(settings.prepareStep({ stepNumber: 1 })).toEqual({
      activeTools: ["run_github_workflows"],
      toolChoice: { type: "tool", toolName: "run_github_workflows" },
    });
    expect(settings.prepareStep({ stepNumber: 2 })).toEqual({
      activeTools: ["save_memory"],
      toolChoice: { type: "tool", toolName: "save_memory" },
    });
    expect(settings.prepareStep({ stepNumber: 3 })).toEqual({
      activeTools: ["notify_slack"],
      toolChoice: { type: "tool", toolName: "notify_slack" },
    });
    expect(settings.prepareStep({ stepNumber: 4 })).toEqual({
      toolChoice: "none",
    });
  });
});
