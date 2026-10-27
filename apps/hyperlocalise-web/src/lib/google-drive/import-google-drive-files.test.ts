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
import { createHash } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { WorkspaceAutomationRecord } from "@/lib/agents/workspace-automation-types";

const mocks = vi.hoisted(() => ({
  dbSelect: vi.fn(),
  dbInsert: vi.fn(),
  loadGoogleDrivePipesAccessToken: vi.fn(),
  getGoogleDriveFile: vi.fn(),
  downloadGoogleDriveMedia: vi.fn(),
  exportGoogleDriveFile: vi.fn(),
  uploadSourceFile: vi.fn(),
  waitForSourceFileVersionIngest: vi.fn(),
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

vi.mock("./pipes", () => ({
  loadGoogleDrivePipesAccessToken: (...args: unknown[]) =>
    mocks.loadGoogleDrivePipesAccessToken(...args),
}));

vi.mock("./drive-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./drive-api")>();
  return {
    ...actual,
    getGoogleDriveFile: (...args: unknown[]) => mocks.getGoogleDriveFile(...args),
    downloadGoogleDriveMedia: (...args: unknown[]) => mocks.downloadGoogleDriveMedia(...args),
    exportGoogleDriveFile: (...args: unknown[]) => mocks.exportGoogleDriveFile(...args),
  };
});

vi.mock("@/lib/projects/files/source-file-upload-service", () => ({
  uploadSourceFile: (...args: unknown[]) => mocks.uploadSourceFile(...args),
}));

vi.mock("@/lib/intercom/wait-for-source-file-ingest", () => ({
  waitForSourceFileVersionIngest: (...args: unknown[]) =>
    mocks.waitForSourceFileVersionIngest(...args),
}));

import { runImportGoogleDriveFiles } from "./import-google-drive-files";

const PDF_BYTES = Buffer.from("%PDF-1.4 imported brief");
const PDF_HASH = createHash("sha256").update(PDF_BYTES).digest("hex");

function automation(
  overrides: Partial<WorkspaceAutomationRecord> & {
    toolConfig?: WorkspaceAutomationRecord["toolConfig"];
  } = {},
): WorkspaceAutomationRecord {
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
    toolConfig: overrides.toolConfig ?? {
      googleDrive: {
        enabled: true,
        workosUserId: "user-1",
        folderIds: [],
        fileIds: [],
        targetLocales: [],
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
    ...overrides,
  };
}

function pdfFileAutomation() {
  return automation({
    toolConfig: {
      googleDrive: {
        enabled: true,
        workosUserId: "user-1",
        folderIds: [],
        fileIds: ["drive-pdf-1"],
        targetLocales: [],
        includeTranslatedFiles: false,
        translationOutput: "folder",
        existingTranslationPolicy: "seed_empty",
      },
    },
  });
}

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

function mockPdfDriveFile() {
  mocks.getGoogleDriveFile.mockResolvedValue({
    ok: true,
    value: {
      id: "drive-pdf-1",
      name: "brief.pdf",
      mimeType: "application/pdf",
      size: PDF_BYTES.length,
      modifiedTime: "2026-10-27T00:00:00.000Z",
      md5Checksum: "pdf-md5",
      parents: ["folder-root"],
      driveId: null,
    },
  });
  mocks.downloadGoogleDriveMedia.mockResolvedValue({ ok: true, value: PDF_BYTES });
}

describe("runImportGoogleDriveFiles", () => {
  beforeEach(() => {
    mocks.dbSelect.mockReset();
    mocks.dbInsert.mockReset();
    mocks.loadGoogleDrivePipesAccessToken.mockReset();
    mocks.getGoogleDriveFile.mockReset();
    mocks.downloadGoogleDriveMedia.mockReset();
    mocks.exportGoogleDriveFile.mockReset();
    mocks.uploadSourceFile.mockReset();
    mocks.waitForSourceFileVersionIngest.mockReset();
    mocks.dbInsert.mockImplementation(() => ({
      values: () => ({
        onConflictDoUpdate: async () => [],
      }),
    }));
  });

  it("rejects when Google Drive is disabled or missing a WorkOS user", async () => {
    await expect(
      runImportGoogleDriveFiles({
        organizationId: "org-1",
        automation: automation({ toolConfig: {} }),
      }),
    ).rejects.toThrow("google_drive_not_configured");
    await expect(
      runImportGoogleDriveFiles({
        organizationId: "org-1",
        automation: automation({
          toolConfig: {
            googleDrive: {
              enabled: true,
              folderIds: ["11111111-1111-1111-1111-111111111111"],
              fileIds: [],
              targetLocales: [],
              includeTranslatedFiles: false,
              translationOutput: "folder",
              existingTranslationPolicy: "seed_empty",
            },
          },
        }),
      }),
    ).rejects.toThrow("google_drive_not_configured");
  });

  it("rejects when no folders or files are selected", async () => {
    await expect(
      runImportGoogleDriveFiles({
        organizationId: "org-1",
        automation: automation(),
      }),
    ).rejects.toThrow("google_drive_folders_required");
  });

  it("rejects when the automation has no project", async () => {
    await expect(
      runImportGoogleDriveFiles({
        organizationId: "org-1",
        automation: automation({
          projectId: null,
          toolConfig: {
            googleDrive: {
              enabled: true,
              workosUserId: "user-1",
              folderIds: ["11111111-1111-1111-1111-111111111111"],
              fileIds: [],
              targetLocales: [],
              includeTranslatedFiles: false,
              translationOutput: "folder",
              existingTranslationPolicy: "seed_empty",
            },
          },
        }),
      }),
    ).rejects.toThrow("project_not_found");
  });

  it("rejects when the project is missing or is not native", async () => {
    mocks.loadGoogleDrivePipesAccessToken.mockResolvedValue({ ok: true, value: "token" });
    selectQueue([[]]);
    await expect(
      runImportGoogleDriveFiles({
        organizationId: "org-1",
        automation: pdfFileAutomation(),
      }),
    ).rejects.toThrow("google_drive_native_project_required");

    selectQueue([[{ id: "project-1", source: "external_tms", targetLocales: ["vi-VN"] }]]);
    await expect(
      runImportGoogleDriveFiles({
        organizationId: "org-1",
        automation: pdfFileAutomation(),
      }),
    ).rejects.toThrow("google_drive_native_project_required");
  });

  it("downloads an explicitly selected PDF via Drive media and uploads it", async () => {
    selectQueue([[{ id: "project-1", source: "native", targetLocales: ["vi-VN"] }], []]);
    mocks.loadGoogleDrivePipesAccessToken.mockResolvedValue({ ok: true, value: "token" });
    mockPdfDriveFile();
    mocks.uploadSourceFile.mockResolvedValue({
      ok: true,
      value: {
        destination: "native",
        file: { sourceFileVersionId: "version-1" },
      },
    });
    mocks.waitForSourceFileVersionIngest.mockResolvedValue("ingested");

    await expect(
      runImportGoogleDriveFiles({
        organizationId: "org-1",
        automation: pdfFileAutomation(),
      }),
    ).resolves.toEqual({ imported: 1, skipped: 0, failed: 0, truncated: 0 });

    expect(mocks.downloadGoogleDriveMedia).toHaveBeenCalledWith({
      accessToken: "token",
      fileId: "drive-pdf-1",
    });
    expect(mocks.exportGoogleDriveFile).not.toHaveBeenCalled();
    expect(mocks.uploadSourceFile).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org-1",
        sourcePath: "google-drive/folder-root/brief.pdf",
        sourceHash: PDF_HASH,
        uploadSurface: "google_drive",
        format: "pdf",
        file: {
          filename: "brief.pdf",
          contentType: "application/pdf",
          content: PDF_BYTES,
        },
      }),
    );
    expect(mocks.dbInsert).toHaveBeenCalled();
  });

  it("skips a PDF whose source content hash is unchanged", async () => {
    selectQueue([
      [{ id: "project-1", source: "native", targetLocales: ["vi-VN"] }],
      [{ sourceContentHash: PDF_HASH }],
    ]);
    mocks.loadGoogleDrivePipesAccessToken.mockResolvedValue({ ok: true, value: "token" });
    mockPdfDriveFile();

    await expect(
      runImportGoogleDriveFiles({
        organizationId: "org-1",
        automation: pdfFileAutomation(),
      }),
    ).resolves.toEqual({ imported: 0, skipped: 1, failed: 0, truncated: 0 });

    expect(mocks.downloadGoogleDriveMedia).toHaveBeenCalled();
    expect(mocks.uploadSourceFile).not.toHaveBeenCalled();
    expect(mocks.dbInsert).not.toHaveBeenCalled();
  });

  it("re-imports a PDF when the downloaded bytes no longer match the stored hash", async () => {
    selectQueue([
      [{ id: "project-1", source: "native", targetLocales: ["vi-VN"] }],
      [{ sourceContentHash: "stale-hash" }],
    ]);
    mocks.loadGoogleDrivePipesAccessToken.mockResolvedValue({ ok: true, value: "token" });
    mockPdfDriveFile();
    mocks.uploadSourceFile.mockResolvedValue({
      ok: true,
      value: {
        destination: "native",
        file: { sourceFileVersionId: "version-2" },
      },
    });
    mocks.waitForSourceFileVersionIngest.mockResolvedValue("ingested");

    await expect(
      runImportGoogleDriveFiles({
        organizationId: "org-1",
        automation: pdfFileAutomation(),
      }),
    ).resolves.toEqual({ imported: 1, skipped: 0, failed: 0, truncated: 0 });
    expect(mocks.uploadSourceFile).toHaveBeenCalledTimes(1);
  });
});
