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

import { err, isErr, isOk, ok } from "@/lib/primitives/result/results";

const { loadPipesAccessToken } = vi.hoisted(() => ({
  loadPipesAccessToken: vi.fn(),
}));

vi.mock("@/lib/pipes/accounts", () => ({
  loadPipesAccessToken,
  getPipesAccountStatus: vi.fn(),
}));

vi.mock("@/lib/database/client", () => ({
  db: {
    select: vi.fn(),
  },
  schema: {
    users: {
      id: "id",
      workosUserId: "workosUserId",
    },
  },
}));

import { loadGoogleDrivePipesAccessToken, resolveGoogleDrivePipesWorkosUserId } from "./pipes";

describe("resolveGoogleDrivePipesWorkosUserId", () => {
  it("returns a trimmed explicit WorkOS user id without querying the database", async () => {
    await expect(
      resolveGoogleDrivePipesWorkosUserId({
        workosUserId: "  user_123  ",
        localUserId: "local-1",
      }),
    ).resolves.toBe("user_123");
  });

  it("returns null when neither identity is provided", async () => {
    await expect(resolveGoogleDrivePipesWorkosUserId({})).resolves.toBeNull();
  });
});

describe("Google Drive Pipes error mapping", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("maps a missing Pipes account to google_drive_not_connected", async () => {
    loadPipesAccessToken.mockResolvedValue(
      err({ code: "pipes_not_connected", message: "Connect Google Drive first." }),
    );

    const result = await loadGoogleDrivePipesAccessToken({
      localOrganizationId: "org-1",
      workosUserId: "user_123",
    });

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.code).toBe("google_drive_not_connected");
    }
    expect(loadPipesAccessToken).toHaveBeenCalledWith({
      provider: "google-drive",
      localOrganizationId: "org-1",
      workosUserId: "user_123",
    });
  });

  it("maps a stale install to google_drive_pipes_needs_reauthorization", async () => {
    loadPipesAccessToken.mockResolvedValue(
      err({
        code: "pipes_needs_reauthorization",
        message: "Reconnect Google Drive.",
      }),
    );

    const result = await loadGoogleDrivePipesAccessToken({
      localOrganizationId: "org-1",
      workosUserId: "user_123",
    });

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.code).toBe("google_drive_pipes_needs_reauthorization");
    }
  });

  it("maps other Pipes failures to google_drive_pipes_unavailable", async () => {
    loadPipesAccessToken.mockResolvedValue(
      err({ code: "pipes_unavailable", message: "WorkOS is down." }),
    );

    const result = await loadGoogleDrivePipesAccessToken({
      localOrganizationId: "org-1",
      workosUserId: "user_123",
    });

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.code).toBe("google_drive_pipes_unavailable");
    }
  });

  it("vends the stored Google Drive access token from Pipes", async () => {
    loadPipesAccessToken.mockResolvedValue(ok(" ya29.token "));

    const result = await loadGoogleDrivePipesAccessToken({
      localOrganizationId: "org-1",
      workosUserId: "user_123",
    });

    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value).toBe(" ya29.token ");
    }
  });
});
