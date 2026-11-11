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
import { createImportLoopsEmailsTool } from "./import_loops_emails";

const mocks = vi.hoisted(() => ({
  runImportLoopsEmails: vi.fn(),
  updateWorkspaceAutomationRun: vi.fn(),
}));

vi.mock("@/lib/loops/import-loops-emails", () => ({
  runImportLoopsEmails: (...args: unknown[]) => mocks.runImportLoopsEmails(...args),
}));

vi.mock("@/lib/agents/workspace-automations", () => ({
  updateWorkspaceAutomationRun: (...args: unknown[]) => mocks.updateWorkspaceAutomationRun(...args),
}));

function session(
  overrides: {
    toolConfig?: WorkspaceAutomationRecord["toolConfig"];
    outputSummary?: Record<string, unknown>;
  } = {},
): WorkspaceOrchestratorSession {
  const automation = {
    id: "automation-1",
    organizationId: "org-1",
    authorUserId: "user-1",
    status: "active",
    name: "Loops emails",
    instructions: "",
    projectId: "project-1",
    triggerConfig: {
      mode: "scheduled",
      schedule: { cadence: "daily", hourUtc: 9, timezone: "UTC" },
    },
    repositoryTarget: { kind: "none" },
    toolConfig: overrides.toolConfig ?? {
      loops: {
        enabled: true,
        sourceLocale: "en",
        transactionalIds: ["txn-1"],
        campaignIds: [],
        workflowIds: [],
        existingTranslationPolicy: "seed_empty",
        overwriteWhenRemoteNewer: true,
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
    outputSummary: overrides.outputSummary ?? {},
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
    plan: { tools: ["import_loops_emails"] },
    repository: null,
    composedInstructions: "",
    stepResults: {},
    terminalStatus: null,
    terminalError: null,
  };
}

const toolOptions = { toolCallId: "call-1", messages: [], context: {} };

describe("createImportLoopsEmailsTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.updateWorkspaceAutomationRun.mockResolvedValue(undefined);
  });

  it("rejects when Loops import is not configured", async () => {
    await expect(
      createImportLoopsEmailsTool(session({ toolConfig: {} })).execute!({}, toolOptions),
    ).rejects.toThrow("import_loops_emails_not_configured");
    await expect(
      createImportLoopsEmailsTool(
        session({
          toolConfig: {
            loops: {
              enabled: false,
              sourceLocale: "en",
              transactionalIds: [],
              campaignIds: [],
              workflowIds: [],
              existingTranslationPolicy: "seed_empty",
              overwriteWhenRemoteNewer: true,
            },
          },
        }),
      ).execute!({}, toolOptions),
    ).rejects.toThrow("import_loops_emails_not_configured");
    expect(mocks.runImportLoopsEmails).not.toHaveBeenCalled();
  });

  it("returns a persisted import result without calling Loops again", async () => {
    const current = session({
      outputSummary: { importLoopsEmails: { imported: 2, skipped: 1, failed: 0 } },
    });

    await expect(createImportLoopsEmailsTool(current).execute!({}, toolOptions)).resolves.toEqual({
      imported: 2,
      skipped: 1,
      failed: 0,
    });

    expect(current.stepResults.import_loops_emails).toEqual({
      imported: 2,
      skipped: 1,
      failed: 0,
    });
    expect(mocks.runImportLoopsEmails).not.toHaveBeenCalled();
    expect(mocks.updateWorkspaceAutomationRun).not.toHaveBeenCalled();
  });

  it("marks the run failed when every email import fails", async () => {
    mocks.runImportLoopsEmails.mockResolvedValue({
      imported: 0,
      skipped: 0,
      failed: 3,
      jobsCreated: 0,
      jobIds: [],
    });
    const current = session();

    await expect(
      createImportLoopsEmailsTool(current).execute!({ summary: "  weekly  " }, toolOptions),
    ).resolves.toEqual({
      imported: 0,
      skipped: 0,
      failed: 3,
      jobsCreated: 0,
      jobIds: [],
      summary: "weekly",
    });

    expect(current.terminalStatus).toBe("failed");
    expect(current.terminalError).toBe("loops_import_failed");
    expect(mocks.runImportLoopsEmails).toHaveBeenCalledWith({
      organizationId: "org-1",
      automation: current.automation,
      workflowRunId: "run-1",
    });
    expect(mocks.updateWorkspaceAutomationRun).toHaveBeenCalledWith({
      runId: "run-1",
      organizationId: "org-1",
      outputSummary: {
        importLoopsEmails: {
          imported: 0,
          skipped: 0,
          failed: 3,
          jobsCreated: 0,
          jobIds: [],
          summary: "weekly",
        },
      },
    });
  });

  it("keeps a partial import from failing the run", async () => {
    mocks.runImportLoopsEmails.mockResolvedValue({
      imported: 1,
      skipped: 0,
      failed: 2,
      jobsCreated: 1,
      jobIds: ["job-1"],
    });
    const current = session();

    await expect(createImportLoopsEmailsTool(current).execute!({}, toolOptions)).resolves.toEqual({
      imported: 1,
      skipped: 0,
      failed: 2,
      jobsCreated: 1,
      jobIds: ["job-1"],
    });
    expect(current.terminalStatus).toBeNull();
    expect(current.terminalError).toBeNull();
  });
});
