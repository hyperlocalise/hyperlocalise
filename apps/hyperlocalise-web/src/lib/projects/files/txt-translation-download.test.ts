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
  plaintextApply: vi.fn(),
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
    plaintext: { apply: (...args: unknown[]) => mocks.plaintextApply(...args) },
  }),
}));

import {
  loadProjectTxtTranslationDownload,
  txtTranslationDownloadFailure,
} from "./txt-translation-download";

const INPUT = {
  organizationId: "org_1",
  projectId: "project_1",
  sourcePath: "docs/notes.txt",
  targetLocale: "fr-FR",
};

beforeEach(() => {
  vi.resetAllMocks();
});

describe("loadProjectTxtTranslationDownload", () => {
  it("returns null when the file has no translation keys loaded", async () => {
    mocks.loadProjectTranslationsAsPrefilledEntries.mockResolvedValue({
      prefilled: {},
      loadedKeyCount: 0,
      translatedKeyCount: 0,
    });

    const result = await loadProjectTxtTranslationDownload(INPUT);
    expect(result).toEqual(ok(null));
    expect(mocks.getLatestRepositorySourceFileVersion).not.toHaveBeenCalled();
  });

  it("returns rendered text bytes from approved translations", async () => {
    mocks.loadProjectTranslationsAsPrefilledEntries.mockResolvedValue({
      prefilled: { "txt.0001": "Bonjour" },
      loadedKeyCount: 1,
      translatedKeyCount: 1,
    });
    mocks.getLatestRepositorySourceFileVersion.mockResolvedValue({ storedFileId: "stored_1" });
    mocks.getStoredFileContent.mockResolvedValue({ content: new Uint8Array([1, 2, 3]) });
    mocks.plaintextApply.mockResolvedValue({
      content: new Uint8Array([4, 5, 6]),
    });

    const result = await loadProjectTxtTranslationDownload(INPUT);
    expect(isOk(result)).toBe(true);
    if (!isOk(result) || !result.value) {
      throw new Error("expected TXT download");
    }
    expect(result.value).toMatchObject({
      contentType: "text/plain; charset=utf-8",
      extension: ".txt",
      translatedKeyCount: 1,
    });
    expect(mocks.plaintextApply).toHaveBeenCalledWith({
      template: new Uint8Array([1, 2, 3]),
      values: { "txt.0001": "Bonjour" },
      targetLocale: "fr-FR",
    });
  });

  it("returns source_content_not_found when the stored source is missing", async () => {
    mocks.loadProjectTranslationsAsPrefilledEntries.mockResolvedValue({
      prefilled: { "txt.0001": "Bonjour" },
      loadedKeyCount: 1,
      translatedKeyCount: 1,
    });
    mocks.getLatestRepositorySourceFileVersion.mockResolvedValue(null);

    const result = await loadProjectTxtTranslationDownload(INPUT);
    expect(result).toEqual(err({ code: "source_content_not_found" }));
    expect(mocks.plaintextApply).not.toHaveBeenCalled();
  });

  it("maps go-svc failures to plaintext_export_failed", async () => {
    mocks.loadProjectTranslationsAsPrefilledEntries.mockResolvedValue({
      prefilled: { "txt.0001": "Bonjour" },
      loadedKeyCount: 1,
      translatedKeyCount: 1,
    });
    mocks.getLatestRepositorySourceFileVersion.mockResolvedValue({ storedFileId: "stored_1" });
    mocks.getStoredFileContent.mockResolvedValue({ content: new Uint8Array([1]) });
    mocks.plaintextApply.mockRejectedValue(
      new GoSvcClientError({
        code: "plaintext_export_failed",
        message: "Could not write translations into the text file.",
        status: 500,
      }),
    );

    const result = await loadProjectTxtTranslationDownload(INPUT);
    expect(result).toEqual(
      err({
        code: "plaintext_export_failed",
        message: "Could not write translations into the text file.",
      }),
    );
  });

  it("reports the txt download failure code and message", () => {
    expect(txtTranslationDownloadFailure()).toEqual({
      code: "plaintext_export_failed",
      message: "Could not write translations into the text file.",
    });
  });
});
