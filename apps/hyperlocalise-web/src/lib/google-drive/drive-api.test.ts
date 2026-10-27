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
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { isErr, isOk } from "@/lib/primitives/result/results";

import {
  exportGoogleDriveFile,
  findGoogleDriveChildByName,
  listGoogleDriveChildren,
  listGoogleSharedDrives,
  uploadGoogleDriveFile,
} from "./drive-api";
import { GOOGLE_DRIVE_MAX_FILE_BYTES } from "./limits";

describe("listGoogleSharedDrives", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns an empty list when Shared Drive listing is forbidden", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({
        error: {
          errors: [{ reason: "insufficientPermissions" }],
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await listGoogleSharedDrives({ accessToken: "token" });

    expect(isOk(result)).toBe(true);
    if (!isOk(result)) {
      throw new Error("expected ok result");
    }
    expect(result.value).toEqual([]);
  });

  it("includes the Google error reason on non-forbidden failures", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({
        error: {
          status: "INTERNAL",
          message: "backend error",
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await listGoogleSharedDrives({ accessToken: "token" });

    expect(isErr(result)).toBe(true);
    if (!isErr(result)) {
      throw new Error("expected err result");
    }
    expect(result.error).toMatchObject({
      code: "google_drive_api_error",
      status: 500,
      message: "Google Drive API returned 500 (INTERNAL).",
    });
  });

  it("does not hide Drive API not enabled as an empty Shared Drive list", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({
        error: {
          errors: [{ reason: "accessNotConfigured" }],
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await listGoogleSharedDrives({ accessToken: "token" });

    expect(isErr(result)).toBe(true);
    if (!isErr(result)) {
      throw new Error("expected err result");
    }
    expect(result.error.code).toBe("google_drive_api_not_enabled");
  });
});

describe("listGoogleDriveChildren", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("maps accessNotConfigured to google_drive_api_not_enabled", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({
        error: {
          errors: [{ reason: "accessNotConfigured" }],
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await listGoogleDriveChildren({
      accessToken: "token",
      folderId: "root",
    });

    expect(isErr(result)).toBe(true);
    if (!isErr(result)) {
      throw new Error("expected err result");
    }
    expect(result.error).toMatchObject({
      code: "google_drive_api_not_enabled",
      status: 403,
    });
  });

  it("escapes backslashes before quotes in folder queries", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ files: [] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await listGoogleDriveChildren({
      accessToken: "token",
      folderId: "foo\\'bar",
    });

    const url = String(fetchMock.mock.calls[0]?.[0]);
    expect(new URL(url).searchParams.get("q")).toBe("'foo\\\\\\'bar' in parents and trashed=false");
  });
});

describe("exportGoogleDriveFile", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("rejects export links on untrusted hosts", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 413,
      json: async () => ({ error: { message: "too large" } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await exportGoogleDriveFile({
      accessToken: "token",
      fileId: "doc-id",
      exportMimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      exportLinks: {
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
          "https://evil.example/export",
      },
    });

    expect(isErr(result)).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("uploadGoogleDriveFile", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("creates a new file when the cached id lives under a different parent", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "old-file",
          name: "[vi-VN] overview.docx",
          mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          parents: ["parent-old"],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "new-file",
          name: "overview.docx",
          mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          parents: ["parent-new"],
        }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const result = await uploadGoogleDriveFile({
      accessToken: "token",
      parentId: "parent-new",
      name: "overview.docx",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      content: Buffer.from("docx"),
      existingFileId: "old-file",
    });

    expect(isOk(result)).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const moveUrl = String(fetchMock.mock.calls[1]?.[0]);
    expect(moveUrl).toContain("/upload/drive/v3/files/old-file");
    expect(moveUrl).toContain("addParents=parent-new");
    expect(moveUrl).toContain("removeParents=parent-old");
    const moveInit = fetchMock.mock.calls[1]?.[1] as RequestInit;
    expect(moveInit.method).toBe("PATCH");
    expect(Buffer.from(moveInit.body as ArrayBuffer).toString("utf8")).not.toContain("addParents");
  });
});

describe("downloadGoogleDriveMedia", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("rejects downloads above the import size limit", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new Uint8Array(GOOGLE_DRIVE_MAX_FILE_BYTES + 1),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { downloadGoogleDriveMedia } = await import("./drive-api");
    const result = await downloadGoogleDriveMedia({
      accessToken: "token",
      fileId: "large-file",
    });

    expect(isErr(result)).toBe(true);
    if (!isErr(result)) {
      throw new Error("expected err result");
    }
    expect(result.error.code).toBe("google_drive_file_too_large");
  });
});

describe("findGoogleDriveChildByName", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("escapes backslashes before quotes in name queries", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ files: [] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await findGoogleDriveChildByName({
      accessToken: "token",
      parentId: "p\\'id",
      name: "n\\'ame",
      mimeType: "type\\'x",
    });

    const url = String(fetchMock.mock.calls[0]?.[0]);
    expect(new URL(url).searchParams.get("q")).toBe(
      "'p\\\\\\'id' in parents and trashed=false and name='n\\\\\\'ame' and mimeType='type\\\\\\'x'",
    );
  });
});
