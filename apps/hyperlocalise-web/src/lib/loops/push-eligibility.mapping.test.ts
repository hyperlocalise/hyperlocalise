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

import { getLoopsPushEligibility } from "./push-eligibility";

const mocks = vi.hoisted(() => ({
  loadAsPrefilledEntries: vi.fn(),
}));

vi.mock("@/lib/projects/translations/project-translation-service", () => ({
  ProjectTranslationService: class {
    loadAsPrefilledEntries = mocks.loadAsPrefilledEntries;
  },
}));

function loopsConfig(
  overrides: Partial<NonNullable<WorkspaceAutomationRecord["toolConfig"]["loops"]>> = {},
) {
  return {
    enabled: true,
    sourceLocale: "en",
    transactionalIds: ["txn-1"],
    campaignIds: [],
    workflowIds: [],
    existingTranslationPolicy: "seed_empty" as const,
    overwriteWhenRemoteNewer: true,
    ...overrides,
  };
}

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
    name: "Loops emails",
    instructions: "",
    projectId: "project-1",
    triggerConfig: {
      mode: "scheduled",
      schedule: { cadence: "daily", hourUtc: 9, timezone: "UTC" },
    },
    repositoryTarget: { kind: "none" },
    toolConfig: overrides.toolConfig ?? { loops: loopsConfig() },
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

function approvedLoad() {
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
}

describe("getLoopsPushEligibility mapping", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    mocks.loadAsPrefilledEntries.mockReset();
  });

  beforeEach(() => {
    approvedLoad();
  });

  it("returns empty eligibility when the project is missing from the database", async () => {
    const selectSpy = mockSelectQueue([[]]);

    await expect(
      getLoopsPushEligibility({
        organizationId: "org-1",
        automation: automation(),
      }),
    ).resolves.toEqual({ eligibleLocaleCount: 0, mappedItemCount: 0, items: [] });
    expect(selectSpy).toHaveBeenCalledTimes(1);
    expect(mocks.loadAsPrefilledEntries).not.toHaveBeenCalled();
  });

  it("drops the source locale and duplicate targets before checking approval", async () => {
    mockSelectQueue([
      [{ sourceLocale: "en", targetLocales: ["en", "EN", "vi-VN", "vi-vn", "  "] }],
      [
        {
          sourceId: "email-ready",
          sourcePath: "loops/transactional/welcome.html",
          resourceKind: "transactional",
          sourceName: "Welcome",
          status: "active",
          lastPushedAt: null,
          lastError: null,
        },
      ],
    ]);

    await expect(
      getLoopsPushEligibility({
        organizationId: "org-1",
        automation: automation(),
      }),
    ).resolves.toEqual({
      eligibleLocaleCount: 1,
      mappedItemCount: 1,
      items: [expect.objectContaining({ eligibleLocales: ["vi-VN"], targetLocaleCount: 1 })],
    });
    expect(mocks.loadAsPrefilledEntries).toHaveBeenCalledTimes(1);
    expect(mocks.loadAsPrefilledEntries).toHaveBeenCalledWith(
      expect.objectContaining({ targetLocale: "vi-VN" }),
    );
  });

  it("counts emails with any approved locale and extracts lastError", async () => {
    mockSelectQueue([
      [{ sourceLocale: "en", targetLocales: ["vi-VN", "ja-JP"] }],
      [
        {
          sourceId: "email-ready",
          sourcePath: "loops/transactional/welcome.html",
          resourceKind: "transactional",
          sourceName: "Welcome",
          status: "push_failed",
          lastPushedAt: new Date("2026-05-01T12:00:00.000Z"),
          lastError: { message: "Loops rejected the copy" },
        },
        {
          sourceId: "email-empty",
          sourcePath: "loops/transactional/empty.html",
          resourceKind: "transactional",
          sourceName: "",
          status: "active",
          lastPushedAt: null,
          lastError: { code: "ignored" },
        },
      ],
    ]);
    mocks.loadAsPrefilledEntries.mockImplementation(
      async (request: { sourcePath: string; targetLocale: string }) => {
        if (
          request.sourcePath === "loops/transactional/welcome.html" &&
          request.targetLocale === "vi-VN"
        ) {
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
      getLoopsPushEligibility({
        organizationId: "org-1",
        automation: automation(),
      }),
    ).resolves.toEqual({
      eligibleLocaleCount: 1,
      mappedItemCount: 1,
      items: [
        {
          sourceId: "email-ready",
          sourcePath: "loops/transactional/welcome.html",
          resourceKind: "transactional",
          name: "Welcome",
          status: "push_failed",
          eligibleLocaleCount: 1,
          targetLocaleCount: 2,
          eligibleLocales: ["vi-VN"],
          locales: [],
          lastPushedAt: "2026-05-01T12:00:00.000Z",
          lastError: "Loops rejected the copy",
        },
        {
          sourceId: "email-empty",
          sourcePath: "loops/transactional/empty.html",
          resourceKind: "transactional",
          name: "email-empty",
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

  it("uses configured native-job locales instead of every project target", async () => {
    mockSelectQueue([
      [{ sourceLocale: "en", targetLocales: ["vi-VN", "ja-JP"] }],
      [
        {
          sourceId: "email-ready",
          sourcePath: "loops/campaign/promo.html",
          resourceKind: "campaign",
          sourceName: "Promo",
          status: "active",
          lastPushedAt: null,
          lastError: null,
        },
      ],
    ]);

    await expect(
      getLoopsPushEligibility({
        organizationId: "org-1",
        automation: automation({
          toolConfig: {
            loops: loopsConfig(),
            createNativeTmsJob: {
              enabled: true,
              useProjectTargetLocales: false,
              targetLocales: ["ja-JP"],
            },
          },
        }),
      }),
    ).resolves.toEqual({
      eligibleLocaleCount: 0,
      mappedItemCount: 0,
      items: [
        expect.objectContaining({
          sourceId: "email-ready",
          eligibleLocales: [],
          targetLocaleCount: 1,
        }),
      ],
    });
    expect(mocks.loadAsPrefilledEntries).toHaveBeenCalledTimes(1);
    expect(mocks.loadAsPrefilledEntries).toHaveBeenCalledWith(
      expect.objectContaining({ targetLocale: "ja-JP" }),
    );
  });

  it("attaches per-locale progress when includeLocaleProgress is true", async () => {
    mockSelectQueue([
      [{ sourceLocale: "en", targetLocales: ["vi-VN", "ja-JP"] }],
      [
        {
          sourceId: "email-ready",
          sourcePath: "loops/transactional/welcome.html",
          resourceKind: "transactional",
          sourceName: "Welcome",
          status: "active",
          lastPushedAt: null,
          lastError: null,
        },
      ],
    ]);
    approvedLoad();

    await expect(
      getLoopsPushEligibility({
        organizationId: "org-1",
        automation: automation(),
        includeLocaleProgress: true,
      }),
    ).resolves.toEqual({
      eligibleLocaleCount: 1,
      mappedItemCount: 1,
      items: [
        expect.objectContaining({
          sourceId: "email-ready",
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
