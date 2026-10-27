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

import { GOOGLE_EXPORT_MIME } from "./constants";
import type { WorkspaceAutomationRecord } from "@/lib/agents/workspace-automation-types";

import {
  loadTranslatedBytes,
  readGoogleDrivePushSourcePaths,
  resolveGoogleDrivePushTargetLocales,
  resolveTranslatedBytes,
  runPushGoogleDriveTranslations,
  selectGoogleDrivePushMappings,
} from "./push-google-drive-translations";

const mocks = vi.hoisted(() => ({
  loadProjectOfficeTranslationDownload: vi.fn(),
  loadProjectPdfTranslationDownload: vi.fn(),
  loadProjectTxtTranslationDownload: vi.fn(),
  loadProjectTranslationsAsPrefilledEntries: vi.fn(),
  loadProjectLottieTranslationDownload: vi.fn(),
  loadProjectSubtitleTranslationDownload: vi.fn(),
  loadGoogleDrivePipesAccessToken: vi.fn(),
  getGoogleDriveFile: vi.fn(),
  uploadGoogleDriveFile: vi.fn(),
  dbSelect: vi.fn(),
  dbUpdate: vi.fn(),
}));

vi.mock("@/lib/projects/files/office-translation-download", () => ({
  loadProjectOfficeTranslationDownload: (...args: unknown[]) =>
    mocks.loadProjectOfficeTranslationDownload(...args),
}));

vi.mock("@/lib/projects/files/pdf-translation-download", () => ({
  loadProjectPdfTranslationDownload: (...args: unknown[]) =>
    mocks.loadProjectPdfTranslationDownload(...args),
}));

vi.mock("@/lib/projects/files/txt-translation-download", () => ({
  loadProjectTxtTranslationDownload: (...args: unknown[]) =>
    mocks.loadProjectTxtTranslationDownload(...args),
}));

vi.mock("@/lib/projects/translations/project-translation-service", () => ({
  loadProjectTranslationsAsPrefilledEntries: (...args: unknown[]) =>
    mocks.loadProjectTranslationsAsPrefilledEntries(...args),
}));

vi.mock("@/lib/projects/files/lottie-translation-download", () => ({
  loadProjectLottieTranslationDownload: (...args: unknown[]) =>
    mocks.loadProjectLottieTranslationDownload(...args),
}));

vi.mock("@/lib/projects/files/subtitle-translation-download", () => ({
  loadProjectSubtitleTranslationDownload: (...args: unknown[]) =>
    mocks.loadProjectSubtitleTranslationDownload(...args),
}));

vi.mock("./pipes", () => ({
  loadGoogleDrivePipesAccessToken: (...args: unknown[]) =>
    mocks.loadGoogleDrivePipesAccessToken(...args),
}));

vi.mock("./drive-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./drive-api")>();
  return {
    ...actual,
    getGoogleDriveFile: (...args: unknown[]) => mocks.getGoogleDriveFile(...args),
    uploadGoogleDriveFile: (...args: unknown[]) => mocks.uploadGoogleDriveFile(...args),
  };
});

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

function driveAutomation(targetLocales: string[]): WorkspaceAutomationRecord {
  return {
    id: "automation-1",
    organizationId: "org-1",
    authorUserId: "user-1",
    status: "active",
    name: "Google Drive files",
    instructions: "",
    projectId: "project-1",
    triggerConfig: {
      mode: "scheduled",
      schedule: { cadence: "daily", hourUtc: 9, timezone: "UTC" },
    },
    repositoryTarget: { kind: "none" },
    toolConfig: {
      googleDrive: {
        enabled: true,
        workosUserId: "user-1",
        folderIds: [],
        fileIds: [],
        targetLocales,
        includeTranslatedFiles: false,
        translationOutput: "folder",
        existingTranslationPolicy: "seed_empty",
      },
    },
    model: "openai/gpt-6-luna",
    configVersion: 1,
    nextRunAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

describe("resolveGoogleDrivePushTargetLocales", () => {
  it("uses project targets when the automation list is empty", () => {
    expect(resolveGoogleDrivePushTargetLocales(driveAutomation([]), ["vi-VN", "de-DE"])).toEqual([
      "vi-VN",
      "de-DE",
    ]);
  });

  it("intersects automation locales with the project, case-insensitively", () => {
    expect(
      resolveGoogleDrivePushTargetLocales(driveAutomation(["vi-VN", "de-DE"]), ["vi-vn"]),
    ).toEqual(["vi-VN"]);
    expect(resolveGoogleDrivePushTargetLocales(driveAutomation(["ja-JP"]), ["vi-VN"])).toEqual([]);
  });
});

describe("readGoogleDrivePushSourcePaths", () => {
  it("returns undefined when the snapshot omits sourcePaths", () => {
    expect(readGoogleDrivePushSourcePaths({ operation: "push_approved" })).toBeUndefined();
    expect(readGoogleDrivePushSourcePaths(null)).toBeUndefined();
  });

  it("keeps non-empty string paths", () => {
    expect(
      readGoogleDrivePushSourcePaths({
        sourcePaths: [
          "google-drive/folder/overview.docx",
          "",
          12,
          "google-drive/folder/kickoff.pptx",
        ],
      }),
    ).toEqual(["google-drive/folder/overview.docx", "google-drive/folder/kickoff.pptx"]);
  });
});

describe("selectGoogleDrivePushMappings", () => {
  it("returns every mapping when sourcePaths are omitted", () => {
    const mappings = [
      { sourcePath: "google-drive/folder/overview.docx" },
      { sourcePath: "google-drive/folder/kickoff.pptx" },
    ];
    expect(selectGoogleDrivePushMappings(mappings)).toEqual(mappings);
  });

  it("keeps only the listed paths", () => {
    expect(
      selectGoogleDrivePushMappings(
        [
          { sourcePath: "google-drive/folder/overview.docx" },
          { sourcePath: "google-drive/folder/kickoff.pptx" },
        ],
        ["google-drive/folder/overview.docx"],
      ),
    ).toEqual([{ sourcePath: "google-drive/folder/overview.docx" }]);
  });
});

describe("loadTranslatedBytes", () => {
  const input = {
    organizationId: "org_1",
    projectId: "project_1",
    targetLocale: "vi-VN",
    ingestFormat: "json",
  };

  beforeEach(() => {
    mocks.loadProjectOfficeTranslationDownload.mockReset();
    mocks.loadProjectPdfTranslationDownload.mockReset();
    mocks.loadProjectTxtTranslationDownload.mockReset();
    mocks.loadProjectTranslationsAsPrefilledEntries.mockReset();
    mocks.loadProjectLottieTranslationDownload.mockReset();
    mocks.loadProjectSubtitleTranslationDownload.mockReset();
    mocks.loadGoogleDrivePipesAccessToken.mockReset();
    mocks.getGoogleDriveFile.mockReset();
    mocks.uploadGoogleDriveFile.mockReset();
    mocks.dbSelect.mockReset();
    mocks.dbUpdate.mockReset();
    mocks.loadProjectSubtitleTranslationDownload.mockResolvedValue({ ok: true, value: null });
  });

  it("returns the office download for docx sources", async () => {
    mocks.loadProjectOfficeTranslationDownload.mockResolvedValue({
      ok: true,
      value: { content: Buffer.from("docx-bytes"), extension: ".docx" },
    });

    await expect(
      loadTranslatedBytes({
        ...input,
        sourcePath: "google-drive/folder/overview.docx",
        ingestFormat: "docx",
      }),
    ).resolves.toEqual({
      buffer: Buffer.from("docx-bytes"),
      fileName: "overview.docx",
      mimeType: GOOGLE_EXPORT_MIME.docx,
    });
    expect(mocks.loadProjectOfficeTranslationDownload).toHaveBeenCalledWith(
      expect.objectContaining({
        approvedTranslationsOnly: true,
      }),
    );
    expect(mocks.loadProjectTranslationsAsPrefilledEntries).not.toHaveBeenCalled();
  });

  it("returns the pdf download for pdf sources", async () => {
    mocks.loadProjectPdfTranslationDownload.mockResolvedValue({
      ok: true,
      value: {
        content: Buffer.from("pdf-bytes"),
        contentType: "application/pdf",
        extension: ".pdf",
        translatedKeyCount: 2,
        overflowKeys: [],
      },
    });

    await expect(
      loadTranslatedBytes({
        ...input,
        sourcePath: "google-drive/folder/report.pdf",
        ingestFormat: "pdf",
      }),
    ).resolves.toEqual({
      buffer: Buffer.from("pdf-bytes"),
      fileName: "report.pdf",
      mimeType: "application/pdf",
    });
    expect(mocks.loadProjectPdfTranslationDownload).toHaveBeenCalledWith(
      expect.objectContaining({
        approvedTranslationsOnly: true,
      }),
    );
    expect(mocks.loadProjectTranslationsAsPrefilledEntries).not.toHaveBeenCalled();
  });

  it("skips pdf sources when the download fails or has no ready translations", async () => {
    mocks.loadProjectPdfTranslationDownload.mockResolvedValue({
      ok: false,
      error: { code: "pdf_script_unsupported", message: "unsupported script" },
    });

    await expect(
      loadTranslatedBytes({
        ...input,
        sourcePath: "google-drive/folder/report.pdf",
        ingestFormat: "pdf",
      }),
    ).resolves.toBeNull();

    mocks.loadProjectPdfTranslationDownload.mockResolvedValue({ ok: true, value: null });

    await expect(
      loadTranslatedBytes({
        ...input,
        sourcePath: "google-drive/folder/report.pdf",
        ingestFormat: "pdf",
      }),
    ).resolves.toBeNull();
    expect(mocks.loadProjectTranslationsAsPrefilledEntries).not.toHaveBeenCalled();
  });

  it("serializes JSON-compatible catalogs", async () => {
    mocks.loadProjectTranslationsAsPrefilledEntries.mockResolvedValue({
      prefilled: { hello: "xin chào" },
      loadedKeyCount: 1,
      truncated: false,
    });
    mocks.loadProjectLottieTranslationDownload.mockResolvedValue({
      ok: true,
      value: null,
    });

    const result = await loadTranslatedBytes({
      ...input,
      sourcePath: "google-drive/folder/messages.json",
    });
    expect(result?.fileName).toBe("messages.json");
    expect(result?.mimeType).toBe("application/json");
    expect(result?.buffer.toString("utf8")).toContain('"hello": "xin chào"');
    expect(mocks.loadProjectTranslationsAsPrefilledEntries).toHaveBeenCalledWith(
      expect.objectContaining({
        readyTranslationsOnly: true,
        approvedTranslationsOnly: true,
        includeAllSourceKeys: true,
      }),
    );
  });

  it("skips keyed formats without a format-aware writer", async () => {
    mocks.loadProjectTranslationsAsPrefilledEntries.mockResolvedValue({
      prefilled: { hello: "xin chào" },
      loadedKeyCount: 1,
      truncated: false,
    });
    mocks.loadProjectLottieTranslationDownload.mockResolvedValue({
      ok: true,
      value: null,
    });

    await expect(
      loadTranslatedBytes({
        ...input,
        sourcePath: "google-drive/folder/guide.md",
        ingestFormat: "markdown",
      }),
    ).resolves.toBeNull();
  });

  it("returns the txt download for txt sources", async () => {
    mocks.loadProjectTxtTranslationDownload.mockResolvedValue({
      ok: true,
      value: {
        content: Buffer.from("Translated notes"),
        contentType: "text/plain; charset=utf-8",
        extension: ".txt",
        translatedKeyCount: 3,
      },
    });

    await expect(
      loadTranslatedBytes({
        ...input,
        sourcePath: "google-drive/folder/notes.txt",
        ingestFormat: "txt",
      }),
    ).resolves.toEqual({
      buffer: Buffer.from("Translated notes"),
      fileName: "notes.txt",
      mimeType: "text/plain; charset=utf-8",
    });
    expect(mocks.loadProjectTxtTranslationDownload).toHaveBeenCalledWith(
      expect.objectContaining({
        approvedTranslationsOnly: true,
      }),
    );
    expect(mocks.loadProjectTranslationsAsPrefilledEntries).not.toHaveBeenCalled();
  });

  it("returns null for txt when the download has no ready translations", async () => {
    mocks.loadProjectTxtTranslationDownload.mockResolvedValue({ ok: true, value: null });
    await expect(
      loadTranslatedBytes({
        ...input,
        sourcePath: "google-drive/folder/notes.txt",
        ingestFormat: "txt",
      }),
    ).resolves.toBeNull();

    mocks.loadProjectTxtTranslationDownload.mockResolvedValue({
      ok: false,
      error: { code: "plaintext_export_failed", message: "Could not write translations." },
    });

    await expect(
      loadTranslatedBytes({
        ...input,
        sourcePath: "google-drive/folder/notes.txt",
        ingestFormat: "txt",
      }),
    ).resolves.toBeNull();
  });

  it("returns null for txt when no keys have approved translations", async () => {
    mocks.loadProjectTxtTranslationDownload.mockResolvedValue({
      ok: true,
      value: {
        content: Buffer.from("Source notes"),
        contentType: "text/plain; charset=utf-8",
        extension: ".txt",
        translatedKeyCount: 0,
      },
    });

    await expect(
      loadTranslatedBytes({
        ...input,
        sourcePath: "google-drive/folder/notes.txt",
        ingestFormat: "txt",
      }),
    ).resolves.toBeNull();
  });

  it("returns null for pdf when no keys have approved translations", async () => {
    mocks.loadProjectPdfTranslationDownload.mockResolvedValue({
      ok: true,
      value: {
        content: Buffer.from("source-pdf-bytes"),
        contentType: "application/pdf",
        extension: ".pdf",
        translatedKeyCount: 0,
        overflowKeys: [],
      },
    });

    await expect(
      loadTranslatedBytes({
        ...input,
        sourcePath: "google-drive/folder/report.pdf",
        ingestFormat: "pdf",
      }),
    ).resolves.toBeNull();
  });

  it("treats ingestFormat txt as plain text when the path has no extension", async () => {
    mocks.loadProjectTxtTranslationDownload.mockResolvedValue({
      ok: true,
      value: {
        content: Buffer.from("Translated readme"),
        contentType: "text/plain; charset=utf-8",
        extension: ".txt",
        translatedKeyCount: 1,
      },
    });

    await expect(
      loadTranslatedBytes({
        ...input,
        sourcePath: "google-drive/folder/readme",
        ingestFormat: "txt",
      }),
    ).resolves.toEqual({
      buffer: Buffer.from("Translated readme"),
      fileName: "readme",
      mimeType: "text/plain; charset=utf-8",
    });
  });

  it("returns subtitle exports for .srt sources", async () => {
    mocks.loadProjectTranslationsAsPrefilledEntries.mockResolvedValue({
      prefilled: { "srt.0001": "xin chào" },
      loadedKeyCount: 1,
      truncated: false,
    });
    mocks.loadProjectLottieTranslationDownload.mockResolvedValue({
      ok: true,
      value: null,
    });
    mocks.loadProjectSubtitleTranslationDownload.mockResolvedValue({
      ok: true,
      value: {
        content: Buffer.from("srt-bytes"),
        contentType: "application/x-subrip",
        extension: ".srt",
      },
    });

    await expect(
      loadTranslatedBytes({
        ...input,
        sourcePath: "google-drive/folder/captions.srt",
        ingestFormat: "srt",
      }),
    ).resolves.toEqual({
      buffer: Buffer.from("srt-bytes"),
      fileName: "captions.srt",
      mimeType: "application/x-subrip",
    });
  });

  it("returns the Lottie export when the source is a Lottie file", async () => {
    mocks.loadProjectTranslationsAsPrefilledEntries.mockResolvedValue({
      prefilled: { "layers.0.t": "xin chào" },
      loadedKeyCount: 1,
      truncated: false,
    });
    mocks.loadProjectLottieTranslationDownload.mockResolvedValue({
      ok: true,
      value: {
        content: Buffer.from("lottie-bytes"),
        contentType: "application/json; charset=utf-8",
        kind: "json",
      },
    });

    await expect(
      loadTranslatedBytes({
        ...input,
        sourcePath: "google-drive/folder/intro.json",
      }),
    ).resolves.toEqual({
      buffer: Buffer.from("lottie-bytes"),
      fileName: "intro.json",
      mimeType: "application/json; charset=utf-8",
    });
  });
});

describe("resolveTranslatedBytes", () => {
  const input = {
    organizationId: "org_1",
    projectId: "project_1",
    targetLocale: "vi-VN",
    ingestFormat: "json",
  };

  it("reports no_approved_translations for txt without ready translations", async () => {
    mocks.loadProjectTxtTranslationDownload.mockResolvedValue({ ok: true, value: null });

    await expect(
      resolveTranslatedBytes({
        ...input,
        sourcePath: "google-drive/folder/notes.txt",
        ingestFormat: "txt",
      }),
    ).resolves.toEqual({ status: "skipped", reason: "no_approved_translations" });
  });

  it("reports unsupported_format for keyed formats without a writer", async () => {
    mocks.loadProjectTranslationsAsPrefilledEntries.mockResolvedValue({
      prefilled: { hello: "xin chào" },
      loadedKeyCount: 1,
      truncated: false,
    });
    mocks.loadProjectLottieTranslationDownload.mockResolvedValue({
      ok: true,
      value: null,
    });

    await expect(
      resolveTranslatedBytes({
        ...input,
        sourcePath: "google-drive/folder/guide.md",
        ingestFormat: "markdown",
      }),
    ).resolves.toEqual({ status: "skipped", reason: "unsupported_format" });
  });

  it("reports no_approved_translations when no ready translations exist", async () => {
    mocks.loadProjectOfficeTranslationDownload.mockResolvedValue({ ok: true, value: null });

    await expect(
      resolveTranslatedBytes({
        ...input,
        sourcePath: "google-drive/folder/overview.docx",
        ingestFormat: "docx",
      }),
    ).resolves.toEqual({ status: "skipped", reason: "no_approved_translations" });
  });
});

describe("runPushGoogleDriveTranslations", () => {
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

  it("records skippedFiles with reasons when locales cannot be pushed", async () => {
    selectQueue([
      [{ id: "project-1", source: "native", targetLocales: ["vi-VN"] }],
      [
        {
          id: "map-1",
          automationId: "automation-1",
          projectId: "project-1",
          folderId: "folder-1",
          driveFileId: "drive-1",
          mimeType: "text/plain",
          ingestFormat: "txt",
          sourcePath: "google-drive/folder/notes.txt",
          localeFolderIds: {},
          translatedFileIds: {},
          lastPushContentHash: {},
          status: "active",
        },
      ],
    ]);
    mocks.dbUpdate.mockImplementation(() => ({
      set: () => ({ where: async () => [] }),
    }));
    mocks.loadGoogleDrivePipesAccessToken.mockResolvedValue({ ok: true, value: "token" });
    mocks.getGoogleDriveFile.mockResolvedValue({
      ok: true,
      value: { parents: ["parent-1"], driveId: null },
    });
    mocks.loadProjectTxtTranslationDownload.mockResolvedValue({ ok: true, value: null });

    await expect(
      runPushGoogleDriveTranslations({
        organizationId: "org-1",
        automation: driveAutomation([]),
      }),
    ).resolves.toEqual({
      pushed: 0,
      skipped: 1,
      failed: 0,
      skippedFiles: [
        {
          sourcePath: "google-drive/folder/notes.txt",
          driveFileId: "drive-1",
          locales: [{ locale: "vi-VN", reason: "no_approved_translations" }],
        },
      ],
      partialFiles: [],
    });
    expect(mocks.uploadGoogleDriveFile).not.toHaveBeenCalled();
  });

  it("records partialFiles when a pushed pdf has overflowing blocks", async () => {
    selectQueue([
      [{ id: "project-1", source: "native", targetLocales: ["vi-VN"] }],
      [
        {
          id: "map-1",
          automationId: "automation-1",
          projectId: "project-1",
          folderId: "folder-1",
          driveFileId: "drive-1",
          mimeType: "application/pdf",
          ingestFormat: "pdf",
          sourcePath: "google-drive/folder/report.pdf",
          localeFolderIds: {},
          translatedFileIds: {},
          lastPushContentHash: {},
          status: "active",
        },
      ],
    ]);
    mocks.dbUpdate.mockImplementation(() => ({
      set: () => ({ where: async () => [] }),
    }));
    mocks.loadGoogleDrivePipesAccessToken.mockResolvedValue({ ok: true, value: "token" });
    mocks.getGoogleDriveFile.mockResolvedValue({
      ok: true,
      value: { parents: ["parent-1"], driveId: null },
    });
    mocks.loadProjectPdfTranslationDownload.mockResolvedValue({
      ok: true,
      value: {
        content: Buffer.from("pdf-bytes"),
        contentType: "application/pdf",
        extension: ".pdf",
        translatedKeyCount: 2,
        overflowKeys: ["block-7"],
      },
    });
    mocks.uploadGoogleDriveFile.mockResolvedValue({ ok: true, value: { id: "drive-2" } });
    const automation = driveAutomation([]);
    automation.toolConfig.googleDrive!.translationOutput = "suffix";

    await expect(
      runPushGoogleDriveTranslations({
        organizationId: "org-1",
        automation,
      }),
    ).resolves.toEqual({
      pushed: 1,
      skipped: 0,
      failed: 0,
      skippedFiles: [],
      partialFiles: [
        {
          sourcePath: "google-drive/folder/report.pdf",
          driveFileId: "drive-1",
          locales: [{ locale: "vi-VN", overflowKeys: ["block-7"] }],
        },
      ],
    });
  });
});
