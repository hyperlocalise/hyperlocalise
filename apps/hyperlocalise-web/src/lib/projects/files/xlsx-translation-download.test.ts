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
import * as XLSX from "xlsx";

import { err, ok } from "@/lib/primitives/result/results";
import { multilingualXlsxFixture } from "@/lib/translation/xlsx/xlsx-workbook.fixture";
import { XLSX_CONTENT_TYPE } from "@/lib/translation/xlsx/xlsx-workbook";

const mocks = vi.hoisted(() => ({
  loadProjectTranslationsAsPrefilledEntries: vi.fn(),
  getLatestRepositorySourceFileVersion: vi.fn(),
  getStoredFileContent: vi.fn(),
  getProjectSourceLocale: vi.fn(),
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

vi.mock("@/lib/projects/files/xlsx-source-entries", () => ({
  getProjectSourceLocale: (...args: unknown[]) => mocks.getProjectSourceLocale(...args),
}));

import {
  loadProjectXlsxTranslationDownload,
  projectXlsxTranslationDownloadPath,
} from "./xlsx-translation-download";

const INPUT = {
  organizationId: "org_1",
  projectId: "project_1",
  sourcePath: "copy/strings.xlsx",
  targetLocale: "fr-FR",
};

function readyTranslations(overrides?: {
  prefilled?: Record<string, string>;
  loadedKeyCount?: number;
  translatedKeyCount?: number;
}) {
  return {
    prefilled: overrides?.prefilled ?? { "home.cta": "Essai gratuit" },
    retryKeys: [],
    truncated: false,
    loadedKeyCount: overrides?.loadedKeyCount ?? 4,
    maxKeyCount: 5_000,
    translatedKeyCount: overrides?.translatedKeyCount ?? 1,
  };
}

describe("projectXlsxTranslationDownloadPath", () => {
  it("encodes the org, project, path, and locale for the File view URL", () => {
    expect(
      projectXlsxTranslationDownloadPath({
        organizationSlug: "acme team",
        projectId: "project/1",
        sourcePath: "copy/Q3 strings.xlsx",
        targetLocale: "fr-FR",
      }),
    ).toBe(
      "/api/orgs/acme%20team/projects/project%2F1/files/translations/download?sourcePath=copy%2FQ3+strings.xlsx&locale=fr-FR",
    );
  });
});

describe("loadProjectXlsxTranslationDownload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadProjectTranslationsAsPrefilledEntries.mockResolvedValue(readyTranslations());
    mocks.getLatestRepositorySourceFileVersion.mockResolvedValue({ storedFileId: "file_1" });
    mocks.getStoredFileContent.mockResolvedValue({
      content: Buffer.from(multilingualXlsxFixture()),
    });
    mocks.getProjectSourceLocale.mockResolvedValue(ok("en"));
  });

  it("returns null for paths that are not segmented workbooks", async () => {
    const result = await loadProjectXlsxTranslationDownload({
      ...INPUT,
      sourcePath: "locales/en.json",
    });

    expect(result).toEqual(ok(null));
    expect(mocks.loadProjectTranslationsAsPrefilledEntries).not.toHaveBeenCalled();
  });

  it("returns null when the file has no keyed segments", async () => {
    mocks.loadProjectTranslationsAsPrefilledEntries.mockResolvedValue(
      readyTranslations({ loadedKeyCount: 0, translatedKeyCount: 0, prefilled: {} }),
    );

    const result = await loadProjectXlsxTranslationDownload(INPUT);

    expect(result).toEqual(ok(null));
    expect(mocks.getStoredFileContent).not.toHaveBeenCalled();
  });

  it("forwards ready-only and optional approved-only gates to the prefill loader", async () => {
    await loadProjectXlsxTranslationDownload({ ...INPUT, approvedTranslationsOnly: true });

    expect(mocks.loadProjectTranslationsAsPrefilledEntries).toHaveBeenCalledWith({
      organizationId: INPUT.organizationId,
      projectId: INPUT.projectId,
      sourcePath: INPUT.sourcePath,
      targetLocale: INPUT.targetLocale,
      readyTranslationsOnly: true,
      approvedTranslationsOnly: true,
    });
  });

  it("fails when the project is missing", async () => {
    mocks.getProjectSourceLocale.mockResolvedValue(err({ code: "project_not_found" }));

    const result = await loadProjectXlsxTranslationDownload(INPUT);

    expect(result).toEqual(err({ code: "project_not_found" }));
  });

  it("fails when the source version is missing", async () => {
    mocks.getLatestRepositorySourceFileVersion.mockResolvedValue(null);

    const result = await loadProjectXlsxTranslationDownload(INPUT);

    expect(result).toEqual(err({ code: "source_content_not_found" }));
  });

  it("fails when stored workbook bytes cannot be read", async () => {
    mocks.getStoredFileContent.mockRejectedValue(new Error("Stored file file_1 not found"));

    const result = await loadProjectXlsxTranslationDownload(INPUT);

    expect(result).toEqual(err({ code: "source_content_not_found" }));
  });

  it("propagates workbook parse errors from the template", async () => {
    mocks.getStoredFileContent.mockResolvedValue({ content: Buffer.from("not a zip") });

    const result = await loadProjectXlsxTranslationDownload(INPUT);

    expect(result).toEqual(err({ code: "invalid_xlsx" }));
  });

  it("writes ready translations into the target column and leaves source text alone", async () => {
    const result = await loadProjectXlsxTranslationDownload(INPUT);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("expected a generated workbook");
    }
    expect(result.value?.contentType).toBe(XLSX_CONTENT_TYPE);
    expect(result.value?.translatedKeyCount).toBe(1);

    const sheet = XLSX.read(result.value!.content, { type: "buffer" }).Sheets.Strings!;
    expect(sheet.B2?.v).toBeUndefined();
    expect(sheet.B3?.v).toBe("Essai gratuit");
    expect(sheet.D3?.v).toBe("Start free trial");
  });
});
