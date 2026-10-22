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
  selectGoogleDrivePushMappings,
} from "./push-google-drive-translations";

const mocks = vi.hoisted(() => ({
  loadProjectOfficeTranslationDownload: vi.fn(),
  loadProjectTranslationsAsPrefilledEntries: vi.fn(),
  loadProjectLottieTranslationDownload: vi.fn(),
  loadProjectSubtitleTranslationDownload: vi.fn(),
  getImageVariant: vi.fn(),
  loadProjectFileVariant: vi.fn(),
}));

vi.mock("@/lib/projects/files/office-translation-download", () => ({
  loadProjectOfficeTranslationDownload: (...args: unknown[]) =>
    mocks.loadProjectOfficeTranslationDownload(...args),
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

vi.mock("@/lib/projects/files/image-variant-service", () => ({
  getImageVariant: (...args: unknown[]) => mocks.getImageVariant(...args),
}));

vi.mock("@/lib/projects/files/file-variant-download", () => ({
  loadProjectFileVariant: (...args: unknown[]) => mocks.loadProjectFileVariant(...args),
}));

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
    mocks.loadProjectTranslationsAsPrefilledEntries.mockReset();
    mocks.loadProjectLottieTranslationDownload.mockReset();
    mocks.loadProjectSubtitleTranslationDownload.mockReset();
    mocks.getImageVariant.mockReset();
    mocks.loadProjectFileVariant.mockReset();
    mocks.loadProjectSubtitleTranslationDownload.mockResolvedValue({ ok: true, value: null });
    mocks.getImageVariant.mockResolvedValue(null);
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

  it("returns approved plain text document variants as text/plain", async () => {
    mocks.getImageVariant.mockResolvedValue({ status: "approved" });
    mocks.loadProjectFileVariant.mockResolvedValue({
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode("Translated notes"));
          controller.close();
        },
      }),
      contentType: "text/plain; charset=utf-8",
      storedFilename: "notes.txt",
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
    expect(mocks.loadProjectTranslationsAsPrefilledEntries).not.toHaveBeenCalled();
  });

  it("returns null for plain text when the variant is missing or not approved", async () => {
    mocks.getImageVariant.mockResolvedValue({ status: "needs_review" });

    await expect(
      loadTranslatedBytes({
        ...input,
        sourcePath: "google-drive/folder/notes.txt",
        ingestFormat: "txt",
      }),
    ).resolves.toBeNull();
    expect(mocks.loadProjectTranslationsAsPrefilledEntries).not.toHaveBeenCalled();

    mocks.getImageVariant.mockResolvedValue({ status: "approved" });
    mocks.loadProjectFileVariant.mockResolvedValue(null);

    await expect(
      loadTranslatedBytes({
        ...input,
        sourcePath: "google-drive/folder/notes.txt",
        ingestFormat: "txt",
      }),
    ).resolves.toBeNull();
  });

  it("treats ingestFormat txt as plain text when the path has no extension", async () => {
    mocks.getImageVariant.mockResolvedValue({ status: "approved" });
    mocks.loadProjectFileVariant.mockResolvedValue({
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode("Translated readme"));
          controller.close();
        },
      }),
      contentType: "text/plain; charset=utf-8",
      storedFilename: "readme.txt",
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
