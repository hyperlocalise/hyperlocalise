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

import { getSanityPushEligibility } from "./push-eligibility";

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
    name: "Sanity documents",
    instructions: "",
    projectId: "project-1",
    triggerConfig: {
      mode: "scheduled",
      schedule: { cadence: "daily", hourUtc: 9, timezone: "UTC" },
    },
    repositoryTarget: { kind: "none" },
    toolConfig: overrides.toolConfig ?? {
      sanity: {
        enabled: true,
        projectId: "abc123",
        dataset: "production",
        documentTypes: ["page"],
        documentTypeModes: {},
        localeCatalog: { documentType: "locale", tagField: "tag", titleField: "name" },
        languages: ["en", "de", "ja"],
        languagesByType: {},
        sourceLocale: "en",
        targetLocales: ["de", "ja"],
        includeDrafts: true,
        overwriteSanityDrafts: true,
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

describe("getSanityPushEligibility mapping", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    mocks.loadAsPrefilledEntries.mockReset();
    mocks.getLatestRepositorySourceFileVersion.mockReset();
    mocks.getStoredFileContent.mockReset();
  });

  it("returns empty eligibility when source locales are incompatible", async () => {
    mockSelectQueue([[{ sourceLocale: "en", targetLocales: ["de"] }]]);

    await expect(
      getSanityPushEligibility({
        organizationId: "org-1",
        automation: automation({
          toolConfig: {
            sanity: {
              enabled: true,
              projectId: "abc123",
              dataset: "production",
              documentTypes: ["page"],
              documentTypeModes: {},
              localeCatalog: { documentType: "locale", tagField: "tag", titleField: "name" },
              languages: ["fr", "de"],
              languagesByType: {},
              sourceLocale: "fr",
              targetLocales: ["de"],
              includeDrafts: true,
              overwriteSanityDrafts: true,
              existingTranslationPolicy: "seed_empty",
            },
          },
        }),
      }),
    ).resolves.toEqual({ eligibleLocaleCount: 0, mappedDocumentCount: 0, documents: [] });
    expect(mocks.getLatestRepositorySourceFileVersion).not.toHaveBeenCalled();
  });

  it("requires every source key approved, skips plugin paths, and filters other datasets", async () => {
    mockSelectQueue([
      [{ sourceLocale: "en", targetLocales: ["de", "ja"] }],
      [
        {
          documentId: "plugin-doc",
          sourcePath: "sanity-plugin/p/d/page/plugin.json",
          status: "active",
          documentType: "page",
          projectId: "project-1",
          sanityProjectId: "abc123",
          dataset: "production",
          lastPushedAt: null,
          lastError: null,
        },
        {
          documentId: "other-dataset",
          sourcePath: "sanity/p/d/page/other.json",
          status: "active",
          documentType: "page",
          projectId: "project-1",
          sanityProjectId: "abc123",
          dataset: "staging",
          lastPushedAt: null,
          lastError: null,
        },
        {
          documentId: "page-1",
          sourcePath: "sanity/p/d/page/home.json",
          status: "push_failed",
          documentType: "page",
          projectId: "project-1",
          sanityProjectId: "abc123",
          dataset: "production",
          lastPushedAt: new Date("2026-03-01T00:00:00.000Z"),
          lastError: { message: "Patch failed" },
        },
      ],
    ]);
    mocks.getLatestRepositorySourceFileVersion.mockResolvedValue({ storedFileId: "file-1" });
    mocks.getStoredFileContent.mockResolvedValue({
      content: Buffer.from(JSON.stringify({ title: "Hello", body: "World" })),
    });
    mocks.loadAsPrefilledEntries.mockImplementation(
      async (request: { targetLocale: string; approvedTranslationsOnly?: boolean }) => {
        if (request.targetLocale === "de") {
          return {
            translatedKeyCount: 2,
            loadedKeyCount: 2,
            prefilled: { title: "Titel", body: "Körper" },
          };
        }
        return {
          translatedKeyCount: request.approvedTranslationsOnly ? 1 : 1,
          loadedKeyCount: 2,
          prefilled: { title: "タイトル" },
        };
      },
    );

    await expect(
      getSanityPushEligibility({
        organizationId: "org-1",
        automation: automation(),
      }),
    ).resolves.toEqual({
      eligibleLocaleCount: 1,
      mappedDocumentCount: 1,
      documents: [
        {
          documentId: "page-1",
          sourcePath: "sanity/p/d/page/home.json",
          status: "push_failed",
          eligibleLocaleCount: 1,
          targetLocaleCount: 2,
          eligibleLocales: ["de"],
          locales: [],
          lastPushedAt: "2026-03-01T00:00:00.000Z",
          lastError: "Patch failed",
        },
      ],
    });
    expect(mocks.getLatestRepositorySourceFileVersion).toHaveBeenCalledTimes(1);
  });

  it("lists documents with no source keys and attaches locale progress when requested", async () => {
    mockSelectQueue([
      [{ sourceLocale: "en", targetLocales: ["de"] }],
      [
        {
          documentId: "empty-source",
          sourcePath: "sanity/p/d/page/empty.json",
          status: "active",
          documentType: "page",
          projectId: "project-1",
          sanityProjectId: "abc123",
          dataset: "production",
          lastPushedAt: null,
          lastError: null,
        },
        {
          documentId: "page-1",
          sourcePath: "sanity/p/d/page/home.json",
          status: "active",
          documentType: "page",
          projectId: "project-1",
          sanityProjectId: "abc123",
          dataset: "production",
          lastPushedAt: null,
          lastError: { message: 12 },
        },
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
      getSanityPushEligibility({
        organizationId: "org-1",
        automation: automation({
          toolConfig: {
            sanity: {
              enabled: true,
              projectId: "abc123",
              dataset: "production",
              documentTypes: ["page"],
              documentTypeModes: {},
              localeCatalog: { documentType: "locale", tagField: "tag", titleField: "name" },
              languages: ["en", "de"],
              languagesByType: {},
              sourceLocale: "en",
              targetLocales: ["de"],
              includeDrafts: true,
              overwriteSanityDrafts: true,
              existingTranslationPolicy: "seed_empty",
            },
          },
        }),
        includeLocaleProgress: true,
      }),
    ).resolves.toEqual({
      eligibleLocaleCount: 1,
      mappedDocumentCount: 1,
      documents: [
        {
          documentId: "empty-source",
          sourcePath: "sanity/p/d/page/empty.json",
          status: "active",
          eligibleLocaleCount: 0,
          targetLocaleCount: 1,
          eligibleLocales: [],
          locales: [],
          lastPushedAt: null,
          lastError: null,
        },
        {
          documentId: "page-1",
          sourcePath: "sanity/p/d/page/home.json",
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
});
