import { describe, expect, it, vi } from "vite-plus/test";

const { runWorkspaceOrchestratorMock } = vi.hoisted(() => ({
  runWorkspaceOrchestratorMock: vi.fn(async (): Promise<unknown> => {
    class OkResult {
      readonly ok = true;

      constructor(readonly value: { runId: string; status: "succeeded" }) {}
    }

    return new OkResult({
      runId: "run-1",
      status: "succeeded" as const,
      planTools: [],
      stepResults: {},
    });
  }),
}));

vi.mock("@/agents/automations/workspace/agent/run-workspace-orchestrator", () => ({
  runWorkspaceOrchestrator: runWorkspaceOrchestratorMock,
}));

import { executeWorkspaceAutomationStep } from "./workspace-automation-execution";

describe("executeWorkspaceAutomationStep", () => {
  it("delegates to the workspace orchestrator runtime", async () => {
    runWorkspaceOrchestratorMock.mockClear();

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

  it("returns a plain object when the orchestrator returns an error result", async () => {
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
