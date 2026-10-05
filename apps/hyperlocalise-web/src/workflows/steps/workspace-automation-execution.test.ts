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

import type {
  WorkspaceOrchestratorExecutionSuccess,
  WorkspaceOrchestratorPrepared,
} from "@/agents/automations/workspace/agent/run-workspace-orchestrator";

class OkResult<T> {
  readonly ok = true;

  constructor(readonly value: T) {}
}

class ErrResult<E> {
  readonly ok = false;

  constructor(readonly error: E) {}
}

const {
  prepareWorkspaceOrchestratorRunMock,
  completeWorkspaceOrchestratorRunMock,
  getWorkspaceAutomationRunByIdMock,
  getWorkspaceAutomationByIdMock,
  executeContentSyncRunMock,
} = vi.hoisted(() => ({
  prepareWorkspaceOrchestratorRunMock: vi.fn(async (): Promise<unknown> => null),
  completeWorkspaceOrchestratorRunMock: vi.fn(async (): Promise<unknown> => null),
  getWorkspaceAutomationRunByIdMock: vi.fn(async (): Promise<unknown> => null),
  getWorkspaceAutomationByIdMock: vi.fn(async (): Promise<unknown> => null),
  executeContentSyncRunMock: vi.fn(async () => ({
    ok: true,
    value: {
      runId: "run-1",
      status: "succeeded",
      planTools: ["content_sync"],
      stepResults: {},
    },
  })),
}));

vi.mock("@/agents/automations/workspace/agent/run-workspace-orchestrator", () => ({
  prepareWorkspaceOrchestratorRun: prepareWorkspaceOrchestratorRunMock,
  completeWorkspaceOrchestratorRun: completeWorkspaceOrchestratorRunMock,
}));

vi.mock("@/lib/agents/workspace-automations", () => ({
  getWorkspaceAutomationRunById: getWorkspaceAutomationRunByIdMock,
  getWorkspaceAutomationById: getWorkspaceAutomationByIdMock,
}));

vi.mock("@/lib/agents/content-sync/execute-content-sync", () => ({
  executeContentSyncRun: executeContentSyncRunMock,
}));

import {
  completeWorkspaceAutomationStep,
  prepareWorkspaceAutomationStep,
} from "./workspace-automation-execution";

const event = { workspaceAutomationRunId: "run-1", organizationId: "org-1" };
const emptyState = { stepResults: {}, terminalStatus: null, terminalError: null };

const readyPrepared: WorkspaceOrchestratorPrepared = {
  kind: "ready",
  runId: "run-1",
  model: "anthropic/claude-sonnet-5",
  instructions: "instructions",
  userMessage: "message",
  maxOutputTokens: 1000,
  planTools: ["notify_slack"],
  toolSpecs: [{ name: "notify_slack", description: "Notify", inputJsonSchema: {} }],
};

beforeEach(() => {
  vi.clearAllMocks();
  getWorkspaceAutomationRunByIdMock.mockResolvedValue(null);
  getWorkspaceAutomationByIdMock.mockResolvedValue(null);
});

describe("prepareWorkspaceAutomationStep", () => {
  it("delegates to the workspace orchestrator and returns a plain object", async () => {
    prepareWorkspaceOrchestratorRunMock.mockResolvedValueOnce(new OkResult(readyPrepared));

    const result = await prepareWorkspaceAutomationStep(event);

    expect(prepareWorkspaceOrchestratorRunMock).toHaveBeenCalledWith(event);
    expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
    expect(result).toEqual({ ok: true, value: readyPrepared });
  });

  it("runs content sync automations to completion without the orchestrator", async () => {
    getWorkspaceAutomationRunByIdMock.mockResolvedValue({ automationId: "automation-1" });
    getWorkspaceAutomationByIdMock.mockResolvedValue({ kind: "content_sync" });

    const result = await prepareWorkspaceAutomationStep(event);

    expect(executeContentSyncRunMock).toHaveBeenCalledWith({
      organizationId: "org-1",
      workspaceAutomationRunId: "run-1",
    });
    expect(prepareWorkspaceOrchestratorRunMock).not.toHaveBeenCalled();
    expect(result.ok && result.value.kind === "completed" && result.value.result.planTools).toEqual(
      ["content_sync"],
    );
  });

  it("returns a plain error when the orchestrator returns an error result", async () => {
    prepareWorkspaceOrchestratorRunMock.mockResolvedValueOnce(
      new ErrResult({
        code: "workspace_orchestrator_failed",
        message: "Orchestrator failed",
        runId: "run-1",
      }),
    );

    const result = await prepareWorkspaceAutomationStep(event);

    expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
    expect(result).toEqual({
      ok: false,
      error: {
        code: "workspace_orchestrator_failed",
        message: "Orchestrator failed",
        runId: "run-1",
      },
    });
  });

  it("returns a plain error when preparation throws", async () => {
    prepareWorkspaceOrchestratorRunMock.mockRejectedValueOnce(new Error("Runtime unavailable"));

    const result = await prepareWorkspaceAutomationStep(event);

    expect(result).toEqual({
      ok: false,
      error: {
        code: "workspace_orchestrator_failed",
        message: "Runtime unavailable",
        runId: "run-1",
      },
    });
  });
});

describe("completeWorkspaceAutomationStep", () => {
  it("passes tool state and usage through and returns a plain object", async () => {
    const success: WorkspaceOrchestratorExecutionSuccess = {
      runId: "run-1",
      status: "succeeded",
      planTools: ["notify_slack"],
      stepResults: {},
    };
    completeWorkspaceOrchestratorRunMock.mockResolvedValueOnce(new OkResult(success));
    const usage = { inputTokens: 10, outputTokens: 5, totalTokens: 15 };

    const result = await completeWorkspaceAutomationStep({
      event,
      planTools: ["notify_slack"],
      state: emptyState,
      usage,
    });

    expect(completeWorkspaceOrchestratorRunMock).toHaveBeenCalledWith({
      ...event,
      planTools: ["notify_slack"],
      state: emptyState,
      usage,
    });
    expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
    expect(result).toEqual({ ok: true, value: success });
  });
});
