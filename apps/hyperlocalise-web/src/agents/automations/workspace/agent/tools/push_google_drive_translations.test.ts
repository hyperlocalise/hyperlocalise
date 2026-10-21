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
import { createPushGoogleDriveTranslationsTool } from "./push_google_drive_translations";

const mocks = vi.hoisted(() => ({
  runPushGoogleDriveTranslations: vi.fn(),
  updateWorkspaceAutomationRun: vi.fn(),
}));

vi.mock("@/lib/google-drive/push-google-drive-translations", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/google-drive/push-google-drive-translations")>();
  return {
    ...actual,
    runPushGoogleDriveTranslations: (...args: unknown[]) =>
      mocks.runPushGoogleDriveTranslations(...args),
  };
});

vi.mock("@/lib/agents/workspace-automations", () => ({
  updateWorkspaceAutomationRun: (...args: unknown[]) => mocks.updateWorkspaceAutomationRun(...args),
}));

function session(
  overrides: {
    toolConfig?: WorkspaceAutomationRecord["toolConfig"];
    inputSnapshot?: Record<string, unknown>;
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
    inputSnapshot: overrides.inputSnapshot ?? {},
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
    plan: { tools: ["push_google_drive_translations"] },
    repository: null,
    composedInstructions: "",
    stepResults: {},
    terminalStatus: null,
    terminalError: null,
  };
}

const toolOptions = { toolCallId: "call-1", messages: [], context: {} };

describe("createPushGoogleDriveTranslationsTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.updateWorkspaceAutomationRun.mockResolvedValue(undefined);
  });

  it("rejects when Google Drive push is not configured", async () => {
    await expect(
      createPushGoogleDriveTranslationsTool(session({ toolConfig: {} })).execute!({}, toolOptions),
    ).rejects.toThrow("push_google_drive_translations_not_configured");
    expect(mocks.runPushGoogleDriveTranslations).not.toHaveBeenCalled();
  });

  it("marks the run failed when every locale push fails", async () => {
    mocks.runPushGoogleDriveTranslations.mockResolvedValue({
      pushed: 0,
      skipped: 0,
      failed: 2,
    });
    const current = session({
      inputSnapshot: { sourcePaths: ["google-drive/folder/overview.docx", ""] },
    });

    await expect(
      createPushGoogleDriveTranslationsTool(current).execute!(
        { summary: "  nightly  " },
        toolOptions,
      ),
    ).resolves.toEqual({
      pushed: 0,
      skipped: 0,
      failed: 2,
      summary: "nightly",
    });

    expect(current.terminalStatus).toBe("failed");
    expect(current.terminalError).toBe("google_drive_push_failed");
    expect(mocks.runPushGoogleDriveTranslations).toHaveBeenCalledWith({
      organizationId: "org-1",
      automation: current.automation,
      sourcePaths: ["google-drive/folder/overview.docx"],
    });
    expect(mocks.updateWorkspaceAutomationRun).toHaveBeenCalledWith({
      runId: "run-1",
      organizationId: "org-1",
      outputSummary: {
        pushGoogleDriveTranslations: {
          pushed: 0,
          skipped: 0,
          failed: 2,
          summary: "nightly",
        },
      },
    });
  });

  it("does not fail the run when some locales pushed", async () => {
    mocks.runPushGoogleDriveTranslations.mockResolvedValue({
      pushed: 1,
      skipped: 0,
      failed: 1,
    });
    const current = session();

    await expect(
      createPushGoogleDriveTranslationsTool(current).execute!({}, toolOptions),
    ).resolves.toEqual({
      pushed: 1,
      skipped: 0,
      failed: 1,
    });

    expect(current.terminalStatus).toBeNull();
    expect(current.terminalError).toBeNull();
  });
});
