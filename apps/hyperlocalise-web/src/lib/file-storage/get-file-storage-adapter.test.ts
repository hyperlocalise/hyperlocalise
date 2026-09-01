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
import { describe, expect, it, vi } from "vite-plus/test";

const putMock = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error("tests must not call Vercel Blob");
  }),
);

vi.mock("@vercel/blob", () => ({
  put: putMock,
  get: vi.fn(),
  del: vi.fn(),
  head: vi.fn(),
}));

import { getFileStorageAdapter } from "./get-file-storage-adapter";

describe("getFileStorageAdapter", () => {
  it("uses in-memory storage in tests instead of Vercel Blob", async () => {
    const adapter = getFileStorageAdapter();
    const result = await adapter.put({
      key: "glossary-backup.xlsx",
      body: Buffer.from("backup"),
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    expect(putMock).not.toHaveBeenCalled();
    expect(result.url).toBe("https://blob.example/glossary-backup.xlsx");
    const stored = await adapter.get({ keyOrUrl: "glossary-backup.xlsx" });
    expect(stored).not.toBeNull();
  });
});
