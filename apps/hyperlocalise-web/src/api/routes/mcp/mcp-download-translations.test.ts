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
}));

vi.mock("@/lib/projects/files/office-translation-download", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/projects/files/office-translation-download")>()),
  loadProjectOfficeTranslationDownload: (...args: unknown[]) =>
    mocks.loadProjectOfficeTranslationDownload(...args),
}));

vi.mock("@/lib/projects/translations/project-translation-service", () => ({
  getRepositorySourceFileByPath: (...args: unknown[]) =>
    mocks.getRepositorySourceFileByPath(...args),
  loadProjectTranslationsAsPrefilledEntries: (...args: unknown[]) =>
    mocks.loadProjectTranslationsAsPrefilledEntries(...args),
}));

vi.mock("@/lib/translation/file-formats", () => ({
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
