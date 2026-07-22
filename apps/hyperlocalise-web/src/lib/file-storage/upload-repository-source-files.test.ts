/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file and at https://mariadb.com/bsl11/.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const {
  createRepositorySourceFileVersionMock,
  createStoredFileMock,
  dbTransactionMock,
  deleteStoredObjectMock,
  enqueueSourceFileIngestAfterUploadMock,
  getLatestRepositorySourceFileVersionMock,
  readTranslatedFileMock,
} = vi.hoisted(() => ({
  createRepositorySourceFileVersionMock: vi.fn(),
  createStoredFileMock: vi.fn(),
  dbTransactionMock: vi.fn(),
  deleteStoredObjectMock: vi.fn(),
  enqueueSourceFileIngestAfterUploadMock: vi.fn(),
  getLatestRepositorySourceFileVersionMock: vi.fn(),
  readTranslatedFileMock: vi.fn(),
}));

vi.mock("@/lib/database", () => ({
  db: {
    transaction: dbTransactionMock,
  },
  schema: {},
}));

vi.mock("@/lib/file-storage", () => ({
  getFileStorageAdapter: vi.fn(() => ({
    provider: "vercel_blob",
    delete: deleteStoredObjectMock,
  })),
}));

vi.mock("@/lib/file-storage/records", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/file-storage/records")>();
  return {
    ...actual,
    createRepositorySourceFileVersion: createRepositorySourceFileVersionMock,
    createStoredFile: createStoredFileMock,
    getLatestRepositorySourceFileVersion: getLatestRepositorySourceFileVersionMock,
  };
});

vi.mock("@/lib/projects/files/source-file-ingest", () => ({
  enqueueSourceFileIngestAfterUpload: enqueueSourceFileIngestAfterUploadMock,
}));

vi.mock("@/lib/translation/sandbox", () => ({
  readTranslatedFile: readTranslatedFileMock,
}));

vi.mock("@/lib/log", () => ({
  createLogger: vi.fn(() => ({
    error: vi.fn(),
    warn: vi.fn(),
  })),
}));

import { uploadRepositorySourceFilesFromSandbox } from "./upload-repository-source-files";
import { sha256Hex } from "./records";

describe("uploadRepositorySourceFilesFromSandbox", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbTransactionMock.mockImplementation(async (callback) => callback("tx"));
    getLatestRepositorySourceFileVersionMock.mockResolvedValue(null);
    enqueueSourceFileIngestAfterUploadMock.mockResolvedValue(undefined);
    createStoredFileMock.mockImplementation(async (input) => ({
      id: "file_utf8",
      organizationId: input.organizationId,
      projectId: input.projectId,
      createdByUserId: null,
      storageKey: "organizations/org_1/projects/proj_1/files/file_utf8/en.json",
      filename: input.filename,
      contentType: input.contentType,
      sha256: "stored-file-hash",
    }));
    createRepositorySourceFileVersionMock.mockResolvedValue({
      id: "source_file_version_utf8",
    });
  });

  it("preserves UTF-8 bytes and hashes the exact sandbox content", async () => {
    const content = Buffer.from('{"cta":"Tìm hiểu thêm về {name}"}', "utf8");
    readTranslatedFileMock.mockResolvedValue(content);

    const results = await uploadRepositorySourceFilesFromSandbox({
      sandboxId: "sandbox_1",
      organizationId: "org_1",
      projectId: "proj_1",
      paths: ["./src/messages/en.json"],
      commitSha: "abc123",
      workflowRunId: "run_1",
    });

    const expectedSourceHash = await sha256Hex(content);

    expect(results).toEqual([
      {
        path: "src/messages/en.json",
        outcome: "uploaded",
        fileId: "file_utf8",
        sourceFileVersionId: "source_file_version_utf8",
      },
    ]);
    expect(readTranslatedFileMock).toHaveBeenCalledWith("sandbox_1", "src/messages/en.json");
    expect(createStoredFileMock).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org_1",
        projectId: "proj_1",
        role: "source",
        sourceKind: "repository_file",
        filename: "en.json",
        contentType: "application/json",
        content,
        metadata: expect.objectContaining({
          sourcePath: "src/messages/en.json",
          commitSha: "abc123",
          workflowRunId: "run_1",
          uploadSurface: "github_automation",
        }),
        db: "tx",
      }),
    );
    expect(createRepositorySourceFileVersionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        sourcePath: "src/messages/en.json",
        sourceHash: expectedSourceHash,
        commitSha: "abc123",
        workflowRunId: "run_1",
        uploadSurface: "github_automation",
        db: "tx",
      }),
    );
    expect(enqueueSourceFileIngestAfterUploadMock).toHaveBeenCalledWith({
      organizationId: "org_1",
      projectId: "proj_1",
      storedFileId: "file_utf8",
      sourceFileVersionId: "source_file_version_utf8",
      sourcePath: "src/messages/en.json",
      sourceHash: expectedSourceHash,
    });
  });
});
