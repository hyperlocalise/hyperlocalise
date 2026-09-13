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

import { isErr, isOk } from "@/lib/primitives/result/results";

const mocks = vi.hoisted(() => ({
  loadPipesAccessToken: vi.fn(),
  getPipesAccountStatus: vi.fn(),
}));

vi.mock("@/lib/pipes/accounts", () => ({
  loadPipesAccessToken: (...args: unknown[]) => mocks.loadPipesAccessToken(...args),
  getPipesAccountStatus: (...args: unknown[]) => mocks.getPipesAccountStatus(...args),
}));

import { getGscPipesConnectionStatus, loadGscPipesAccessToken } from "./pipes";

describe("gsc pipes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("loadGscPipesAccessToken", () => {
    it("returns the Pipes access token on success", async () => {
      mocks.loadPipesAccessToken.mockResolvedValue({
        ok: true,
        value: "ya29.gsc-token",
      });

      const result = await loadGscPipesAccessToken({
        localOrganizationId: "org_local",
        workosUserId: "user_workos",
      });

      expect(isOk(result)).toBe(true);
      if (!isOk(result)) {
        throw new Error("expected ok");
      }
      expect(result.value).toBe("ya29.gsc-token");
      expect(mocks.loadPipesAccessToken).toHaveBeenCalledWith({
        provider: "google-search-console",
        localOrganizationId: "org_local",
        workosUserId: "user_workos",
      });
    });

    it.each([
      ["pipes_not_connected", "gsc_not_connected"],
      ["pipes_needs_reauthorization", "gsc_pipes_needs_reauthorization"],
      ["pipes_unavailable", "gsc_pipes_unavailable"],
    ] as const)("maps %s to %s", async (pipesCode, gscCode) => {
      mocks.loadPipesAccessToken.mockResolvedValue({
        ok: false,
        error: { code: pipesCode, message: "boom" },
      });

      const result = await loadGscPipesAccessToken({
        localOrganizationId: "org_local",
        workosUserId: "user_workos",
      });

      expect(isErr(result)).toBe(true);
      if (!isErr(result)) {
        throw new Error("expected err");
      }
      expect(result.error.code).toBe(gscCode);
    });
  });

  it("forwards connection status lookups to shared Pipes helpers", async () => {
    mocks.getPipesAccountStatus.mockResolvedValue({
      ok: true,
      value: { connected: true, needsReauthorization: false, apiKeyLast4: null },
    });

    const result = await getGscPipesConnectionStatus({
      localOrganizationId: "org_local",
      workosUserId: "user_workos",
    });

    expect(mocks.getPipesAccountStatus).toHaveBeenCalledWith({
      provider: "google-search-console",
      localOrganizationId: "org_local",
      workosUserId: "user_workos",
    });
    expect(isOk(result)).toBe(true);
  });
});
