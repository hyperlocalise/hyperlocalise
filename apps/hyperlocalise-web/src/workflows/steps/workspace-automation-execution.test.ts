import { describe, expect, it, vi } from "vite-plus/test";

const { runWorkspaceOrchestratorMock } = vi.hoisted(() => ({
  runWorkspaceOrchestratorMock: vi.fn(async () => ({
    ok: true,
    value: { runId: "run-1", status: "succeeded" as const },
  })),
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
    if (result.ok) {
      expect(result.value.status).toBe("succeeded");
    }
  });
});
