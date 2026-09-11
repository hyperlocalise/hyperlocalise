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

import { isErr, isOk } from "@/lib/primitives/result/results";

const mocks = vi.hoisted(() => ({
  getWorkspaceAutomationRunById: vi.fn(),
  getWorkspaceAutomationById: vi.fn(),
  updateWorkspaceAutomationRun: vi.fn(),
  executeGithubContentSync: vi.fn(),
}));

vi.mock("@/lib/agents/workspace-automations", () => ({
  getWorkspaceAutomationRunById: (...args: unknown[]) =>
    mocks.getWorkspaceAutomationRunById(...args),
  getWorkspaceAutomationById: (...args: unknown[]) => mocks.getWorkspaceAutomationById(...args),
  updateWorkspaceAutomationRun: (...args: unknown[]) => mocks.updateWorkspaceAutomationRun(...args),
}));

vi.mock("./execute-github-content-sync", () => ({
  executeGithubContentSync: (...args: unknown[]) => mocks.executeGithubContentSync(...args),
}));

vi.mock("@/lib/log", () => ({
  createLogger: () => ({
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }),
}));

import { executeContentSyncRun } from "./execute-content-sync";

const RUN_ID = "run-1";
const ORG_ID = "org-1";
const AUTOMATION_ID = "automation-1";

function contentSyncAutomation(overrides?: Record<string, unknown>) {
  return {
    id: AUTOMATION_ID,
    kind: "content_sync",
    projectId: "project-1",
    syncConfig: {
      provider: "github",
      connectionId: "22222222-2222-4222-8222-222222222222",
      resourceKey: "acme/web",
      providerFolder: "locales",
      projectFolder: "github/acme/web",
    },
    ...overrides,
  };
}

describe("executeContentSyncRun", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.updateWorkspaceAutomationRun.mockResolvedValue(undefined);
  });

  it("returns workspace_automation_run_not_found when the run is missing", async () => {
    mocks.getWorkspaceAutomationRunById.mockResolvedValue(null);

    const result = await executeContentSyncRun({
      organizationId: ORG_ID,
      workspaceAutomationRunId: RUN_ID,
    });

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error).toMatchObject({
        code: "workspace_automation_run_not_found",
        runId: RUN_ID,
      });
    }
    expect(mocks.updateWorkspaceAutomationRun).not.toHaveBeenCalled();
  });

  it("returns workspace_automation_not_found for non content-sync automations", async () => {
    mocks.getWorkspaceAutomationRunById.mockResolvedValue({
      id: RUN_ID,
      automationId: AUTOMATION_ID,
    });
    mocks.getWorkspaceAutomationById.mockResolvedValue({
      id: AUTOMATION_ID,
      kind: "agent",
      syncConfig: null,
    });

    const result = await executeContentSyncRun({
      organizationId: ORG_ID,
      workspaceAutomationRunId: RUN_ID,
    });

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.code).toBe("workspace_automation_not_found");
    }
  });

  it("marks the run failed when the automation has no project", async () => {
    mocks.getWorkspaceAutomationRunById.mockResolvedValue({
      id: RUN_ID,
      automationId: AUTOMATION_ID,
    });
    mocks.getWorkspaceAutomationById.mockResolvedValue(contentSyncAutomation({ projectId: "   " }));

    const result = await executeContentSyncRun({
      organizationId: ORG_ID,
      workspaceAutomationRunId: RUN_ID,
    });

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error).toMatchObject({
        code: "workspace_orchestrator_failed",
        message: "Choose a Hyperlocalise project.",
        runId: RUN_ID,
      });
    }
    expect(mocks.updateWorkspaceAutomationRun).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: RUN_ID,
        status: "failed",
        error: { code: "project_required", message: "Choose a Hyperlocalise project." },
      }),
    );
  });

  it("marks the run failed when the provider is not ready", async () => {
    mocks.getWorkspaceAutomationRunById.mockResolvedValue({
      id: RUN_ID,
      automationId: AUTOMATION_ID,
    });
    mocks.getWorkspaceAutomationById.mockResolvedValue(
      contentSyncAutomation({
        syncConfig: {
          provider: "contentful",
          connectionId: "22222222-2222-4222-8222-222222222222",
          resourceKey: "space-1",
          providerFolder: "",
          projectFolder: "contentful/space-1",
        },
      }),
    );

    const result = await executeContentSyncRun({
      organizationId: ORG_ID,
      workspaceAutomationRunId: RUN_ID,
    });

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.code).toBe("workspace_orchestrator_failed");
      expect(result.error.message).toContain("contentful");
    }
    expect(mocks.updateWorkspaceAutomationRun).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "running",
      }),
    );
    expect(mocks.updateWorkspaceAutomationRun).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "failed",
        error: expect.objectContaining({ code: "content_sync_provider_not_ready" }),
      }),
    );
  });

  it("marks the run failed when the GitHub sync throws", async () => {
    mocks.getWorkspaceAutomationRunById.mockResolvedValue({
      id: RUN_ID,
      automationId: AUTOMATION_ID,
    });
    mocks.getWorkspaceAutomationById.mockResolvedValue(contentSyncAutomation());
    mocks.executeGithubContentSync.mockRejectedValue(new Error("sandbox boom"));

    const result = await executeContentSyncRun({
      organizationId: ORG_ID,
      workspaceAutomationRunId: RUN_ID,
    });

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error).toMatchObject({
        code: "workspace_orchestrator_failed",
        message: "sandbox boom",
      });
    }
    expect(mocks.updateWorkspaceAutomationRun).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "failed",
        error: { code: "content_sync_failed", message: "sandbox boom" },
      }),
    );
  });

  it("marks the run succeeded when GitHub sync returns ok", async () => {
    mocks.getWorkspaceAutomationRunById.mockResolvedValue({
      id: RUN_ID,
      automationId: AUTOMATION_ID,
    });
    mocks.getWorkspaceAutomationById.mockResolvedValue(contentSyncAutomation());
    mocks.executeGithubContentSync.mockResolvedValue({
      ok: true,
      value: { importedFiles: 2 },
    });

    const result = await executeContentSyncRun({
      organizationId: ORG_ID,
      workspaceAutomationRunId: RUN_ID,
    });

    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value).toMatchObject({
        runId: RUN_ID,
        status: "succeeded",
        planTools: ["content_sync"],
        stepResults: { importedFiles: 2 },
      });
    }
    expect(mocks.updateWorkspaceAutomationRun).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "succeeded",
        outputSummary: { importedFiles: 2 },
      }),
    );
  });
});
