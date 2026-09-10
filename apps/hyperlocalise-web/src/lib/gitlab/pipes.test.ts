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
  userSelect: vi.fn(),
  loadPipesAccessToken: vi.fn(),
  getPipesAccountStatus: vi.fn(),
}));

vi.mock("@/lib/database/client", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => mocks.userSelect(),
        }),
      }),
    }),
  },
  schema: {
    users: { id: "id", workosUserId: "workosUserId" },
  },
}));

vi.mock("@/lib/pipes/accounts", () => ({
  loadPipesAccessToken: (...args: unknown[]) => mocks.loadPipesAccessToken(...args),
  getPipesAccountStatus: (...args: unknown[]) => mocks.getPipesAccountStatus(...args),
}));

import {
  getGitLabPipesConnectionStatus,
  loadGitLabPipesAccessToken,
  resolveGitLabPipesWorkosUserId,
} from "./pipes";

describe("gitlab pipes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("resolveGitLabPipesWorkosUserId", () => {
    it("prefers an explicit WorkOS user id", async () => {
      await expect(
        resolveGitLabPipesWorkosUserId({
          workosUserId: "  user_explicit  ",
          localUserId: "local_1",
        }),
      ).resolves.toBe("user_explicit");
      expect(mocks.userSelect).not.toHaveBeenCalled();
    });

    it("loads the WorkOS user id from the local user row", async () => {
      mocks.userSelect.mockResolvedValue([{ workosUserId: "user_from_db" }]);

      await expect(resolveGitLabPipesWorkosUserId({ localUserId: "local_1" })).resolves.toBe(
        "user_from_db",
      );
    });

    it("returns null when neither explicit nor local user can resolve", async () => {
      await expect(resolveGitLabPipesWorkosUserId({})).resolves.toBeNull();

      mocks.userSelect.mockResolvedValue([]);
      await expect(resolveGitLabPipesWorkosUserId({ localUserId: "missing" })).resolves.toBeNull();
    });
  });

  describe("loadGitLabPipesAccessToken", () => {
    it("returns the Pipes access token on success", async () => {
      mocks.loadPipesAccessToken.mockResolvedValue({
        ok: true,
        value: "glpat-token",
      });

      const result = await loadGitLabPipesAccessToken({
        localOrganizationId: "org_local",
        workosUserId: "user_workos",
      });

      expect(isOk(result)).toBe(true);
      if (!isOk(result)) {
        throw new Error("expected ok");
      }
      expect(result.value).toBe("glpat-token");
      expect(mocks.loadPipesAccessToken).toHaveBeenCalledWith({
        provider: "gitlab",
        localOrganizationId: "org_local",
        workosUserId: "user_workos",
      });
    });

    it.each([
      ["pipes_not_connected", "gitlab_not_connected"],
      ["pipes_needs_reauthorization", "gitlab_pipes_needs_reauthorization"],
      ["pipes_unavailable", "gitlab_pipes_unavailable"],
    ] as const)("maps %s to %s", async (pipesCode, gitlabCode) => {
      mocks.loadPipesAccessToken.mockResolvedValue({
        ok: false,
        error: { code: pipesCode, message: "boom" },
      });

      const result = await loadGitLabPipesAccessToken({
        localOrganizationId: "org_local",
        workosUserId: "user_workos",
      });

      expect(isErr(result)).toBe(true);
      if (!isErr(result)) {
        throw new Error("expected err");
      }
      expect(result.error.code).toBe(gitlabCode);
    });
  });

  it("forwards connection status lookups to shared Pipes helpers", async () => {
    mocks.getPipesAccountStatus.mockResolvedValue({
      ok: true,
      value: { connected: true, needsReauthorization: false, apiKeyLast4: null },
    });

    const result = await getGitLabPipesConnectionStatus({
      localOrganizationId: "org_local",
      workosUserId: "user_workos",
    });

    expect(mocks.getPipesAccountStatus).toHaveBeenCalledWith({
      provider: "gitlab",
      localOrganizationId: "org_local",
      workosUserId: "user_workos",
    });
    expect(isOk(result)).toBe(true);
  });
});
