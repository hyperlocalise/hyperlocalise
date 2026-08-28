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
  getFileStorageAdapterMock,
  toolCanAccessStoredFileProjectMock,
  selectLimitMock,
  selectWhereMock,
  selectFromMock,
  selectMock,
} = vi.hoisted(() => {
  const selectLimitMock = vi.fn();
  const selectWhereMock = vi.fn(() => ({ limit: selectLimitMock }));
  const selectFromMock = vi.fn(() => ({ where: selectWhereMock }));
  const selectMock = vi.fn(() => ({ from: selectFromMock }));
  return {
    getFileStorageAdapterMock: vi.fn(),
    toolCanAccessStoredFileProjectMock: vi.fn(async () => true),
    selectLimitMock,
    selectWhereMock,
    selectFromMock,
    selectMock,
  };
});

vi.mock("@/lib/database/client", () => ({
  schema: {
    storedFiles: {
      id: "id",
      organizationId: "organization_id",
      projectId: "project_id",
      createdByUserId: "created_by_user_id",
      storageKey: "storage_key",
      filename: "filename",
      contentType: "content_type",
    },
  },
}));

vi.mock("@/lib/file-storage/get-file-storage-adapter", () => ({
  getFileStorageAdapter: getFileStorageAdapterMock,
}));

vi.mock("@/lib/tools/tool-access", () => ({
  toolCanAccessStoredFileProject: toolCanAccessStoredFileProjectMock,
}));

import { createReadStoredFileTool } from "./file-tools";

function bodyFromText(text: string) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(text));
      controller.close();
    },
  });
}

function toolContext() {
  return {
    conversationId: "conv_1",
    organizationId: "org_1",
    localUserId: "user_1",
    membershipRole: "admin" as const,
    projectId: "project_1",
    db: {
      select: selectMock,
    },
  };
}

function mockStoredFile(file: {
  id?: string;
  organizationId?: string;
  projectId?: string | null;
  createdByUserId?: string;
  storageKey?: string;
  filename: string;
  contentType: string;
}) {
  selectLimitMock.mockResolvedValueOnce([
    {
      id: file.id ?? "file_1",
      organizationId: file.organizationId ?? "org_1",
      projectId: file.projectId === undefined ? "project_1" : file.projectId,
      createdByUserId: file.createdByUserId ?? "user_1",
      storageKey: file.storageKey ?? "storage/file_1",
      filename: file.filename,
      contentType: file.contentType,
    },
  ]);
}

beforeEach(() => {
  vi.clearAllMocks();
  selectWhereMock.mockImplementation(() => ({ limit: selectLimitMock }));
  selectFromMock.mockImplementation(() => ({ where: selectWhereMock }));
  selectMock.mockImplementation(() => ({ from: selectFromMock }));
  toolCanAccessStoredFileProjectMock.mockResolvedValue(true);
});

describe("createReadStoredFileTool", () => {
  it("rejects office binaries instead of decoding them as UTF-8 text", async () => {
    mockStoredFile({
      filename: "brief.docx",
      contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    getFileStorageAdapterMock.mockReturnValue({
      get: vi.fn(async () => ({
        body: bodyFromText("PK\u0003\u0004binary-office"),
      })),
    });

    const tool = createReadStoredFileTool(toolContext() as never);
    const result = await tool.execute?.({ fileId: "file_1" }, {} as never);

    expect(result).toEqual({
      success: false,
      error:
        "Binary files cannot be read as text. Use this tool for text-based translation files only.",
      filename: "brief.docx",
      byteLength: Buffer.byteLength("PK\u0003\u0004binary-office"),
    });
  });

  it("reads text translation sources when access is allowed", async () => {
    mockStoredFile({
      filename: "messages.json",
      contentType: "application/json",
    });
    getFileStorageAdapterMock.mockReturnValue({
      get: vi.fn(async () => ({
        body: bodyFromText('{"hello":"world"}'),
      })),
    });

    const tool = createReadStoredFileTool(toolContext() as never);
    const result = await tool.execute?.({ fileId: "file_1" }, {} as never);

    expect(result).toEqual({
      success: true,
      filename: "messages.json",
      contentType: "application/json",
      byteLength: Buffer.byteLength('{"hello":"world"}'),
      content: '{"hello":"world"}',
      truncated: false,
    });
  });

  it("hides inaccessible files with a not-found error", async () => {
    mockStoredFile({
      filename: "messages.json",
      contentType: "application/json",
      createdByUserId: "user_other",
    });
    toolCanAccessStoredFileProjectMock.mockResolvedValueOnce(false);

    const tool = createReadStoredFileTool(toolContext() as never);
    const result = await tool.execute?.({ fileId: "file_1" }, {} as never);

    expect(result).toEqual({
      success: false,
      error: "File not found for this organization.",
    });
    expect(getFileStorageAdapterMock).not.toHaveBeenCalled();
  });
});
