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

import type { HubspotContentClient, HubspotPageRecord } from "./client";
import { buildPageHtmlDocument } from "./page-files";

const mocks = vi.hoisted(() => ({
  dbSelect: vi.fn(),
  dbInsert: vi.fn(),
  getLatestRepositorySourceFileVersion: vi.fn(),
  uploadSourceFile: vi.fn(),
  waitForSourceFileVersionIngest: vi.fn(),
  seedHubspotItemLocales: vi.fn(),
  createFileTranslationJob: vi.fn(),
}));

vi.mock("@/lib/database/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/database/client")>();
  return {
    ...actual,
    db: {
      select: (...args: unknown[]) => mocks.dbSelect(...args),
      insert: (...args: unknown[]) => mocks.dbInsert(...args),
    },
  };
});

vi.mock("@/lib/file-storage/records", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/file-storage/records")>();
  return {
    ...actual,
    getLatestRepositorySourceFileVersion: (...args: unknown[]) =>
      mocks.getLatestRepositorySourceFileVersion(...args),
  };
});

vi.mock("@/lib/projects/files/source-file-upload-service", () => ({
  uploadSourceFile: (...args: unknown[]) => mocks.uploadSourceFile(...args),
}));

vi.mock("@/lib/intercom/wait-for-source-file-ingest", () => ({
  waitForSourceFileVersionIngest: (...args: unknown[]) =>
    mocks.waitForSourceFileVersionIngest(...args),
}));

vi.mock("./seed-hubspot-translations", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./seed-hubspot-translations")>();
  return {
    ...actual,
    seedHubspotItemLocales: (...args: unknown[]) => mocks.seedHubspotItemLocales(...args),
  };
});

vi.mock("@/lib/projects/jobs/enqueue-file-translation-job", () => ({
  createFileTranslationJob: (...args: unknown[]) => mocks.createFileTranslationJob(...args),
  enqueueExistingFileTranslationJob: vi.fn(),
}));

import { runImportHubspotContent } from "./import-hubspot-content";

function selectQueue(rowSets: unknown[][]) {
  let callIndex = 0;
  mocks.dbSelect.mockImplementation(() => {
    const rows = rowSets[Math.min(callIndex, rowSets.length - 1)] ?? [];
    callIndex += 1;
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

function automation(): WorkspaceAutomationRecord {
  return {
    id: "automation-1",
    organizationId: "org-1",
    authorUserId: "user-1",
    status: "active",
    name: "HubSpot",
    instructions: "",
    projectId: "project-1",
    triggerConfig: {
      mode: "scheduled",
      schedule: { cadence: "daily", hourUtc: 9, timezone: "UTC" },
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
        existingTranslationPolicy: "seed_empty",
        overwriteWhenRemoteNewer: true,
      },
      createNativeTmsJob: {
        enabled: true,
        useProjectTargetLocales: true,
        targetLocales: [],
      },
    },
    model: "openai/gpt-6-luna",
    configVersion: 1,
    nextRunAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

describe("runImportHubspotContent pages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getLatestRepositorySourceFileVersion.mockResolvedValue(null);
    mocks.uploadSourceFile.mockResolvedValue({
      ok: true,
      value: {
        destination: "native",
        file: {
          id: "file-1",
          sourceFileVersionId: "version-1",
          filename: "page.html",
          contentType: "text/html",
          byteSize: 12,
          sha256: "abc",
        },
      },
    });
    mocks.waitForSourceFileVersionIngest.mockResolvedValue("ingested");
    mocks.seedHubspotItemLocales.mockResolvedValue({
      importedHashes: { "fr-FR": "seed-hash" },
      seededComplete: ["fr-FR"],
      warnings: [],
    });
    mocks.createFileTranslationJob.mockResolvedValue({
      ok: true,
      jobId: "job-1",
      projectId: "project-1",
      sourceFileVersionId: "version-1",
    });
    mocks.dbInsert.mockImplementation(() => {
      const builder = {
        values: () => builder,
        onConflictDoUpdate: async () => undefined,
      };
      return builder;
    });
  });

  it("writes page.html and seeds a differing locale copy", async () => {
    const page = samplePage();
    const expectedHtml = buildPageHtmlDocument(page, "article { color: navy; }");
    const client = {
      listEmails: async () => [],
      listBlogPosts: async () => [],
      listForms: async () => [],
      listLandingPages: async () => [
        {
          id: "lp-1",
          name: "Pricing",
          language: "en",
          translatedFromId: null,
          dynamicPageHubDbTableId: null,
        },
      ],
      listWebsitePages: async () => [],
      getLandingPage: async () => page,
      collectPageStylesCss: async () => "article { color: navy; }",
    } as unknown as HubspotContentClient;

    const projectRow = {
      id: "project-1",
      sourceLocale: "en",
      targetLocales: ["fr-FR", "de-DE"],
    };
    selectQueue([[projectRow], [], [projectRow]]);

    const result = await runImportHubspotContent({
      organizationId: "org-1",
      automation: automation(),
      client,
    });

    expect({
      imported: result.imported,
      skipped: result.skipped,
      failed: result.failed,
      warnings: result.warnings,
    }).toEqual({
      imported: 1,
      skipped: 0,
      failed: 0,
      warnings: [],
    });
    expect(result.failed).toBe(0);
    expect(mocks.uploadSourceFile).toHaveBeenCalledWith(
      expect.objectContaining({
        sourcePath: "hubspot/landing-pages/lp-1/page.html",
      }),
    );
    const uploaded = mocks.uploadSourceFile.mock.calls[0]?.[0] as {
      file: { filename: string; content: Uint8Array };
    };
    expect(uploaded.file.filename).toBe("page.html");
    expect(new TextDecoder().decode(uploaded.file.content)).toBe(expectedHtml);
    expect(mocks.seedHubspotItemLocales).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "landing-page",
        sourceId: "lp-1",
        sourcePath: "hubspot/landing-pages/lp-1/page.html",
        sourceContent: expectedHtml,
        targetLocales: ["fr-FR", "de-DE"],
      }),
    );
    expect(mocks.createFileTranslationJob).toHaveBeenCalledWith(
      expect.objectContaining({
        fileFormat: "html",
        targetLocales: ["de-DE"],
      }),
    );
    expect(result.jobsCreated).toBe(1);
    expect(result.jobIds).toEqual(["job-1"]);
  });
});
