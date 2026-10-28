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
  loggerWarnMock,
} = vi.hoisted(() => ({
  createRepositorySourceFileVersionMock: vi.fn(),
  createStoredFileMock: vi.fn(),
  dbTransactionMock: vi.fn(),
  enqueueFileUploadedActivityMock: vi.fn(),
  enqueueSourceFileIngestAfterUploadMock: vi.fn(),
  loggerWarnMock: vi.fn(),
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
  createLogger: vi.fn(() => ({ warn: loggerWarnMock })),
}));

import { uploadSourceFile } from "./source-file-upload-service";

const uploadInput = {
  organizationId: "org_1",
  project: { id: "project_1", source: "native" } as never,
  file: {
    filename: "en.json",
    contentType: "application/json",
    content: new Uint8Array([123, 125]),
  },
  sourcePath: "lang/en-US.json",
  uploadSurface: "public_api" as const,
  uploadedByApiKeyId: "key_1",
  actorUserId: "user_1",
};

describe("uploadSourceFile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
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
      ...uploadInput,
      deferAfterResponse,
    });

    expect(result).toMatchObject({
      ok: true,
      value: { destination: "native", file: { id: "file_1", sourceFileVersionId: "version_1" } },
    });
    expect(deferAfterResponse).toHaveBeenCalledTimes(1);
    expect(enqueueSourceFileIngestAfterUploadMock).not.toHaveBeenCalled();

    const deferredTask = deferAfterResponse.mock.calls[0]?.[0] as () => Promise<unknown>;
    const deferredPromise = deferredTask();
    expect(enqueueSourceFileIngestAfterUploadMock).toHaveBeenCalledTimes(1);

    resolveEnqueue();
    await deferredPromise;
  });

  it("fire-and-forgets ingest enqueue when deferAfterResponse is omitted", async () => {
    enqueueSourceFileIngestAfterUploadMock.mockResolvedValueOnce(undefined);

    const result = await uploadSourceFile(uploadInput);

    expect(result).toMatchObject({
      ok: true,
      value: { destination: "native", file: { id: "file_1", sourceFileVersionId: "version_1" } },
    });
    expect(enqueueSourceFileIngestAfterUploadMock).toHaveBeenCalledTimes(1);
    expect(enqueueSourceFileIngestAfterUploadMock).toHaveBeenCalledWith({
      organizationId: "org_1",
      projectId: "project_1",
      storedFileId: "file_1",
      sourceFileVersionId: "version_1",
      sourcePath: "lang/en-US.json",
      sourceHash: "hash_1",
      targetAutomationId: undefined,
    });
  });

  it("keeps the upload successful when deferred ingest enqueue rejects", async () => {
    enqueueSourceFileIngestAfterUploadMock.mockRejectedValueOnce(new Error("workflow unavailable"));
    const deferAfterResponse = vi.fn();

    const result = await uploadSourceFile({
      ...uploadInput,
      deferAfterResponse,
    });

    expect(result).toMatchObject({ ok: true });

    const deferredTask = deferAfterResponse.mock.calls[0]?.[0] as () => Promise<unknown>;
    await expect(deferredTask()).resolves.toBeUndefined();
    expect(loggerWarnMock).toHaveBeenCalledWith(
      {
        projectId: "project_1",
        sourceFileVersionId: "version_1",
        error: "workflow unavailable",
      },
      "source-file-upload source ingest enqueue failed",
    );
  });

  it("keeps the upload successful when deferred ingest enqueue times out", async () => {
    vi.useFakeTimers();
    enqueueSourceFileIngestAfterUploadMock.mockReturnValueOnce(new Promise(() => {}));
    const deferAfterResponse = vi.fn();

    const result = await uploadSourceFile({
      ...uploadInput,
      deferAfterResponse,
    });

    expect(result).toMatchObject({ ok: true });

    const deferredTask = deferAfterResponse.mock.calls[0]?.[0] as () => Promise<unknown>;
    const deferredPromise = deferredTask();
    await vi.advanceTimersByTimeAsync(10_000);
    await expect(deferredPromise).resolves.toBeUndefined();
    expect(loggerWarnMock).toHaveBeenCalledWith(
      {
        projectId: "project_1",
        sourceFileVersionId: "version_1",
        error: "source file ingest enqueue timed out after 10000ms",
      },
      "source-file-upload source ingest enqueue failed",
    );
  });
});
