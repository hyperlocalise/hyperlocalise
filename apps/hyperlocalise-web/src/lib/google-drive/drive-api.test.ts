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

import { listGoogleDriveChildren, listGoogleSharedDrives } from "./drive-api";

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
});
