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

import { err, isOk, ok } from "@/lib/primitives/result/results";
import { DOCX_CONTENT_TYPE, readDocxEntries } from "@/lib/translation/ooxml/docx-document";
import { ooxmlFixture } from "@/lib/translation/ooxml/ooxml.fixture";
import { PPTX_CONTENT_TYPE, readPptxEntries } from "@/lib/translation/ooxml/pptx-deck";
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

vi.mock("@/lib/projects/files/office-source-entries", () => ({
  getProjectSourceLocale: (...args: unknown[]) => mocks.getProjectSourceLocale(...args),
}));

import {
  loadProjectOfficeTranslationDownload,
  officeTranslationDownloadFailure,
  officeTranslationDownloadFilename,
  projectOfficeTranslationDownloadPath,
} from "./office-translation-download";

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

describe("officeTranslationDownloadFilename", () => {
  it("keeps Word and PowerPoint extensions and swaps .xls for .xlsx", () => {
    expect(officeTranslationDownloadFilename("report.docx", { extension: ".docx" })).toBe(
      "report.docx",
    );
    expect(officeTranslationDownloadFilename("slides/deck.pptx", { extension: ".pptx" })).toBe(
      "slides/deck.pptx",
    );
    expect(officeTranslationDownloadFilename("legacy.xls", { extension: ".xlsx" })).toBe(
      "legacy.xlsx",
    );
  });
});

describe("officeTranslationDownloadFailure", () => {
  it("keeps Excel callers on xlsx_export_failed and Word/PowerPoint on office_export_failed", () => {
    expect(officeTranslationDownloadFailure("copy/strings.xlsx").code).toBe("xlsx_export_failed");
    expect(officeTranslationDownloadFailure("copy/legacy.xls").code).toBe("xlsx_export_failed");
    expect(officeTranslationDownloadFailure("docs/report.docx").code).toBe("office_export_failed");
    expect(officeTranslationDownloadFailure("slides/deck.pptx").code).toBe("office_export_failed");
  });
});

describe("projectOfficeTranslationDownloadPath", () => {
  it("encodes the org, project, path, and locale for the File view URL", () => {
    expect(
      projectOfficeTranslationDownloadPath({
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

describe("loadProjectOfficeTranslationDownload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadProjectTranslationsAsPrefilledEntries.mockResolvedValue(readyTranslations());
    mocks.getLatestRepositorySourceFileVersion.mockResolvedValue({ storedFileId: "file_1" });
    mocks.getStoredFileContent.mockResolvedValue({
      content: Buffer.from(multilingualXlsxFixture()),
    });
    mocks.getProjectSourceLocale.mockResolvedValue(ok("en"));
  });

  it("returns null for paths that are not Office files", async () => {
    const result = await loadProjectOfficeTranslationDownload({
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

    const result = await loadProjectOfficeTranslationDownload(INPUT);

    expect(result).toEqual(ok(null));
    expect(mocks.getStoredFileContent).not.toHaveBeenCalled();
  });

  it("forwards ready-only and optional approved-only gates to the prefill loader", async () => {
    await loadProjectOfficeTranslationDownload({ ...INPUT, approvedTranslationsOnly: true });

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

    const result = await loadProjectOfficeTranslationDownload(INPUT);

    expect(result).toEqual(err({ code: "project_not_found" }));
  });

  it("fails when the source version is missing", async () => {
    mocks.getLatestRepositorySourceFileVersion.mockResolvedValue(null);

    const result = await loadProjectOfficeTranslationDownload(INPUT);

    expect(result).toEqual(err({ code: "source_content_not_found" }));
  });

  it("fails when stored workbook bytes cannot be read", async () => {
    mocks.getStoredFileContent.mockRejectedValue(new Error("Stored file file_1 not found"));

    const result = await loadProjectOfficeTranslationDownload(INPUT);

    expect(result).toEqual(err({ code: "source_content_not_found" }));
  });

  it("propagates workbook parse errors from the template", async () => {
    mocks.getStoredFileContent.mockResolvedValue({ content: Buffer.from("not a zip") });

    const result = await loadProjectOfficeTranslationDownload(INPUT);

    expect(result).toEqual(err({ code: "invalid_xlsx" }));
  });

  it("writes ready translations into the target column and leaves source text alone", async () => {
    const result = await loadProjectOfficeTranslationDownload(INPUT);

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

  it("writes ready translations into Word paragraphs and keeps untranslated source text", async () => {
    mocks.getStoredFileContent.mockResolvedValue({
      content: Buffer.from(await ooxmlFixture("docx-basic")),
    });
    mocks.loadProjectTranslationsAsPrefilledEntries.mockResolvedValue(
      readyTranslations({
        prefilled: { "word/document.xml#0": "Rapport trimestriel" },
        loadedKeyCount: 8,
        translatedKeyCount: 1,
      }),
    );

    const result = await loadProjectOfficeTranslationDownload({
      ...INPUT,
      sourcePath: "docs/report.docx",
    });

    expect(isOk(result)).toBe(true);
    if (!isOk(result) || !result.value) {
      throw new Error("expected a generated Word file");
    }
    expect(result.value.contentType).toBe(DOCX_CONTENT_TYPE);
    expect(result.value.extension).toBe(".docx");
    const entries = await readDocxEntries(result.value.content);
    if (!isOk(entries)) {
      throw new Error(entries.error.code);
    }
    expect(entries.value.find((entry) => entry.key === "word/document.xml#0")?.text).toBe(
      "Rapport trimestriel",
    );
    expect(entries.value.find((entry) => entry.key === "word/document.xml#5")?.text).toBe(
      "Cell text",
    );
  });

  it("writes ready translations into PowerPoint paragraphs and keeps untranslated source text", async () => {
    mocks.getStoredFileContent.mockResolvedValue({
      content: Buffer.from(await ooxmlFixture("pptx-basic")),
    });
    mocks.loadProjectTranslationsAsPrefilledEntries.mockResolvedValue(
      readyTranslations({
        prefilled: { "ppt/slides/slide2.xml#0": "Bienvenue" },
        loadedKeyCount: 3,
        translatedKeyCount: 1,
      }),
    );

    const result = await loadProjectOfficeTranslationDownload({
      ...INPUT,
      sourcePath: "slides/deck.pptx",
    });

    expect(isOk(result)).toBe(true);
    if (!isOk(result) || !result.value) {
      throw new Error("expected a generated PowerPoint file");
    }
    expect(result.value.contentType).toBe(PPTX_CONTENT_TYPE);
    expect(result.value.extension).toBe(".pptx");
    const entries = await readPptxEntries(result.value.content);
    if (!isOk(entries)) {
      throw new Error(entries.error.code);
    }
    expect(entries.value.find((entry) => entry.key === "ppt/slides/slide2.xml#0")?.text).toBe(
      "Bienvenue",
    );
    expect(entries.value.find((entry) => entry.key === "ppt/slides/slide1.xml#0")?.text).toBe(
      "Price & plan",
    );
  });

  it("propagates Office package errors from Word and PowerPoint templates", async () => {
    mocks.getStoredFileContent.mockResolvedValue({ content: Buffer.from("not a zip") });

    const docx = await loadProjectOfficeTranslationDownload({
      ...INPUT,
      sourcePath: "docs/report.docx",
    });
    const pptx = await loadProjectOfficeTranslationDownload({
      ...INPUT,
      sourcePath: "slides/deck.pptx",
    });

    expect(docx).toEqual(
      err({ code: "invalid_office_file", format: "docx", message: "open package" }),
    );
    expect(pptx).toEqual(
      err({ code: "invalid_office_file", format: "pptx", message: "open package" }),
    );
  });
});
