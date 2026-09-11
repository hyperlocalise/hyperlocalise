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

import type { WorkspaceOrchestratorExecutionSuccess } from "@/agents/automations/workspace/agent/run-workspace-orchestrator";

const {
  runWorkspaceOrchestratorMock,
  getWorkspaceAutomationRunByIdMock,
  getWorkspaceAutomationByIdMock,
  executeContentSyncRunMock,
} = vi.hoisted(() => ({
  runWorkspaceOrchestratorMock: vi.fn(async (): Promise<unknown> => {
    class OkResult {
      readonly ok = true;

      constructor(readonly value: WorkspaceOrchestratorExecutionSuccess) {}
    }

    return new OkResult({
      runId: "run-1",
      status: "succeeded" as const,
      planTools: [],
      stepResults: {},
    });
  }),
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
  runWorkspaceOrchestrator: runWorkspaceOrchestratorMock,
}));

vi.mock("@/lib/agents/workspace-automations", () => ({
  getWorkspaceAutomationRunById: getWorkspaceAutomationRunByIdMock,
  getWorkspaceAutomationById: getWorkspaceAutomationByIdMock,
}));

vi.mock("@/lib/agents/content-sync/execute-content-sync", () => ({
  executeContentSyncRun: executeContentSyncRunMock,
}));

import { executeWorkspaceAutomationStep } from "./workspace-automation-execution";

describe("executeWorkspaceAutomationStep", () => {
  it("delegates to the workspace orchestrator runtime", async () => {
    getWorkspaceAutomationRunByIdMock.mockReset();
    getWorkspaceAutomationByIdMock.mockReset();
    getWorkspaceAutomationRunByIdMock.mockResolvedValue(null);
    runWorkspaceOrchestratorMock.mockClear();
    executeContentSyncRunMock.mockClear();

    const result = await executeWorkspaceAutomationStep({
      workspaceAutomationRunId: "run-1",
      organizationId: "org-1",
    });

    expect(runWorkspaceOrchestratorMock).toHaveBeenCalledWith({
      workspaceAutomationRunId: "run-1",
      organizationId: "org-1",
    });
    expect(result.ok).toBe(true);
    expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
    if (result.ok) {
      expect(result.value.status).toBe("succeeded");
    }
  });

  it("delegates content sync automations to the content sync runtime", async () => {
    getWorkspaceAutomationRunByIdMock.mockReset();
    getWorkspaceAutomationByIdMock.mockReset();
    getWorkspaceAutomationRunByIdMock.mockResolvedValue({
      automationId: "automation-1",
    });
    getWorkspaceAutomationByIdMock.mockResolvedValue({
      kind: "content_sync",
    });
    runWorkspaceOrchestratorMock.mockClear();
    executeContentSyncRunMock.mockClear();

    const result = await executeWorkspaceAutomationStep({
      workspaceAutomationRunId: "run-1",
      organizationId: "org-1",
    });

    expect(executeContentSyncRunMock).toHaveBeenCalledWith({
      organizationId: "org-1",
      workspaceAutomationRunId: "run-1",
    });
    expect(runWorkspaceOrchestratorMock).not.toHaveBeenCalled();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.planTools).toEqual(["content_sync"]);
    }
  });

  it("returns a plain object when the orchestrator returns an error result", async () => {
    getWorkspaceAutomationRunByIdMock.mockReset();
    getWorkspaceAutomationByIdMock.mockReset();
    getWorkspaceAutomationRunByIdMock.mockResolvedValue(null);
    runWorkspaceOrchestratorMock.mockClear();
    class ErrResult {
      readonly ok = false;

      constructor(
        readonly error: {
          code: "workspace_orchestrator_failed";
          message: string;
          runId: string;
        },
      ) {}
    }

    runWorkspaceOrchestratorMock.mockResolvedValueOnce(
      new ErrResult({
        code: "workspace_orchestrator_failed",
        message: "Orchestrator failed",
        runId: "run-1",
      }),
    );

    const result = await executeWorkspaceAutomationStep({
      workspaceAutomationRunId: "run-1",
      organizationId: "org-1",
    });

    expect(result.ok).toBe(false);
    expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
    if (!result.ok) {
      expect(result.error).toEqual({
        code: "workspace_orchestrator_failed",
        message: "Orchestrator failed",
        runId: "run-1",
      });
    }
  });

  it("returns a plain object when the orchestrator throws", async () => {
    getWorkspaceAutomationRunByIdMock.mockReset();
    getWorkspaceAutomationByIdMock.mockReset();
    getWorkspaceAutomationRunByIdMock.mockResolvedValue(null);
    runWorkspaceOrchestratorMock.mockClear();
    runWorkspaceOrchestratorMock.mockRejectedValueOnce(new Error("Runtime unavailable"));

    const result = await executeWorkspaceAutomationStep({
      workspaceAutomationRunId: "run-1",
      organizationId: "org-1",
    });

    expect(result.ok).toBe(false);
    expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
    if (!result.ok) {
      expect(result.error).toEqual({
        code: "workspace_orchestrator_failed",
        message: "Runtime unavailable",
        runId: "run-1",
      });
    }
  });
});
