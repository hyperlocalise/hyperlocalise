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

import { getGoogleDrivePushEligibility, isGoogleDrivePushRunActive } from "./push-eligibility";

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
    ...overrides,
  };
}

describe("isGoogleDrivePushRunActive", () => {
  it("is true only for queued or running push_approved runs", () => {
    expect(
      isGoogleDrivePushRunActive([
        { status: "queued", inputSnapshot: { operation: "push_approved" } },
      ]),
    ).toBe(true);
    expect(
      isGoogleDrivePushRunActive([
        { status: "running", inputSnapshot: { operation: "push_approved" } },
      ]),
    ).toBe(true);
    expect(
      isGoogleDrivePushRunActive([{ status: "queued", inputSnapshot: { operation: "import" } }]),
    ).toBe(false);
    expect(
      isGoogleDrivePushRunActive([
        { status: "completed", inputSnapshot: { operation: "push_approved" } },
      ]),
    ).toBe(false);
    expect(isGoogleDrivePushRunActive([{ status: "queued", inputSnapshot: {} }])).toBe(false);
    expect(isGoogleDrivePushRunActive([{ status: "queued" }])).toBe(false);
  });
});

describe("getGoogleDrivePushEligibility", () => {
  it("returns null when Google Drive is not enabled", async () => {
    await expect(
      getGoogleDrivePushEligibility({
        organizationId: "org-1",
        automation: automation({
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
      }),
    ).resolves.toBeNull();
  });

  it("returns an empty eligibility object when the project is missing", async () => {
    await expect(
      getGoogleDrivePushEligibility({
        organizationId: "org-1",
        automation: automation({ projectId: null }),
      }),
    ).resolves.toEqual({ eligibleLocaleCount: 0, mappedFileCount: 0, files: [] });
  });
});
