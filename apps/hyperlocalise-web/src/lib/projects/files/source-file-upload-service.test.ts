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
  dbTransactionMock,
  enqueueFileUploadedActivityMock,
  enqueueSourceFileIngestAfterUploadMock,
} = vi.hoisted(() => ({
  createRepositorySourceFileVersionMock: vi.fn(),
  createStoredFileMock: vi.fn(),
  dbTransactionMock: vi.fn(),
  enqueueFileUploadedActivityMock: vi.fn(),
  enqueueSourceFileIngestAfterUploadMock: vi.fn(),
}));

vi.mock("@/lib/database/client", () => ({
  db: { transaction: dbTransactionMock },
  schema: {},
}));

vi.mock("@/lib/file-storage/get-file-storage-adapter", () => ({
  getFileStorageAdapter: vi.fn(() => ({})),
}));

vi.mock("@/lib/file-storage/records", () => ({
  createRepositorySourceFileVersion: createRepositorySourceFileVersionMock,
  createStoredFile: createStoredFileMock,
}));

vi.mock("@/lib/activity-log/file-segment-events", () => ({
  enqueueFileUploadedActivity: enqueueFileUploadedActivityMock,
  uploadActivityActor: vi.fn(() => ({
    actorCredentialId: null,
    actorKind: "api_key",
    actorUserId: "user_1",
  })),
}));

vi.mock("./source-file-ingest", () => ({
  enqueueSourceFileIngestAfterUpload: enqueueSourceFileIngestAfterUploadMock,
}));

vi.mock("@/lib/log", () => ({
  createLogger: vi.fn(() => ({ warn: vi.fn() })),
}));

import { uploadSourceFile } from "./source-file-upload-service";

describe("uploadSourceFile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbTransactionMock.mockImplementation(async (callback) => callback("tx"));
    createStoredFileMock.mockResolvedValue({
      id: "file_1",
      organizationId: "org_1",
      projectId: "project_1",
      storageKey: "file_1",
      filename: "en.json",
      contentType: "application/json",
      byteSize: 15,
      sha256: "hash_1",
    });
    createRepositorySourceFileVersionMock.mockResolvedValue({ id: "version_1" });
    enqueueFileUploadedActivityMock.mockResolvedValue(undefined);
  });

  it("defers source-ingest dispatch without delaying the upload result", async () => {
    let resolveEnqueue!: () => void;
    const enqueuePromise = new Promise<void>((resolve) => {
      resolveEnqueue = resolve;
    });
    enqueueSourceFileIngestAfterUploadMock.mockReturnValueOnce(enqueuePromise);
    const deferAfterResponse = vi.fn();

    const result = await uploadSourceFile({
      organizationId: "org_1",
      project: { id: "project_1", source: "native" } as never,
      file: {
        filename: "en.json",
        contentType: "application/json",
        content: new Uint8Array([123, 125]),
      },
      sourcePath: "lang/en-US.json",
      uploadSurface: "public_api",
      uploadedByApiKeyId: "key_1",
      actorUserId: "user_1",
      deferAfterResponse,
    });

    expect(result).toMatchObject({
      ok: true,
      value: { destination: "native", file: { id: "file_1", sourceFileVersionId: "version_1" } },
    });
    expect(deferAfterResponse).toHaveBeenCalledTimes(1);
    expect(enqueueSourceFileIngestAfterUploadMock).toHaveBeenCalledTimes(1);

    resolveEnqueue();
    await deferAfterResponse.mock.calls[0]?.[0];
  });
});
