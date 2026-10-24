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

const mocks = vi.hoisted(() => ({
  getRepositorySourceFileByPath: vi.fn(),
  loadProjectTranslationsAsPrefilledEntries: vi.fn(),
  loadProjectLottieTranslationDownload: vi.fn(),
  inferSupportedTranslationFileFormat: vi.fn(),
  loadProjectOfficeTranslationDownload: vi.fn(),
  loadProjectPdfTranslationDownload: vi.fn(),
}));

vi.mock("@/lib/projects/files/office-translation-download", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/projects/files/office-translation-download")>()),
  loadProjectOfficeTranslationDownload: (...args: unknown[]) =>
    mocks.loadProjectOfficeTranslationDownload(...args),
}));

vi.mock("@/lib/projects/files/pdf-translation-download", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/projects/files/pdf-translation-download")>()),
  loadProjectPdfTranslationDownload: (...args: unknown[]) =>
    mocks.loadProjectPdfTranslationDownload(...args),
}));

vi.mock("@/lib/projects/translations/project-translation-service", () => ({
  getRepositorySourceFileByPath: (...args: unknown[]) =>
    mocks.getRepositorySourceFileByPath(...args),
  loadProjectTranslationsAsPrefilledEntries: (...args: unknown[]) =>
    mocks.loadProjectTranslationsAsPrefilledEntries(...args),
}));

vi.mock("@/lib/translation/file-formats", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/translation/file-formats")>()),
  inferSupportedTranslationFileFormat: (...args: unknown[]) =>
    mocks.inferSupportedTranslationFileFormat(...args),
}));

vi.mock("@/lib/projects/files/lottie-translation-download", () => ({
  loadProjectLottieTranslationDownload: (...args: unknown[]) =>
    mocks.loadProjectLottieTranslationDownload(...args),
}));

import { downloadMcpTranslations } from "./mcp-download-translations";

describe("downloadMcpTranslations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getRepositorySourceFileByPath.mockResolvedValue({ id: "file_1" });
    mocks.inferSupportedTranslationFileFormat.mockReturnValue("json");
    mocks.loadProjectLottieTranslationDownload.mockResolvedValue({ ok: true, value: null });
    mocks.loadProjectOfficeTranslationDownload.mockResolvedValue({ ok: true, value: null });
    mocks.loadProjectPdfTranslationDownload.mockResolvedValue({ ok: true, value: null });
  });

  it("returns source_file_too_large with the key limit when prefill is truncated", async () => {
    mocks.loadProjectTranslationsAsPrefilledEntries.mockResolvedValue({
      truncated: true,
      maxKeyCount: 5_000,
      loadedKeyCount: 5_000,
      prefilled: {},
    });

    const result = await downloadMcpTranslations({
      organizationId: "org_1",
      projectId: "project_1",
      sourcePath: "locales/en.json",
      locale: "fr-FR",
    });

    expect(result).toEqual({
      ok: false,
      error: "source_file_too_large",
      maxKeyCount: 5_000,
    });
    expect(mocks.loadProjectTranslationsAsPrefilledEntries).toHaveBeenCalledWith({
      organizationId: "org_1",
      projectId: "project_1",
      sourcePath: "locales/en.json",
      targetLocale: "fr-FR",
      includeAllSourceKeys: true,
    });
  });

  it("rejects unsupported binary formats before loading translations", async () => {
    mocks.inferSupportedTranslationFileFormat.mockReturnValue("xliff");

    const result = await downloadMcpTranslations({
      organizationId: "org_1",
      projectId: "project_1",
      sourcePath: "locales/en.xliff",
      locale: "fr-FR",
    });

    expect(result).toEqual({
      ok: false,
      error: "unsupported_binary_download",
    });
    expect(mocks.loadProjectTranslationsAsPrefilledEntries).not.toHaveBeenCalled();
  });

  it("returns dotLottie exports as base64 with the dotLottie content type", async () => {
    mocks.inferSupportedTranslationFileFormat.mockReturnValue("lottie");
    mocks.loadProjectTranslationsAsPrefilledEntries.mockResolvedValue({
      truncated: false,
      maxKeyCount: 5_000,
      loadedKeyCount: 1,
      prefilled: { "a/caption.json#layers[0].t.d.k[0].s.t": "Bonjour" },
    });
    mocks.loadProjectLottieTranslationDownload.mockResolvedValue({
      ok: true,
      value: {
        kind: "dotlottie",
        contentType: "application/zip+dotlottie",
        content: Buffer.from("PK\x03\x04lottie"),
      },
    });

    const result = await downloadMcpTranslations({
      organizationId: "org_1",
      projectId: "project_1",
      sourcePath: "animations/intro.lottie",
      locale: "fr-FR",
    });

    expect(result).toEqual({
      ok: true,
      value: {
        filename: "intro-fr-FR.lottie",
        contentType: "application/zip+dotlottie",
        locale: "fr-FR",
        sourcePath: "animations/intro.lottie",
        contentEncoding: "base64",
        content: Buffer.from("PK\x03\x04lottie").toString("base64"),
      },
    });
  });

  it("returns segmented Excel workbooks as base64 before the binary format check", async () => {
    mocks.inferSupportedTranslationFileFormat.mockReturnValue("xlsx");
    mocks.loadProjectOfficeTranslationDownload.mockResolvedValue({
      ok: true,
      value: {
        contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        content: Buffer.from("PK\x03\x04xlsx"),
        extension: ".xlsx",
        translatedKeyCount: 1,
      },
    });

    const result = await downloadMcpTranslations({
      organizationId: "org_1",
      projectId: "project_1",
      sourcePath: "copy/strings.xlsx",
      locale: "fr-FR",
    });

    expect(result).toEqual({
      ok: true,
      value: {
        filename: "strings-fr-FR.xlsx",
        contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        locale: "fr-FR",
        sourcePath: "copy/strings.xlsx",
        contentEncoding: "base64",
        content: Buffer.from("PK\x03\x04xlsx").toString("base64"),
      },
    });
    expect(mocks.loadProjectOfficeTranslationDownload).toHaveBeenCalledWith({
      organizationId: "org_1",
      projectId: "project_1",
      sourcePath: "copy/strings.xlsx",
      targetLocale: "fr-FR",
    });
    expect(mocks.loadProjectTranslationsAsPrefilledEntries).not.toHaveBeenCalled();
  });

  it("returns segmented Word and PowerPoint files as base64 before the binary format check", async () => {
    mocks.inferSupportedTranslationFileFormat.mockReturnValue("docx");
    mocks.loadProjectOfficeTranslationDownload.mockResolvedValue({
      ok: true,
      value: {
        contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        content: Buffer.from("PK\x03\x04docx"),
        extension: ".docx",
        translatedKeyCount: 1,
      },
    });

    const docx = await downloadMcpTranslations({
      organizationId: "org_1",
      projectId: "project_1",
      sourcePath: "docs/report.docx",
      locale: "fr-FR",
    });

    expect(docx).toEqual({
      ok: true,
      value: {
        filename: "report-fr-FR.docx",
        contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        locale: "fr-FR",
        sourcePath: "docs/report.docx",
        contentEncoding: "base64",
        content: Buffer.from("PK\x03\x04docx").toString("base64"),
      },
    });
    expect(mocks.loadProjectTranslationsAsPrefilledEntries).not.toHaveBeenCalled();

    mocks.loadProjectOfficeTranslationDownload.mockResolvedValue({
      ok: true,
      value: {
        contentType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        content: Buffer.from("PK\x03\x04pptx"),
        extension: ".pptx",
        translatedKeyCount: 1,
      },
    });

    const pptx = await downloadMcpTranslations({
      organizationId: "org_1",
      projectId: "project_1",
      sourcePath: "slides/deck.pptx",
      locale: "fr-FR",
    });

    expect(pptx).toEqual({
      ok: true,
      value: {
        filename: "deck-fr-FR.pptx",
        contentType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        locale: "fr-FR",
        sourcePath: "slides/deck.pptx",
        contentEncoding: "base64",
        content: Buffer.from("PK\x03\x04pptx").toString("base64"),
      },
    });
  });

  it("returns segmented PDF files as base64 before the binary format check", async () => {
    mocks.loadProjectPdfTranslationDownload.mockResolvedValue({
      ok: true,
      value: {
        contentType: "application/pdf",
        content: Buffer.from("%PDF-1.4"),
        extension: ".pdf",
        translatedKeyCount: 2,
        overflowKeys: ["page-1#3"],
      },
    });

    const pdf = await downloadMcpTranslations({
      organizationId: "org_1",
      projectId: "project_1",
      sourcePath: "docs/handbook.pdf",
      locale: "fr-FR",
    });

    expect(pdf).toEqual({
      ok: true,
      value: {
        filename: "handbook-fr-FR.pdf",
        contentType: "application/pdf",
        locale: "fr-FR",
        sourcePath: "docs/handbook.pdf",
        contentEncoding: "base64",
        content: Buffer.from("%PDF-1.4").toString("base64"),
        overflowKeys: ["page-1#3"],
      },
    });
    expect(mocks.loadProjectPdfTranslationDownload).toHaveBeenCalledWith({
      organizationId: "org_1",
      projectId: "project_1",
      sourcePath: "docs/handbook.pdf",
      targetLocale: "fr-FR",
    });
    expect(mocks.loadProjectTranslationsAsPrefilledEntries).not.toHaveBeenCalled();
  });

  it("maps PDF export failures to pdf_export_failed", async () => {
    mocks.loadProjectPdfTranslationDownload.mockResolvedValue({
      ok: false,
      error: { code: "pdf_export_failed", message: "Could not write translations into the PDF." },
    });

    await expect(
      downloadMcpTranslations({
        organizationId: "org_1",
        projectId: "project_1",
        sourcePath: "docs/handbook.pdf",
        locale: "fr-FR",
      }),
    ).resolves.toEqual({ ok: false, error: "pdf_export_failed" });
  });

  it("maps PDF script failures to pdf_script_unsupported", async () => {
    mocks.loadProjectPdfTranslationDownload.mockResolvedValue({
      ok: false,
      error: {
        code: "pdf_script_unsupported",
        message: "The target text uses a script this PDF export does not support.",
      },
    });

    await expect(
      downloadMcpTranslations({
        organizationId: "org_1",
        projectId: "project_1",
        sourcePath: "docs/handbook.pdf",
        locale: "fr-FR",
      }),
    ).resolves.toEqual({ ok: false, error: "pdf_script_unsupported" });
  });

  it("maps missing PDF source content to source_file_not_found", async () => {
    mocks.loadProjectPdfTranslationDownload.mockResolvedValue({
      ok: false,
      error: { code: "source_content_not_found" },
    });

    await expect(
      downloadMcpTranslations({
        organizationId: "org_1",
        projectId: "project_1",
        sourcePath: "docs/handbook.pdf",
        locale: "fr-FR",
      }),
    ).resolves.toEqual({ ok: false, error: "source_file_not_found" });
  });

  it("maps Office export failures to format-specific MCP errors", async () => {
    mocks.loadProjectOfficeTranslationDownload.mockResolvedValue({
      ok: false,
      error: { code: "invalid_xlsx" },
    });

    await expect(
      downloadMcpTranslations({
        organizationId: "org_1",
        projectId: "project_1",
        sourcePath: "copy/strings.xlsx",
        locale: "fr-FR",
      }),
    ).resolves.toEqual({ ok: false, error: "xlsx_export_failed" });

    mocks.loadProjectOfficeTranslationDownload.mockResolvedValue({
      ok: false,
      error: { code: "invalid_office_file", format: "docx", message: "open package" },
    });

    await expect(
      downloadMcpTranslations({
        organizationId: "org_1",
        projectId: "project_1",
        sourcePath: "docs/report.docx",
        locale: "fr-FR",
      }),
    ).resolves.toEqual({ ok: false, error: "office_export_failed" });
  });

  it("rejects PDF paths that have no generated download as unsupported binary", async () => {
    mocks.inferSupportedTranslationFileFormat.mockReturnValue("pdf");

    await expect(
      downloadMcpTranslations({
        organizationId: "org_1",
        projectId: "project_1",
        sourcePath: "docs/handbook.pdf",
        locale: "fr-FR",
      }),
    ).resolves.toEqual({ ok: false, error: "unsupported_binary_download" });
    expect(mocks.loadProjectTranslationsAsPrefilledEntries).not.toHaveBeenCalled();
  });

  it("keeps rejecting Excel workbooks without segments", async () => {
    mocks.inferSupportedTranslationFileFormat.mockReturnValue("xlsx");

    const result = await downloadMcpTranslations({
      organizationId: "org_1",
      projectId: "project_1",
      sourcePath: "copy/legacy.xlsx",
      locale: "fr-FR",
    });

    expect(result).toEqual({ ok: false, error: "unsupported_binary_download" });
  });

  it("returns translations_not_found when no keys load", async () => {
    mocks.loadProjectTranslationsAsPrefilledEntries.mockResolvedValue({
      truncated: false,
      maxKeyCount: 5_000,
      loadedKeyCount: 0,
      prefilled: {},
    });

    const result = await downloadMcpTranslations({
      organizationId: "org_1",
      projectId: "project_1",
      sourcePath: "locales/en.json",
      locale: "fr-FR",
    });

    expect(result).toEqual({
      ok: false,
      error: "translations_not_found",
    });
  });
});
