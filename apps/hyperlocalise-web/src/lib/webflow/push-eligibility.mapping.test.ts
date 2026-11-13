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
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import type { WorkspaceAutomationRecord } from "@/lib/agents/workspace-automation-types";
import { db } from "@/lib/database/client";

import { getWebflowPushEligibility } from "./push-eligibility";

const mocks = vi.hoisted(() => ({
  loadAsPrefilledEntries: vi.fn(),
  getLatestRepositorySourceFileVersion: vi.fn(),
  getStoredFileContent: vi.fn(),
}));

vi.mock("@/lib/projects/translations/project-translation-service", () => ({
  ProjectTranslationService: class {
    loadAsPrefilledEntries = mocks.loadAsPrefilledEntries;
  },
}));

vi.mock("@/lib/file-storage/records", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/file-storage/records")>();
  return {
    ...actual,
    getLatestRepositorySourceFileVersion: (...args: unknown[]) =>
      mocks.getLatestRepositorySourceFileVersion(...args),
    getStoredFileContent: (...args: unknown[]) => mocks.getStoredFileContent(...args),
  };
});

function webflowConfig(
  overrides: Partial<NonNullable<WorkspaceAutomationRecord["toolConfig"]["webflow"]>> = {},
) {
  return {
    enabled: true,
    collectionIds: ["col-1"],
    sourceLocale: "en",
    targetLocales: [] as string[],
    existingTranslationPolicy: "seed_empty" as const,
    runQa: true,
    publishOnPush: false,
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
    name: "Webflow CMS",
    instructions: "",
    projectId: "project-1",
    triggerConfig: {
      mode: "scheduled",
      schedule: { cadence: "daily", hourUtc: 9, timezone: "UTC" },
    },
    repositoryTarget: { kind: "none" },
    toolConfig: overrides.toolConfig ?? { webflow: webflowConfig() },
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

function homeItem(overrides: Record<string, unknown> = {}) {
  return {
    itemId: "item-home",
    siteId: "site-1",
    collectionId: "col-1",
    slug: "home",
    lastPushedAt: new Date("2026-04-01T00:00:00.000Z"),
    ...overrides,
  };
}

describe("getWebflowPushEligibility mapping", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    mocks.loadAsPrefilledEntries.mockReset();
    mocks.getLatestRepositorySourceFileVersion.mockReset();
    mocks.getStoredFileContent.mockReset();
  });

  it("returns null when Webflow is disabled and empty when the project is missing", async () => {
    await expect(
      getWebflowPushEligibility({
        organizationId: "org-1",
        automation: automation({
          toolConfig: { webflow: webflowConfig({ enabled: false }) },
        }),
      }),
    ).resolves.toBeNull();

    await expect(
      getWebflowPushEligibility({
        organizationId: "org-1",
        automation: automation({ projectId: "   " }),
      }),
    ).resolves.toEqual({ eligibleLocaleCount: 0, mappedItemCount: 0, items: [] });

    const selectSpy = mockSelectQueue([[]]);
    await expect(
      getWebflowPushEligibility({
        organizationId: "org-1",
        automation: automation(),
      }),
    ).resolves.toEqual({ eligibleLocaleCount: 0, mappedItemCount: 0, items: [] });
    expect(selectSpy).toHaveBeenCalledTimes(1);
    expect(mocks.getLatestRepositorySourceFileVersion).not.toHaveBeenCalled();
  });

  it("uses configured target locales and requires every source key approved", async () => {
    mockSelectQueue([[{ sourceLocale: "en", targetLocales: ["de", "ja", "fr"] }], [homeItem()]]);
    mocks.getLatestRepositorySourceFileVersion.mockResolvedValue({ storedFileId: "file-1" });
    mocks.getStoredFileContent.mockResolvedValue({
      content: Buffer.from(JSON.stringify({ title: "Hello", body: "World" })),
    });
    mocks.loadAsPrefilledEntries.mockImplementation(async (request: { targetLocale: string }) => {
      if (request.targetLocale === "de") {
        return {
          translatedKeyCount: 2,
          loadedKeyCount: 2,
          prefilled: { title: "Titel", body: "Körper" },
        };
      }
      return {
        translatedKeyCount: 1,
        loadedKeyCount: 2,
        prefilled: { title: "タイトル" },
      };
    });

    await expect(
      getWebflowPushEligibility({
        organizationId: "org-1",
        automation: automation({
          toolConfig: { webflow: webflowConfig({ targetLocales: ["de", "ja"] }) },
        }),
      }),
    ).resolves.toEqual({
      eligibleLocaleCount: 1,
      mappedItemCount: 1,
      items: [
        {
          documentId: "item-home",
          sourcePath: "webflow/site-1/col-1/home.json",
          status: "active",
          eligibleLocaleCount: 1,
          targetLocaleCount: 2,
          eligibleLocales: ["de"],
          locales: [],
          lastPushedAt: "2026-04-01T00:00:00.000Z",
          lastError: null,
        },
      ],
    });
    expect(mocks.loadAsPrefilledEntries).toHaveBeenCalledTimes(2);
    expect(mocks.loadAsPrefilledEntries).not.toHaveBeenCalledWith(
      expect.objectContaining({ targetLocale: "fr" }),
    );
  });

  it("lists items with no source keys and attaches locale progress when requested", async () => {
    mockSelectQueue([
      [{ sourceLocale: "en", targetLocales: ["de"] }],
      [
        {
          itemId: "item-empty",
          siteId: "site-1",
          collectionId: "col-1",
          slug: "empty",
          lastPushedAt: null,
        },
        homeItem({ lastPushedAt: null }),
      ],
    ]);
    mocks.getLatestRepositorySourceFileVersion.mockImplementation(
      async (input: { sourcePath: string }) =>
        input.sourcePath.endsWith("home.json") ? { storedFileId: "file-1" } : null,
    );
    mocks.getStoredFileContent.mockResolvedValue({
      content: Buffer.from(JSON.stringify({ title: "Hello" })),
    });
    mocks.loadAsPrefilledEntries.mockImplementation(
      async (request: { approvedTranslationsOnly?: boolean }) =>
        request.approvedTranslationsOnly
          ? { translatedKeyCount: 1, loadedKeyCount: 1, prefilled: { title: "Titel" } }
          : { translatedKeyCount: 1, loadedKeyCount: 1, prefilled: { title: "Titel" } },
    );

    await expect(
      getWebflowPushEligibility({
        organizationId: "org-1",
        automation: automation(),
        includeLocaleProgress: true,
      }),
    ).resolves.toEqual({
      eligibleLocaleCount: 1,
      mappedItemCount: 1,
      items: [
        {
          documentId: "item-empty",
          sourcePath: "webflow/site-1/col-1/empty.json",
          status: "active",
          eligibleLocaleCount: 0,
          targetLocaleCount: 1,
          eligibleLocales: [],
          locales: [],
          lastPushedAt: null,
          lastError: null,
        },
        {
          documentId: "item-home",
          sourcePath: "webflow/site-1/col-1/home.json",
          status: "active",
          eligibleLocaleCount: 1,
          targetLocaleCount: 1,
          eligibleLocales: ["de"],
          locales: [{ locale: "de", translationProgress: 100, approvalProgress: 100 }],
          lastPushedAt: null,
          lastError: null,
        },
      ],
    });
  });

  it("returns empty eligibility when neither Webflow nor project targets are set", async () => {
    mockSelectQueue([[{ sourceLocale: "en", targetLocales: [] }]]);

    await expect(
      getWebflowPushEligibility({
        organizationId: "org-1",
        automation: automation(),
      }),
    ).resolves.toEqual({ eligibleLocaleCount: 0, mappedItemCount: 0, items: [] });
    expect(mocks.getLatestRepositorySourceFileVersion).not.toHaveBeenCalled();
  });
});
