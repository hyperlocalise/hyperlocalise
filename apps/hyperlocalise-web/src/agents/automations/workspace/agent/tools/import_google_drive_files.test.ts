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
import { createImportGoogleDriveFilesTool } from "./import_google_drive_files";

const mocks = vi.hoisted(() => ({
  runImportGoogleDriveFiles: vi.fn(),
  updateWorkspaceAutomationRun: vi.fn(),
}));

vi.mock("@/lib/google-drive/import-google-drive-files", () => ({
  runImportGoogleDriveFiles: (...args: unknown[]) => mocks.runImportGoogleDriveFiles(...args),
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
    name: "Google Drive files",
    instructions: "",
    projectId: "project-1",
    triggerConfig: {
      mode: "scheduled",
      schedule: { cadence: "daily", hourUtc: 9, timezone: "UTC" },
    },
    repositoryTarget: { kind: "none" },
    toolConfig: overrides.toolConfig ?? {
      googleDrive: {
        enabled: true,
        workosUserId: "user-1",
        folderIds: ["11111111-1111-1111-1111-111111111111"],
        fileIds: [],
        targetLocales: ["vi-VN"],
        includeTranslatedFiles: false,
        translationOutput: "folder",
        existingTranslationPolicy: "seed_empty",
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
    plan: { tools: ["import_google_drive_files"] },
    repository: null,
    composedInstructions: "",
    stepResults: {},
    terminalStatus: null,
    terminalError: null,
  };
}

const toolOptions = { toolCallId: "call-1", messages: [], context: {} };

describe("createImportGoogleDriveFilesTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.updateWorkspaceAutomationRun.mockResolvedValue(undefined);
  });

  it("rejects when Google Drive import is not configured", async () => {
    await expect(
      createImportGoogleDriveFilesTool(session({ toolConfig: {} })).execute!({}, toolOptions),
    ).rejects.toThrow("import_google_drive_files_not_configured");
    await expect(
      createImportGoogleDriveFilesTool(
        session({
          toolConfig: {
            googleDrive: {
              enabled: false,
              folderIds: [],
              fileIds: [],
              targetLocales: [],
              includeTranslatedFiles: false,
              translationOutput: "folder",
              existingTranslationPolicy: "seed_empty",
            },
          },
        }),
      ).execute!({}, toolOptions),
    ).rejects.toThrow("import_google_drive_files_not_configured");
    expect(mocks.runImportGoogleDriveFiles).not.toHaveBeenCalled();
  });

  it("marks the run failed when every file import fails", async () => {
    mocks.runImportGoogleDriveFiles.mockResolvedValue({
      imported: 0,
      skipped: 0,
      failed: 3,
      truncated: 0,
    });
    const current = session();

    await expect(
      createImportGoogleDriveFilesTool(current).execute!({ summary: "  weekly  " }, toolOptions),
    ).resolves.toEqual({
      imported: 0,
      skipped: 0,
      failed: 3,
      truncated: 0,
      summary: "weekly",
    });

    expect(current.terminalStatus).toBe("failed");
    expect(current.terminalError).toBe("google_drive_import_failed");
    expect(mocks.runImportGoogleDriveFiles).toHaveBeenCalledWith({
      organizationId: "org-1",
      automation: current.automation,
      workflowRunId: "run-1",
    });
    expect(mocks.updateWorkspaceAutomationRun).toHaveBeenCalledWith({
      runId: "run-1",
      organizationId: "org-1",
      outputSummary: {
        importGoogleDriveFiles: {
          imported: 0,
          skipped: 0,
          failed: 3,
          truncated: 0,
          summary: "weekly",
        },
      },
    });
  });

  it("does not fail the run when some files imported", async () => {
    mocks.runImportGoogleDriveFiles.mockResolvedValue({
      imported: 1,
      skipped: 0,
      failed: 2,
      truncated: 0,
    });
    const current = session();

    await expect(
      createImportGoogleDriveFilesTool(current).execute!({}, toolOptions),
    ).resolves.toEqual({
      imported: 1,
      skipped: 0,
      failed: 2,
      truncated: 0,
    });

    expect(current.terminalStatus).toBeNull();
    expect(current.terminalError).toBeNull();
    expect(current.stepResults.import_google_drive_files).toEqual({
      imported: 1,
      skipped: 0,
      failed: 2,
      truncated: 0,
    });
  });
});
