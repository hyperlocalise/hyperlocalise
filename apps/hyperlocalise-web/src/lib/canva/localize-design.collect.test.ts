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

const {
  createRepositorySourceFileVersionMock,
  createStoredFileMock,
  enqueueSourceFileIngestAfterUploadMock,
  getAccessibleProjectForApiKeyMock,
  resolveApiKeyTeamAccessContextMock,
  updateStoredFilesMock,
} = vi.hoisted(() => ({
  createRepositorySourceFileVersionMock: vi.fn(),
  createStoredFileMock: vi.fn(),
  enqueueSourceFileIngestAfterUploadMock: vi.fn(),
  getAccessibleProjectForApiKeyMock: vi.fn(),
  resolveApiKeyTeamAccessContextMock: vi.fn(),
  updateStoredFilesMock: vi.fn(async () => []),
}));

vi.mock("@/lib/database/client", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => [
            {
              id: "key_1",
              organizationId: "org_1",
              createdByUserId: "user_1",
            },
          ],
        }),
      }),
    }),
    update: () => ({
      set: () => ({
        where: updateStoredFilesMock,
      }),
    }),
  },
  schema: {
    organizationApiKeys: {
      id: "id",
      organizationId: "organizationId",
      createdByUserId: "createdByUserId",
    },
    storedFiles: {
      id: "id",
      organizationId: "organizationId",
      metadata: "metadata",
    },
  },
}));

vi.mock("@/api/auth/api-key-access", () => ({
  resolveApiKeyTeamAccessContext: resolveApiKeyTeamAccessContextMock,
  getAccessibleProjectForApiKey: getAccessibleProjectForApiKeyMock,
}));

vi.mock("@/lib/file-storage/records", () => ({
  createRepositorySourceFileVersion: createRepositorySourceFileVersionMock,
  createStoredFile: createStoredFileMock,
  getStoredFileContent: vi.fn(),
  normalizeSourcePath: (value: string) => value,
}));

vi.mock("@/lib/projects/files/source-file-ingest", () => ({
  enqueueSourceFileIngestAfterUpload: enqueueSourceFileIngestAfterUploadMock,
}));

import { collectCanvaDesign } from "./localize-design";

describe("collectCanvaDesign", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveApiKeyTeamAccessContextMock.mockResolvedValue({ user: { localUserId: "user_1" } });
    getAccessibleProjectForApiKeyMock.mockResolvedValue({
      id: "project_1",
      sourceLocale: "en-US",
      targetLocales: ["fr-FR"],
    });
    createStoredFileMock.mockResolvedValue({
      id: "file_1",
      organizationId: "org_1",
      projectId: "project_1",
      createdByUserId: "user_1",
      sha256: "abc",
    });
    createRepositorySourceFileVersionMock.mockResolvedValue({ id: "version_1" });
    enqueueSourceFileIngestAfterUploadMock.mockResolvedValue(undefined);
  });

  it("creates a repository source file version for the Files list", async () => {
    const collected = await collectCanvaDesign({
      organizationId: "org_1",
      apiKeyId: "key_1",
      canvaConnectionId: "conn_1",
      projectId: "project_1",
      designId: "DAFtest",
      designTitle: "Mic",
      segments: [
        {
          key: "canva.segment.0.0",
          pageIndex: 0,
          contentIndex: 0,
          regionIndex: 0,
          text: "Hello",
        },
      ],
    });

    expect(collected.pages[0]).toMatchObject({
      pageIndex: 0,
      sourcePath: "canva/designs/mic-DAFtest/page-1.json",
      sourceFileId: "file_1",
      wordCount: 1,
    });
    expect(createStoredFileMock).toHaveBeenCalledWith(
      expect.objectContaining({
        filename: "page-1.json",
        metadata: expect.objectContaining({
          wordCount: 1,
          segmentCount: 1,
        }),
      }),
    );
    expect(
      createStoredFileMock.mock.calls[0]?.[0]?.metadata.canvaCollectBatchComplete,
    ).toBeUndefined();
    expect(createRepositorySourceFileVersionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        sourcePath: "canva/designs/mic-DAFtest/page-1.json",
        uploadSurface: "canva_integration",
        uploadedByApiKeyId: "key_1",
      }),
    );
    expect(enqueueSourceFileIngestAfterUploadMock).toHaveBeenCalledWith(
      expect.objectContaining({
        storedFileId: "file_1",
        sourceFileVersionId: "version_1",
        sourcePath: "canva/designs/mic-DAFtest/page-1.json",
      }),
    );
    expect(updateStoredFilesMock).toHaveBeenCalled();
  });

  it("does not publish a collect batch when a later page write fails", async () => {
    createStoredFileMock
      .mockResolvedValueOnce({
        id: "file_1",
        organizationId: "org_1",
        projectId: "project_1",
        createdByUserId: "user_1",
        sha256: "abc",
      })
      .mockRejectedValueOnce(new Error("storage_write_failed"));

    await expect(
      collectCanvaDesign({
        organizationId: "org_1",
        apiKeyId: "key_1",
        canvaConnectionId: "conn_1",
        projectId: "project_1",
        designId: "DAFtest",
        designTitle: "Mic",
        segments: [
          {
            key: "canva.segment.0.0",
            pageIndex: 0,
            contentIndex: 0,
            regionIndex: 0,
            text: "Hello",
          },
          {
            key: "canva.segment.1.0",
            pageIndex: 1,
            contentIndex: 0,
            regionIndex: 0,
            text: "World",
          },
        ],
      }),
    ).rejects.toThrow("storage_write_failed");

    expect(updateStoredFilesMock).not.toHaveBeenCalled();
  });
});
