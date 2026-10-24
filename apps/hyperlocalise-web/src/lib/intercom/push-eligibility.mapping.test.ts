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

import {
  hashIntercomTranslationValues,
  serializeIntercomArticleMarkdown,
} from "./article-markdown";
import { getIntercomPushEligibility } from "./push-eligibility";

const mocks = vi.hoisted(() => ({
  getStoredFileContent: vi.fn(),
  getLatestRepositorySourceFileVersion: vi.fn(),
  listKeysForProject: vi.fn(),
  getTranslationsByKeyIds: vi.fn(),
  loadAsPrefilledEntries: vi.fn(),
}));

vi.mock("@/lib/file-storage/records", () => ({
  getLatestRepositorySourceFileVersion: (...args: unknown[]) =>
    mocks.getLatestRepositorySourceFileVersion(...args),
  getStoredFileContent: (...args: unknown[]) => mocks.getStoredFileContent(...args),
}));

vi.mock("@/lib/projects/translations/project-translation-service", () => ({
  ProjectTranslationService: class {
    listKeysForProject = mocks.listKeysForProject;
    getTranslationsByKeyIds = mocks.getTranslationsByKeyIds;
    loadAsPrefilledEntries = mocks.loadAsPrefilledEntries;
  },
}));

const APPROVED_ARTICLE = {
  title: "Bonjour",
  description: "Aide",
  body: "Corps traduit",
};

function baseAutomation(): Omit<WorkspaceAutomationRecord, "toolConfig"> {
  return {
    id: "automation-1",
    organizationId: "org-1",
    authorUserId: "user-1",
    status: "active",
    name: "Intercom",
    instructions: "",
    projectId: "project-1",
    triggerConfig: {
      mode: "scheduled",
      schedule: { cadence: "daily", hourUtc: 9, timezone: "UTC" },
    },
    repositoryTarget: { kind: "none" },
    model: "openai/gpt-6-luna",
    configVersion: 1,
    nextRunAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function intercomAutomation(
  overrides: Partial<WorkspaceAutomationRecord["toolConfig"]["intercom"]> = {},
): WorkspaceAutomationRecord {
  return {
    ...baseAutomation(),
    toolConfig: {
      intercom: {
        enabled: true,
        helpCenterId: "hc-1",
        helpCenterLocales: ["en", "fr"],
        collectionIds: [],
        sourceLocale: "en",
        targetLocales: ["fr-FR"],
        includeDrafts: true,
        overwriteIntercomDrafts: false,
        existingTranslationPolicy: "seed_empty",
        restEndpoint: "us",
        ...overrides,
      },
    },
  };
}

function articleMapping() {
  return {
    articleId: "art-1",
    sourcePath: "intercom/hc-1/welcome.md",
    projectId: "project-1",
    helpCenterId: "hc-1",
    status: "push_failed",
    lastPushedAt: new Date("2026-04-01T08:00:00.000Z"),
    lastError: { message: "Intercom rejected the article" },
    importedTranslationHashes: { fr: "old" },
    lastPushContentHash: {},
    articleLocaleContentKeys: ["en", "fr"],
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

describe("getIntercomPushEligibility mapping", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    mocks.getStoredFileContent.mockReset();
    mocks.getLatestRepositorySourceFileVersion.mockReset();
    mocks.listKeysForProject.mockReset();
    mocks.getTranslationsByKeyIds.mockReset();
    mocks.loadAsPrefilledEntries.mockReset();
  });

  it("returns null when Intercom is disabled or the automation has no project", async () => {
    await expect(
      getIntercomPushEligibility({
        organizationId: "org-1",
        automation: { ...baseAutomation(), toolConfig: {} },
      }),
    ).resolves.toBeNull();
    await expect(
      getIntercomPushEligibility({
        organizationId: "org-1",
        automation: { ...intercomAutomation(), projectId: null },
      }),
    ).resolves.toEqual({
      eligibleLocaleCount: 0,
      mappedArticleCount: 0,
      articles: [],
    });
  });

  it("returns empty eligibility when the project row is missing", async () => {
    mockSelectQueue([[]]);

    await expect(
      getIntercomPushEligibility({
        organizationId: "org-1",
        automation: intercomAutomation(),
      }),
    ).resolves.toEqual({
      eligibleLocaleCount: 0,
      mappedArticleCount: 0,
      articles: [],
    });
  });

  it("counts an approved variant locale and extracts lastError", async () => {
    mockSelectQueue([
      [{ sourceLocale: "en", targetLocales: ["fr-FR"] }],
      [articleMapping()],
      [
        {
          sourcePath: "intercom/hc-1/welcome.md",
          targetLocale: "fr-FR",
          storedFileId: "stored-fr",
          provenance: "upload",
          reviewedAt: new Date("2026-04-01T00:00:00.000Z"),
        },
      ],
    ]);
    mocks.listKeysForProject.mockResolvedValue([]);
    mocks.getStoredFileContent.mockResolvedValue({
      content: Buffer.from(serializeIntercomArticleMarkdown(APPROVED_ARTICLE), "utf8"),
    });

    await expect(
      getIntercomPushEligibility({
        organizationId: "org-1",
        automation: intercomAutomation(),
      }),
    ).resolves.toEqual({
      eligibleLocaleCount: 1,
      mappedArticleCount: 1,
      articles: [
        {
          articleId: "art-1",
          sourcePath: "intercom/hc-1/welcome.md",
          status: "push_failed",
          eligibleLocaleCount: 1,
          targetLocaleCount: 1,
          eligibleLocales: ["fr-FR"],
          locales: [],
          lastPushedAt: "2026-04-01T08:00:00.000Z",
          lastError: "Intercom rejected the article",
        },
      ],
    });
  });

  it("skips locales whose last push hash still matches", async () => {
    const hash = hashIntercomTranslationValues(APPROVED_ARTICLE);
    mockSelectQueue([
      [{ sourceLocale: "en", targetLocales: ["fr-FR"] }],
      [
        {
          ...articleMapping(),
          lastPushContentHash: { fr: hash },
          lastError: { code: 12 },
        },
      ],
      [
        {
          sourcePath: "intercom/hc-1/welcome.md",
          targetLocale: "fr-FR",
          storedFileId: "stored-fr",
          provenance: "upload",
          reviewedAt: new Date("2026-04-01T00:00:00.000Z"),
        },
      ],
    ]);
    mocks.listKeysForProject.mockResolvedValue([]);
    mocks.getStoredFileContent.mockResolvedValue({
      content: Buffer.from(serializeIntercomArticleMarkdown(APPROVED_ARTICLE), "utf8"),
    });

    await expect(
      getIntercomPushEligibility({
        organizationId: "org-1",
        automation: intercomAutomation(),
      }),
    ).resolves.toEqual({
      eligibleLocaleCount: 0,
      mappedArticleCount: 0,
      articles: [
        expect.objectContaining({
          articleId: "art-1",
          eligibleLocales: [],
          lastError: null,
        }),
      ],
    });
  });

  it("keeps a hash-matching locale eligible when overwriteIntercomDrafts is on", async () => {
    const hash = hashIntercomTranslationValues(APPROVED_ARTICLE);
    mockSelectQueue([
      [{ sourceLocale: "en", targetLocales: ["fr-FR"] }],
      [
        {
          ...articleMapping(),
          lastPushContentHash: { fr: hash },
        },
      ],
      [
        {
          sourcePath: "intercom/hc-1/welcome.md",
          targetLocale: "fr-FR",
          storedFileId: "stored-fr",
          provenance: "upload",
          reviewedAt: new Date("2026-04-01T00:00:00.000Z"),
        },
      ],
    ]);
    mocks.listKeysForProject.mockResolvedValue([]);
    mocks.getStoredFileContent.mockResolvedValue({
      content: Buffer.from(serializeIntercomArticleMarkdown(APPROVED_ARTICLE), "utf8"),
    });

    const eligibility = await getIntercomPushEligibility({
      organizationId: "org-1",
      automation: intercomAutomation({ overwriteIntercomDrafts: true }),
    });

    expect(eligibility).toEqual(
      expect.objectContaining({
        eligibleLocaleCount: 1,
        mappedArticleCount: 1,
        articles: [expect.objectContaining({ eligibleLocales: ["fr-FR"] })],
      }),
    );
  });

  it("attaches per-locale progress when requested", async () => {
    mockSelectQueue([
      [{ sourceLocale: "en", targetLocales: ["fr-FR"] }],
      [articleMapping()],
      [
        {
          sourcePath: "intercom/hc-1/welcome.md",
          targetLocale: "fr-FR",
          storedFileId: "stored-fr",
          provenance: "upload",
          reviewedAt: new Date("2026-04-01T00:00:00.000Z"),
        },
      ],
    ]);
    mocks.listKeysForProject.mockResolvedValue([]);
    mocks.getStoredFileContent.mockResolvedValue({
      content: Buffer.from(serializeIntercomArticleMarkdown(APPROVED_ARTICLE), "utf8"),
    });
    mocks.loadAsPrefilledEntries.mockImplementation(
      async (request: { approvedTranslationsOnly?: boolean }) =>
        request.approvedTranslationsOnly
          ? { translatedKeyCount: 1, loadedKeyCount: 2, prefilled: { title: "Bonjour" } }
          : {
              translatedKeyCount: 2,
              loadedKeyCount: 2,
              prefilled: { title: "Bonjour", body: "Corps traduit" },
            },
    );

    await expect(
      getIntercomPushEligibility({
        organizationId: "org-1",
        automation: intercomAutomation(),
        includeLocaleProgress: true,
      }),
    ).resolves.toEqual({
      eligibleLocaleCount: 1,
      mappedArticleCount: 1,
      articles: [
        expect.objectContaining({
          locales: [{ locale: "fr-FR", translationProgress: 100, approvalProgress: 50 }],
        }),
      ],
    });
  });
});
