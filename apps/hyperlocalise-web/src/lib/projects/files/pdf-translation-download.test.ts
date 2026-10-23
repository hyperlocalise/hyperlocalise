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
import { GoSvcClientError } from "@/lib/go-svc/go-svc-request";

const mocks = vi.hoisted(() => ({
  loadProjectTranslationsAsPrefilledEntries: vi.fn(),
  getLatestRepositorySourceFileVersion: vi.fn(),
  getStoredFileContent: vi.fn(),
  pdfApply: vi.fn(),
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

vi.mock("@/lib/go-svc/go-svc-server-client", () => ({
  createGoSvcServerClient: () => ({
    pdf: { apply: (...args: unknown[]) => mocks.pdfApply(...args) },
  }),
}));

import {
  loadProjectPdfTranslationDownload,
  mcpPdfTranslationDownloadErrorCode,
  pdfTranslationDownloadFailure,
} from "./pdf-translation-download";

const INPUT = {
  organizationId: "org_1",
  projectId: "project_1",
  sourcePath: "docs/handbook.pdf",
  targetLocale: "fr-FR",
};

beforeEach(() => {
  vi.resetAllMocks();
});

describe("loadProjectPdfTranslationDownload", () => {
  it("returns null for non-PDF paths", async () => {
    const result = await loadProjectPdfTranslationDownload({
      ...INPUT,
      sourcePath: "messages/en.json",
    });
    expect(result).toEqual(ok(null));
  });

  it("returns null when the PDF has no translation keys loaded", async () => {
    mocks.loadProjectTranslationsAsPrefilledEntries.mockResolvedValue({
      prefilled: {},
      loadedKeyCount: 0,
      translatedKeyCount: 0,
    });

    const result = await loadProjectPdfTranslationDownload(INPUT);
    expect(result).toEqual(ok(null));
    expect(mocks.getLatestRepositorySourceFileVersion).not.toHaveBeenCalled();
  });

  it("returns generated PDF bytes and overflow keys", async () => {
    mocks.loadProjectTranslationsAsPrefilledEntries.mockResolvedValue({
      prefilled: { "page-1#1": "Bonjour" },
      loadedKeyCount: 1,
      translatedKeyCount: 1,
    });
    mocks.getLatestRepositorySourceFileVersion.mockResolvedValue({ storedFileId: "stored_1" });
    mocks.getStoredFileContent.mockResolvedValue({ content: new Uint8Array([1, 2, 3]) });
    mocks.pdfApply.mockResolvedValue({
      content: new Uint8Array([4, 5, 6]),
      overflowKeys: ["page-1#2"],
    });

    const result = await loadProjectPdfTranslationDownload(INPUT);
    expect(isOk(result)).toBe(true);
    if (!isOk(result) || !result.value) {
      throw new Error("expected PDF download");
    }
    expect(result.value).toMatchObject({
      contentType: "application/pdf",
      extension: ".pdf",
      translatedKeyCount: 1,
      overflowKeys: ["page-1#2"],
    });
    expect(mocks.pdfApply).toHaveBeenCalledWith({
      template: new Uint8Array([1, 2, 3]),
      values: { "page-1#1": "Bonjour" },
      targetLocale: "fr-FR",
    });
  });

  it("maps go-svc script failures to pdf_script_unsupported", async () => {
    mocks.loadProjectTranslationsAsPrefilledEntries.mockResolvedValue({
      prefilled: { "page-1#1": "مرحبا" },
      loadedKeyCount: 1,
      translatedKeyCount: 1,
    });
    mocks.getLatestRepositorySourceFileVersion.mockResolvedValue({ storedFileId: "stored_1" });
    mocks.getStoredFileContent.mockResolvedValue({ content: new Uint8Array([1]) });
    mocks.pdfApply.mockRejectedValue(
      new GoSvcClientError({
        code: "pdf_script_unsupported",
        message: "The target text uses a script this PDF export does not support.",
        status: 422,
      }),
    );

    const result = await loadProjectPdfTranslationDownload(INPUT);
    expect(result).toEqual(
      err({
        code: "pdf_script_unsupported",
        message: "The target text uses a script this PDF export does not support.",
      }),
    );
  });

  it("maps go-svc failures to pdf_export_failed", async () => {
    mocks.loadProjectTranslationsAsPrefilledEntries.mockResolvedValue({
      prefilled: { "page-1#1": "Bonjour" },
      loadedKeyCount: 1,
      translatedKeyCount: 1,
    });
    mocks.getLatestRepositorySourceFileVersion.mockResolvedValue({ storedFileId: "stored_1" });
    mocks.getStoredFileContent.mockResolvedValue({ content: new Uint8Array([1]) });
    mocks.pdfApply.mockRejectedValue(
      new GoSvcClientError({
        code: "pdf_invalid",
        message: "The PDF could not be read as a translation template.",
        status: 422,
      }),
    );

    const result = await loadProjectPdfTranslationDownload(INPUT);
    expect(result).toEqual(
      err({
        code: "pdf_export_failed",
        message: "The PDF could not be read as a translation template.",
      }),
    );
  });
});

describe("pdfTranslationDownloadFailure", () => {
  it("returns a stable export error code", () => {
    expect(pdfTranslationDownloadFailure()).toEqual({
      code: "pdf_export_failed",
      message: "Could not write translations into the PDF.",
    });
  });
});

describe("mcpPdfTranslationDownloadErrorCode", () => {
  it("maps PDF download errors to MCP codes", () => {
    expect(
      mcpPdfTranslationDownloadErrorCode({
        code: "pdf_script_unsupported",
        message: "script",
      }),
    ).toBe("pdf_script_unsupported");
    expect(mcpPdfTranslationDownloadErrorCode({ code: "source_content_not_found" })).toBe(
      "source_file_not_found",
    );
    expect(
      mcpPdfTranslationDownloadErrorCode({
        code: "pdf_export_failed",
        message: "export",
      }),
    ).toBe("pdf_export_failed");
  });
});
