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
  WorkspaceAutomationRecord,
  WorkspaceAutomationRunRecord,
} from "@/lib/agents/workspace-automation-types";

import type { WorkspaceOrchestratorSession } from "../context";
import { createImportWebflowItemsTool } from "./import_webflow_items";

const mocks = vi.hoisted(() => ({
  runImportWebflowItems: vi.fn(),
  updateWorkspaceAutomationRun: vi.fn(),
}));

vi.mock("@/lib/webflow/import-webflow-items", () => ({
  runImportWebflowItems: (...args: unknown[]) => mocks.runImportWebflowItems(...args),
}));

vi.mock("@/lib/agents/workspace-automations", () => ({
  updateWorkspaceAutomationRun: (...args: unknown[]) => mocks.updateWorkspaceAutomationRun(...args),
}));

function session(
  overrides: {
    toolConfig?: WorkspaceAutomationRecord["toolConfig"];
  } = {},
): WorkspaceOrchestratorSession {
  const automation = {
    id: "automation-1",
    organizationId: "org-1",
    authorUserId: "user-1",
    status: "active",
    name: "Webflow items",
    instructions: "",
    projectId: "project-1",
    triggerConfig: {
      mode: "scheduled",
      schedule: { cadence: "daily", hourUtc: 9, timezone: "UTC" },
    },
    repositoryTarget: { kind: "none" },
    toolConfig: overrides.toolConfig ?? {
      webflow: {
        enabled: true,
        connectionId: "11111111-1111-1111-1111-111111111111",
        siteId: "site-1",
        collectionIds: ["col-1"],
        sourceLocale: "en",
        targetLocales: ["fr"],
        existingTranslationPolicy: "seed_empty",
        runQa: true,
        publishOnPush: false,
      },
    },
    model: "openai/gpt-6-luna",
    configVersion: 1,
    nextRunAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } satisfies WorkspaceAutomationRecord;

  const run = {
    id: "run-1",
    automationId: automation.id,
    organizationId: automation.organizationId,
    triggerSource: "scheduled",
    status: "running",
    inputSnapshot: {},
    outputSummary: {},
    error: null,
    githubRepositoryAutomationJobId: null,
    idempotencyKey: null,
    startedAt: null,
    completedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } satisfies WorkspaceAutomationRunRecord;

  return {
    organizationId: automation.organizationId,
    automation,
    run,
    plan: { tools: ["import_webflow_items"] },
    repository: null,
    composedInstructions: "",
    stepResults: {},
    terminalStatus: null,
    terminalError: null,
  };
}

const toolOptions = { toolCallId: "call-1", messages: [], context: {} };

describe("createImportWebflowItemsTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.updateWorkspaceAutomationRun.mockResolvedValue(undefined);
  });

  it("rejects when Webflow import is not configured", async () => {
    await expect(
      createImportWebflowItemsTool(session({ toolConfig: {} })).execute!({}, toolOptions),
    ).rejects.toThrow("import_webflow_items_not_configured");
    expect(mocks.runImportWebflowItems).not.toHaveBeenCalled();
  });

  it("marks the run failed when every item import fails", async () => {
    mocks.runImportWebflowItems.mockResolvedValue({
      imported: 0,
      skipped: 0,
      failed: 3,
      jobsCreated: 0,
    });
    const current = session();

    await expect(
      createImportWebflowItemsTool(current).execute!({ summary: "  weekly  " }, toolOptions),
    ).resolves.toEqual({
      imported: 0,
      skipped: 0,
      failed: 3,
      jobsCreated: 0,
      summary: "weekly",
    });

    expect(current.terminalStatus).toBe("failed");
    expect(current.terminalError).toBe("webflow_import_failed");
    expect(mocks.runImportWebflowItems).toHaveBeenCalledWith({
      organizationId: "org-1",
      automation: current.automation,
      workflowRunId: "run-1",
    });
  });

  it("keeps a partial import from failing the run", async () => {
    mocks.runImportWebflowItems.mockResolvedValue({
      imported: 1,
      skipped: 0,
      failed: 2,
      jobsCreated: 1,
    });
    const current = session();

    await expect(createImportWebflowItemsTool(current).execute!({}, toolOptions)).resolves.toEqual({
      imported: 1,
      skipped: 0,
      failed: 2,
      jobsCreated: 1,
    });
    expect(current.terminalStatus).toBeNull();
  });
});
