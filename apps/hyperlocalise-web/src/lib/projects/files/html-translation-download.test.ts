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

import { err, isOk, ok } from "@/lib/primitives/result/results";

const mocks = vi.hoisted(() => ({
  loadProjectTranslationsAsPrefilledEntries: vi.fn(),
  getLatestRepositorySourceFileVersion: vi.fn(),
  getStoredFileContent: vi.fn(),
}));

vi.mock("@/lib/projects/translations/project-translation-service", () => ({
  loadProjectTranslationsAsPrefilledEntries: (...args: unknown[]) =>
    mocks.loadProjectTranslationsAsPrefilledEntries(...args),
}));

vi.mock("@/lib/file-storage/records", () => ({
  getLatestRepositorySourceFileVersion: (...args: unknown[]) =>
    mocks.getLatestRepositorySourceFileVersion(...args),
  getStoredFileContent: (...args: unknown[]) => mocks.getStoredFileContent(...args),
}));

import {
  htmlTranslationDownloadFailure,
  loadProjectHtmlTranslationDownload,
  projectHtmlTranslationDownloadPath,
} from "./html-translation-download";

const INPUT = {
  organizationId: "org_1",
  projectId: "project_1",
  sourcePath: "emails/welcome.html",
  targetLocale: "zh-CN",
};

beforeEach(() => {
  vi.resetAllMocks();
});

describe("loadProjectHtmlTranslationDownload", () => {
  it("returns null for non-HTML paths", async () => {
    const result = await loadProjectHtmlTranslationDownload({
      ...INPUT,
      sourcePath: "messages/en.json",
    });
    expect(result).toEqual(ok(null));
    expect(mocks.loadProjectTranslationsAsPrefilledEntries).not.toHaveBeenCalled();
  });

  it("returns source HTML when the file has no ready translation keys", async () => {
    mocks.loadProjectTranslationsAsPrefilledEntries.mockResolvedValue({
      prefilled: {},
      loadedKeyCount: 0,
      translatedKeyCount: 0,
    });
    mocks.getLatestRepositorySourceFileVersion.mockResolvedValue({ storedFileId: "stored_1" });
    mocks.getStoredFileContent.mockResolvedValue({
      content: Buffer.from("<td>&nbsp;</td><p>Welcome</p>", "utf-8"),
    });

    const result = await loadProjectHtmlTranslationDownload(INPUT);
    expect(isOk(result)).toBe(true);
    if (!isOk(result) || !result.value) {
      throw new Error("expected HTML download");
    }
    expect(result.value.content.toString("utf-8")).toBe("<td>&nbsp;</td><p>Welcome</p>");
    expect(result.value.translatedKeyCount).toBe(0);
  });

  it("composes translated HTML from ready entries", async () => {
    mocks.loadProjectTranslationsAsPrefilledEntries.mockResolvedValue({
      prefilled: { "html.p": "欢迎" },
      loadedKeyCount: 1,
      translatedKeyCount: 1,
    });
    mocks.getLatestRepositorySourceFileVersion.mockResolvedValue({ storedFileId: "stored_1" });
    mocks.getStoredFileContent.mockResolvedValue({
      content: Buffer.from("<p>Welcome</p>", "utf-8"),
    });

    const result = await loadProjectHtmlTranslationDownload(INPUT);
    expect(isOk(result)).toBe(true);
    if (!isOk(result) || !result.value) {
      throw new Error("expected HTML download");
    }
    expect(result.value).toMatchObject({
      contentType: "text/html",
      extension: ".html",
      translatedKeyCount: 1,
    });
    expect(result.value.content.toString("utf-8")).toContain("欢迎");
    expect(result.value.content.toString("utf-8")).not.toContain("Welcome");
    expect(mocks.loadProjectTranslationsAsPrefilledEntries).toHaveBeenCalledWith(
      expect.objectContaining({ readyTranslationsOnly: true, targetLocale: "zh-CN" }),
    );
  });

  it("keeps the .htm extension", async () => {
    mocks.loadProjectTranslationsAsPrefilledEntries.mockResolvedValue({
      prefilled: { "html.p": "欢迎" },
      loadedKeyCount: 1,
      translatedKeyCount: 1,
    });
    mocks.getLatestRepositorySourceFileVersion.mockResolvedValue({ storedFileId: "stored_1" });
    mocks.getStoredFileContent.mockResolvedValue({
      content: Buffer.from("<p>Hello</p>", "utf-8"),
    });

    const result = await loadProjectHtmlTranslationDownload({
      ...INPUT,
      sourcePath: "emails/legacy.htm",
    });
    expect(isOk(result)).toBe(true);
    if (!isOk(result) || !result.value) {
      throw new Error("expected HTML download");
    }
    expect(result.value.extension).toBe(".htm");
  });

  it("reports source_content_not_found when the source version is missing", async () => {
    mocks.loadProjectTranslationsAsPrefilledEntries.mockResolvedValue({
      prefilled: { "html.p": "欢迎" },
      loadedKeyCount: 1,
      translatedKeyCount: 1,
    });
    mocks.getLatestRepositorySourceFileVersion.mockResolvedValue(null);

    const result = await loadProjectHtmlTranslationDownload(INPUT);
    expect(result).toEqual(err({ code: "source_content_not_found" }));
  });
});

describe("projectHtmlTranslationDownloadPath", () => {
  it("builds the translations download URL", () => {
    expect(
      projectHtmlTranslationDownloadPath({
        organizationSlug: "acme",
        projectId: "project_1",
        sourcePath: "emails/welcome.html",
        targetLocale: "zh-CN",
      }),
    ).toBe(
      "/api/orgs/acme/projects/project_1/files/translations/download?sourcePath=emails%2Fwelcome.html&locale=zh-CN",
    );
  });
});

describe("htmlTranslationDownloadFailure", () => {
  it("reports the html export failure", () => {
    expect(htmlTranslationDownloadFailure()).toEqual({
      code: "html_export_failed",
      message: "Could not write translations into the HTML file.",
    });
  });
});
