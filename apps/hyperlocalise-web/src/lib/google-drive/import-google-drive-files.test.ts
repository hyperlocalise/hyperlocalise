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
import { describe, expect, it } from "vite-plus/test";

import type { WorkspaceAutomationRecord } from "@/lib/agents/workspace-automation-types";

import { runImportGoogleDriveFiles } from "./import-google-drive-files";

function automation(
  overrides: Partial<WorkspaceAutomationRecord> & {
    toolConfig?: WorkspaceAutomationRecord["toolConfig"];
  } = {},
): WorkspaceAutomationRecord {
  return {
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
        folderIds: [],
        fileIds: [],
        targetLocales: [],
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
    ...overrides,
  };
}

describe("runImportGoogleDriveFiles", () => {
  it("rejects when Google Drive is disabled or missing a WorkOS user", async () => {
    await expect(
      runImportGoogleDriveFiles({
        organizationId: "org-1",
        automation: automation({ toolConfig: {} }),
      }),
    ).rejects.toThrow("google_drive_not_configured");
    await expect(
      runImportGoogleDriveFiles({
        organizationId: "org-1",
        automation: automation({
          toolConfig: {
            googleDrive: {
              enabled: true,
              folderIds: ["11111111-1111-1111-1111-111111111111"],
              fileIds: [],
              targetLocales: [],
              includeTranslatedFiles: false,
              translationOutput: "folder",
              existingTranslationPolicy: "seed_empty",
            },
          },
        }),
      }),
    ).rejects.toThrow("google_drive_not_configured");
  });

  it("rejects when no folders or files are selected", async () => {
    await expect(
      runImportGoogleDriveFiles({
        organizationId: "org-1",
        automation: automation(),
      }),
    ).rejects.toThrow("google_drive_folders_required");
  });

  it("rejects when the automation has no project", async () => {
    await expect(
      runImportGoogleDriveFiles({
        organizationId: "org-1",
        automation: automation({
          projectId: null,
          toolConfig: {
            googleDrive: {
              enabled: true,
              workosUserId: "user-1",
              folderIds: ["11111111-1111-1111-1111-111111111111"],
              fileIds: [],
              targetLocales: [],
              includeTranslatedFiles: false,
              translationOutput: "folder",
              existingTranslationPolicy: "seed_empty",
            },
          },
        }),
      }),
    ).rejects.toThrow("project_not_found");
  });
});
