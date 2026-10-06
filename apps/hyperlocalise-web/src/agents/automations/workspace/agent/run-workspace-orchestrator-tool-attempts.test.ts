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
import { jsonSchema, tool } from "ai";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { WorkspaceOrchestratorToolName } from "./plan";
import type { WorkspaceOrchestratorToolState } from "./run-workspace-orchestrator";

const mocks = vi.hoisted(() => ({
  getRun: vi.fn(),
  getAutomation: vi.fn(),
  updateRun: vi.fn(async () => undefined),
  claim: vi.fn(),
  settle: vi.fn(async () => undefined),
  execute: vi.fn(),
  completeUsage: vi.fn(async () => undefined),
}));

vi.mock("@/lib/agents/workspace-automations", () => ({
  getWorkspaceAutomationRunById: mocks.getRun,
  getWorkspaceAutomationById: mocks.getAutomation,
  updateWorkspaceAutomationRun: mocks.updateRun,
}));

vi.mock("@/lib/agents/workspace-automation-tool-attempts", () => ({
  claimWorkspaceAutomationToolAttempt: mocks.claim,
  settleWorkspaceAutomationToolAttempt: mocks.settle,
}));

vi.mock("@/lib/billing/agent-runtime-usage", () => ({
  beginAgentRuntimeUsage: vi.fn(async () => undefined),
  completeAgentRuntimeUsage: mocks.completeUsage,
  extractAiSdkTokenUsage: vi.fn(() => null),
}));

vi.mock("./compose-workspace-instructions", () => ({
  composeWorkspaceAutomationInstructions: vi.fn(() => "instructions"),
}));

vi.mock("./context", () => ({
  createWorkspaceOrchestratorSession: vi.fn(({ plan }: { plan: unknown }) => ({
    plan,
    composedInstructions: "instructions",
    stepResults: {},
    terminalStatus: null,
    terminalError: null,
  })),
}));

/** Each tool writes its step result into the session, as the real tools do. */
vi.mock("./build-workspace-orchestrator-tools", () => ({
  buildWorkspaceOrchestratorTools: vi.fn(
    (session: { stepResults: Record<string, Record<string, unknown>> }) =>
      Object.fromEntries(
        ["notify_slack", "list_issues"].map((name) => [
          name,
          tool({
            inputSchema: jsonSchema({ type: "object" }),
            execute: async (input: unknown) => {
              const output = await mocks.execute(name, input);
              session.stepResults[name] = { done: true };
              return output;
            },
          }),
        ]),
      ),
  ),
}));

import { buildWorkspaceOrchestratorTools } from "./build-workspace-orchestrator-tools";
import {
  completeWorkspaceOrchestratorRun,
  executeWorkspaceOrchestratorTool,
  failWorkspaceOrchestratorRun,
  prepareWorkspaceOrchestratorRun,
} from "./run-workspace-orchestrator";

const runInput = { workspaceAutomationRunId: "run-1", organizationId: "org-1" };
const emptyState: WorkspaceOrchestratorToolState = {
  stepResults: {},
  terminalStatus: null,
  terminalError: null,
};
const storedState: WorkspaceOrchestratorToolState = {
  stepResults: { notify_slack: { sent: true } },
  terminalStatus: null,
  terminalError: null,
};

function run(status = "running") {
  return {
    id: "run-1",
    automationId: "automation-1",
    status,
    triggerSource: "manual",
    inputSnapshot: {},
    outputSummary: {},
    startedAt: new Date().toISOString(),
  };
}

function executeTool(toolName: WorkspaceOrchestratorToolName, toolCallId?: string) {
  return executeWorkspaceOrchestratorTool({
    ...runInput,
    planTools: ["list_issues", "notify_slack"],
    toolName,
    toolInput: {},
    toolCallId,
    state: emptyState,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getRun.mockResolvedValue(run());
  mocks.getAutomation.mockResolvedValue({
    id: "automation-1",
    name: "Automation",
    repositoryTarget: { kind: "none" },
    skillIds: [],
    instructions: null,
    triggerConfig: { mode: "manual" },
  });
  mocks.claim.mockResolvedValue({ kind: "claimed" });
  mocks.execute.mockResolvedValue({ sent: true });
});

describe("executeWorkspaceOrchestratorTool at-most-once guard", () => {
  it("claims a side-effecting tool call before running it and records the outcome", async () => {
    const outcome = await executeTool("notify_slack");

    expect(mocks.claim).toHaveBeenCalledWith({
      runId: "run-1",
      organizationId: "org-1",
      toolCallId: "run-1:notify_slack",
      toolName: "notify_slack",
    });
    expect(mocks.execute).toHaveBeenCalledTimes(1);
    const state = { ...emptyState, stepResults: { notify_slack: { done: true } } };
    expect(mocks.settle).toHaveBeenCalledWith({
      runId: "run-1",
      toolCallId: "run-1:notify_slack",
      status: "succeeded",
      output: { result: { sent: true }, state },
    });
    expect(outcome).toEqual({ ok: true, output: { sent: true }, state });
  });

  it("replays a recorded success without repeating the side effect", async () => {
    mocks.claim.mockResolvedValue({
      kind: "succeeded",
      output: { result: { sent: true, ts: "1" }, state: storedState },
    });

    const outcome = await executeTool("notify_slack");

    expect(mocks.execute).not.toHaveBeenCalled();
    expect(mocks.settle).not.toHaveBeenCalled();
    expect(outcome).toEqual({ ok: true, output: { sent: true, ts: "1" }, state: storedState });
  });

  it("replays a recorded failure without repeating the side effect", async () => {
    mocks.claim.mockResolvedValue({
      kind: "failed",
      error: "slack_down",
      output: { state: storedState },
    });

    const outcome = await executeTool("notify_slack");

    expect(mocks.execute).not.toHaveBeenCalled();
    expect(outcome).toEqual({ ok: false, message: "slack_down", state: storedState });
  });

  it("does not repeat a call whose earlier attempt was interrupted mid-flight", async () => {
    mocks.claim.mockResolvedValue({ kind: "in_doubt" });

    const outcome = await executeTool("notify_slack");

    expect(mocks.execute).not.toHaveBeenCalled();
    expect(outcome).toMatchObject({
      ok: false,
      message: "notify_slack_outcome_unknown",
      state: { stepResults: { notify_slack: { outcomeUnknown: true } } },
    });
  });

  it("records a thrown tool error as a failed attempt", async () => {
    mocks.execute.mockRejectedValue(new Error("slack_down"));

    const outcome = await executeTool("notify_slack");

    expect(mocks.settle).toHaveBeenCalledWith(
      expect.objectContaining({ status: "failed", error: "slack_down" }),
    );
    expect(outcome).toMatchObject({ ok: false, message: "slack_down" });
  });

  it("runs retry-safe tools without the ledger", async () => {
    const outcome = await executeTool("list_issues");

    expect(mocks.claim).not.toHaveBeenCalled();
    expect(mocks.settle).not.toHaveBeenCalled();
    expect(mocks.execute).toHaveBeenCalledWith("list_issues", {});
    expect(outcome.ok).toBe(true);
  });

  it("runs a second call of the same tool when the model uses a different tool-call id", async () => {
    await executeTool("notify_slack", "call-a");
    await executeTool("notify_slack", "call-b");

    expect(mocks.claim).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ toolCallId: "call-a", toolName: "notify_slack" }),
    );
    expect(mocks.claim).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ toolCallId: "call-b", toolName: "notify_slack" }),
    );
    expect(mocks.execute).toHaveBeenCalledTimes(2);
  });
});

describe("prepareWorkspaceOrchestratorRun", () => {
  it("marks the run failed when planned tool specs cannot be built", async () => {
    mocks.getAutomation.mockResolvedValue({
      id: "automation-1",
      name: "Automation",
      repositoryTarget: { kind: "none" },
      skillIds: [],
      instructions: null,
      triggerConfig: { mode: "manual" },
      toolConfig: { slack: { enabled: true, channelId: "C123" } },
    });
    vi.mocked(buildWorkspaceOrchestratorTools).mockImplementationOnce(() => {
      throw new Error("schema_unavailable");
    });

    const result = await prepareWorkspaceOrchestratorRun(runInput);

    expect(result).toMatchObject({
      ok: false,
      error: { code: "workspace_orchestrator_failed", message: "schema_unavailable" },
    });
    expect(mocks.updateRun).toHaveBeenCalledWith(expect.objectContaining({ status: "running" }));
    expect(mocks.updateRun).toHaveBeenCalledWith(
      expect.objectContaining({ status: "failed", error: { message: "schema_unavailable" } }),
    );
  });
});

describe("workspace orchestrator cancellation", () => {
  it("refuses to start a tool once the run is cancelled", async () => {
    mocks.getRun.mockResolvedValue(run("cancelled"));

    const outcome = await executeTool("notify_slack");

    expect(mocks.claim).not.toHaveBeenCalled();
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(outcome).toEqual({
      ok: false,
      message: "workspace_automation_run_cancelled",
      state: emptyState,
      cancelled: true,
    });
  });

  it("keeps a cancelled run cancelled when the loop completes", async () => {
    mocks.getRun.mockResolvedValue(run("cancelled"));

    const result = await completeWorkspaceOrchestratorRun({
      ...runInput,
      planTools: ["notify_slack"],
      state: { ...emptyState, terminalStatus: "succeeded" },
      usage: undefined,
    });

    expect(result).toMatchObject({ ok: true, value: { status: "cancelled" } });
    expect(mocks.updateRun).toHaveBeenCalledWith(expect.objectContaining({ status: "cancelled" }));
    expect(mocks.completeUsage).toHaveBeenCalled();
  });

  it("does not overwrite a cancelled run with failed", async () => {
    mocks.getRun.mockResolvedValue(run("cancelled"));

    await failWorkspaceOrchestratorRun({ ...runInput, state: emptyState, message: "boom" });

    expect(mocks.updateRun).not.toHaveBeenCalled();
  });
});
