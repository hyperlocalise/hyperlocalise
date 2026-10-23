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
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { WorkspaceAutomationRecord } from "@/lib/agents/workspace-automation-types";
import { db } from "@/lib/database/client";

import { getGoogleDrivePushEligibility } from "./push-eligibility";

const mocks = vi.hoisted(() => ({
  loadAsPrefilledEntries: vi.fn(),
}));

vi.mock("@/lib/projects/translations/project-translation-service", () => ({
  ProjectTranslationService: class {
    loadAsPrefilledEntries = mocks.loadAsPrefilledEntries;
  },
}));

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

function mockSelectQueue(rowSets: unknown[][]) {
  let callIndex = 0;
  return vi.spyOn(db, "select").mockImplementation(() => {
    const rows = rowSets[callIndex++] ?? [];
    const builder = Promise.resolve(rows) as Promise<unknown[]> & {
      from: ReturnType<typeof vi.fn>;
      where: ReturnType<typeof vi.fn>;
      limit: ReturnType<typeof vi.fn>;
    };
    builder.from = vi.fn(() => builder);
    builder.where = vi.fn(() => builder);
    builder.limit = vi.fn(async () => rows);
    return builder as unknown as ReturnType<typeof db.select>;
  });
}

function approvedLoad(targetLocale: string) {
  mocks.loadAsPrefilledEntries.mockImplementation(
    async (request: { targetLocale: string; approvedTranslationsOnly?: boolean }) => {
      if (request.targetLocale !== "vi-VN") {
        return { translatedKeyCount: 0, loadedKeyCount: 2, prefilled: {} };
      }
      if (request.approvedTranslationsOnly) {
        return {
          translatedKeyCount: 1,
          loadedKeyCount: 2,
          prefilled: { hello: "xin chào" },
        };
      }
      return {
        translatedKeyCount: 2,
        loadedKeyCount: 2,
        prefilled: { hello: "xin chào", bye: "tạm biệt" },
      };
    },
  );
  return targetLocale;
}

describe("getGoogleDrivePushEligibility mapping", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    mocks.loadAsPrefilledEntries.mockReset();
  });

  beforeEach(() => {
    approvedLoad("vi-VN");
  });

  it("returns empty eligibility when the project is missing from the database", async () => {
    const selectSpy = mockSelectQueue([[]]);

    await expect(
      getGoogleDrivePushEligibility({
        organizationId: "org-1",
        automation: automation(),
      }),
    ).resolves.toEqual({ eligibleLocaleCount: 0, mappedFileCount: 0, files: [] });
    expect(selectSpy).toHaveBeenCalledTimes(1);
    expect(mocks.loadAsPrefilledEntries).not.toHaveBeenCalled();
  });

  it("returns empty eligibility when no target locales survive the project intersect", async () => {
    mockSelectQueue([[{ targetLocales: ["ja-JP"] }]]);

    await expect(
      getGoogleDrivePushEligibility({
        organizationId: "org-1",
        automation: automation({
          toolConfig: {
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
        }),
      }),
    ).resolves.toEqual({ eligibleLocaleCount: 0, mappedFileCount: 0, files: [] });
    expect(mocks.loadAsPrefilledEntries).not.toHaveBeenCalled();
  });

  it("counts files with any approved locale and extracts lastError", async () => {
    mockSelectQueue([
      [{ targetLocales: ["vi-VN", "ja-JP"] }],
      [
        {
          driveFileId: "file-ready",
          sourcePath: "drive/ready.json",
          status: "push_failed",
          lastPushedAt: new Date("2026-05-01T12:00:00.000Z"),
          lastError: { message: "Drive rejected the file" },
        },
        {
          driveFileId: "file-empty",
          sourcePath: "drive/empty.json",
          status: "active",
          lastPushedAt: null,
          lastError: { message: "   " },
        },
      ],
    ]);
    mocks.loadAsPrefilledEntries.mockImplementation(
      async (request: { sourcePath: string; targetLocale: string }) => {
        if (request.sourcePath === "drive/ready.json" && request.targetLocale === "vi-VN") {
          return {
            translatedKeyCount: 1,
            loadedKeyCount: 1,
            prefilled: { hello: "xin chào" },
          };
        }
        return { translatedKeyCount: 0, loadedKeyCount: 1, prefilled: {} };
      },
    );

    await expect(
      getGoogleDrivePushEligibility({
        organizationId: "org-1",
        automation: automation(),
      }),
    ).resolves.toEqual({
      eligibleLocaleCount: 1,
      mappedFileCount: 1,
      files: [
        {
          driveFileId: "file-ready",
          sourcePath: "drive/ready.json",
          status: "push_failed",
          eligibleLocaleCount: 1,
          targetLocaleCount: 2,
          eligibleLocales: ["vi-VN"],
          locales: [],
          lastPushedAt: "2026-05-01T12:00:00.000Z",
          lastError: "Drive rejected the file",
        },
        {
          driveFileId: "file-empty",
          sourcePath: "drive/empty.json",
          status: "active",
          eligibleLocaleCount: 0,
          targetLocaleCount: 2,
          eligibleLocales: [],
          locales: [],
          lastPushedAt: null,
          lastError: null,
        },
      ],
    });
  });

  it("attaches per-locale progress when includeLocaleProgress is true", async () => {
    mockSelectQueue([
      [{ targetLocales: ["vi-VN", "ja-JP"] }],
      [
        {
          driveFileId: "file-ready",
          sourcePath: "drive/ready.json",
          status: "active",
          lastPushedAt: null,
          lastError: null,
        },
      ],
    ]);
    approvedLoad("vi-VN");

    await expect(
      getGoogleDrivePushEligibility({
        organizationId: "org-1",
        automation: automation(),
        includeLocaleProgress: true,
      }),
    ).resolves.toEqual({
      eligibleLocaleCount: 1,
      mappedFileCount: 1,
      files: [
        expect.objectContaining({
          driveFileId: "file-ready",
          eligibleLocales: ["vi-VN"],
          locales: [
            { locale: "vi-VN", translationProgress: 100, approvalProgress: 50 },
            { locale: "ja-JP", translationProgress: 0, approvalProgress: 0 },
          ],
          lastError: null,
        }),
      ],
    });
  });
});
