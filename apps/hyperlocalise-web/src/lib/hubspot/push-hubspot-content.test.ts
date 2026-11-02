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

import type { WorkspaceAutomationRecord } from "@/lib/agents/workspace-automation-types";
import { extractHtmlIngestEntries } from "@/lib/projects/files/html-ingest-entries";

import type { HubspotContentClient, HubspotPageRecord } from "./client";
import { buildPageHtmlDocument } from "./page-files";

const mocks = vi.hoisted(() => ({
  dbSelect: vi.fn(),
  dbUpdate: vi.fn(),
  getLatestRepositorySourceFileVersion: vi.fn(),
  getStoredFileContent: vi.fn(),
  loadAsPrefilledEntries: vi.fn(),
}));

vi.mock("@/lib/database/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/database/client")>();
  return {
    ...actual,
    db: {
      select: (...args: unknown[]) => mocks.dbSelect(...args),
      update: (...args: unknown[]) => mocks.dbUpdate(...args),
    },
  };
});

vi.mock("@/lib/file-storage/records", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/file-storage/records")>();
  return {
    ...actual,
    getLatestRepositorySourceFileVersion: (...args: unknown[]) =>
      mocks.getLatestRepositorySourceFileVersion(...args),
    getStoredFileContent: (...args: unknown[]) => mocks.getStoredFileContent(...args),
  };
});

vi.mock("@/lib/projects/translations/project-translation-service", () => ({
  ProjectTranslationService: class {
    loadAsPrefilledEntries = (...args: unknown[]) => mocks.loadAsPrefilledEntries(...args);
  },
}));

import { runPushHubspotContent } from "./push-hubspot-content";

function selectQueue(rowSets: unknown[][]) {
  let callIndex = 0;
  mocks.dbSelect.mockImplementation(() => {
    const rows = rowSets[callIndex++] ?? [];
    const builder = Promise.resolve(rows) as Promise<unknown[]> & {
      from: () => unknown;
      where: () => unknown;
      limit: () => Promise<unknown[]>;
    };
    builder.from = () => builder;
    builder.where = () => builder;
    builder.limit = async () => rows;
    return builder;
  });
}

function samplePage(overrides: Partial<HubspotPageRecord> = {}): HubspotPageRecord {
  return {
    id: "lp-1",
    name: "Pricing",
    language: "en",
    translatedFromId: null,
    htmlTitle: "Pricing title",
    metaDescription: "Meta",
    featuredImageAltText: "Hero",
    widgets: {},
    layoutSections: {
      dnd_area: {
        rows: [{ "0": { params: { html: "<p>Book a consultation</p>" } } }],
      },
    },
    widgetContainers: {},
    templatePath: null,
    attachedStylesheets: [],
    updatedAt: null,
    dynamicPageHubDbTableId: null,
    ...overrides,
  };
}

function automation(
  policy: "seed_empty" | "overwrite_all" = "overwrite_all",
): WorkspaceAutomationRecord {
  return {
    id: "automation-1",
    organizationId: "org-1",
    authorUserId: "user-1",
    status: "active",
    name: "HubSpot",
    instructions: "",
    projectId: "project-1",
    triggerConfig: {
      mode: "manual",
    },
    repositoryTarget: { kind: "none" },
    toolConfig: {
      hubspot: {
        enabled: true,
        workosUserId: "user-1",
        sourceLocale: "en",
        emailIds: [],
        formIds: [],
        blogPostIds: [],
        landingPageIds: ["lp-1"],
        websitePageIds: [],
        messageTemplateIds: [],
        existingTranslationPolicy: policy,
        overwriteWhenRemoteNewer: true,
      },
    },
    model: "openai/gpt-6-luna",
    configVersion: 1,
    nextRunAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function mapping(localeCopyIds: Record<string, string> = {}) {
  return {
    id: "sync-1",
    organizationId: "org-1",
    automationId: "automation-1",
    projectId: "project-1",
    resourceKind: "landing-page",
    sourceId: "lp-1",
    sourceName: "Pricing",
    sourcePath: "hubspot/landing-pages/lp-1/page.html",
    sourceLocale: "en",
    sourceContentHash: "source-hash",
    importedTranslationHashes: {},
    localeCopyIds,
    lastPushContentHash: {},
    lastPushedAt: null,
    status: "active",
    lastError: null,
  };
}

describe("runPushHubspotContent pages", () => {
  const page = samplePage();
  const sourceHtml = buildPageHtmlDocument(page, "");
  const titleKey = Object.entries(extractHtmlIngestEntries(sourceHtml)).find(
    ([, text]) => text.trim() === "Pricing title",
  )?.[0];

  beforeEach(() => {
    vi.clearAllMocks();
    expect(titleKey).toBeTruthy();
    mocks.getLatestRepositorySourceFileVersion.mockResolvedValue({
      storedFileId: "file-1",
    });
    mocks.getStoredFileContent.mockResolvedValue({
      content: Buffer.from(sourceHtml, "utf8"),
    });
    mocks.loadAsPrefilledEntries.mockResolvedValue({
      translatedKeyCount: 1,
      loadedKeyCount: 1,
      prefilled: { [titleKey!]: "Tarifs" },
    });
    mocks.dbUpdate.mockImplementation(() => {
      const builder = {
        set: () => builder,
        where: async () => undefined,
      };
      return builder;
    });
  });

  it("updates an existing unpublished language variation", async () => {
    const copy = samplePage({
      id: "lp-fr",
      name: "Pricing [fr-FR]",
      language: "fr",
      translatedFromId: "lp-1",
      htmlTitle: "Ancien titre",
    });
    const drafts: unknown[] = [];
    const created: unknown[] = [];
    const client = {
      listLandingPages: async () => [
        {
          id: "lp-1",
          name: "Pricing",
          language: "en",
          translatedFromId: null,
          dynamicPageHubDbTableId: null,
        },
        {
          id: "lp-fr",
          name: "Pricing [fr-FR]",
          language: "fr",
          translatedFromId: "lp-1",
          dynamicPageHubDbTableId: null,
        },
      ],
      getLandingPage: async (id: string) => (id === "lp-fr" ? copy : page),
      collectPageStylesCss: async () => "",
      createLandingPageLanguageVariation: async (input: unknown) => {
        created.push(input);
        return { id: "should-not-create" };
      },
      updateLandingPageDraft: async (input: unknown) => {
        drafts.push(input);
      },
    } as unknown as HubspotContentClient;

    selectQueue([
      [{ sourceLocale: "en", targetLocales: ["fr-FR"] }],
      [mapping({ "fr-FR": "lp-fr" })],
    ]);

    const result = await runPushHubspotContent({
      organizationId: "org-1",
      automation: automation("overwrite_all"),
      client,
    });

    expect(result.pushedLocales).toBe(1);
    expect(result.failedLocales).toBe(0);
    expect(created).toEqual([]);
    expect(drafts).toEqual([
      expect.objectContaining({
        id: "lp-fr",
        name: "Pricing [fr-FR]",
        language: "fr-fr",
        htmlTitle: "Tarifs",
      }),
    ]);
  });

  it("creates a language variation when none exists", async () => {
    const drafts: unknown[] = [];
    const created: unknown[] = [];
    const client = {
      listLandingPages: async () => [
        {
          id: "lp-1",
          name: "Pricing",
          language: "en",
          translatedFromId: null,
          dynamicPageHubDbTableId: null,
        },
      ],
      getLandingPage: async () => page,
      collectPageStylesCss: async () => "",
      createLandingPageLanguageVariation: async (input: unknown) => {
        created.push(input);
        return { id: "lp-fr-new" };
      },
      updateLandingPageDraft: async (input: unknown) => {
        drafts.push(input);
      },
    } as unknown as HubspotContentClient;

    selectQueue([[{ sourceLocale: "en", targetLocales: ["fr-FR"] }], [mapping()]]);

    const result = await runPushHubspotContent({
      organizationId: "org-1",
      automation: automation("seed_empty"),
      client,
    });

    expect(result.pushedLocales).toBe(1);
    expect(result.failedLocales).toBe(0);
    expect(created).toEqual([{ id: "lp-1", language: "fr-fr" }]);
    expect(drafts).toEqual([
      expect.objectContaining({
        id: "lp-fr-new",
        name: "Pricing [fr-FR]",
        language: "fr-fr",
        htmlTitle: "Tarifs",
      }),
    ]);
  });
});
