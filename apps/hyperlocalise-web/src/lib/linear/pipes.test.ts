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

const { getPipesAccountStatus, loadPipesAccessToken } = vi.hoisted(() => ({
  getPipesAccountStatus: vi.fn(),
  loadPipesAccessToken: vi.fn(),
}));

vi.mock("@/lib/pipes/accounts", () => ({
  getPipesAccountStatus,
  loadPipesAccessToken,
}));

vi.mock("@/lib/database/client", () => ({
  db: { select: vi.fn() },
  schema: { users: { id: "id", workosUserId: "workosUserId" } },
}));

import { loadLinearClient } from "./credentials";
import {
  getLinearPipesConnectionStatus,
  loadLinearPipesAccessToken,
  resolveLinearPipesWorkosUserId,
} from "./pipes";

afterEach(() => {
  vi.clearAllMocks();
});

describe("resolveLinearPipesWorkosUserId", () => {
  it("returns a trimmed explicit WorkOS user id", async () => {
    await expect(resolveLinearPipesWorkosUserId({ workosUserId: "  user_1 " })).resolves.toBe(
      "user_1",
    );
  });

  it("returns null when neither identity is provided", async () => {
    await expect(resolveLinearPipesWorkosUserId({ workosUserId: "  " })).resolves.toBeNull();
  });
});

describe("Linear Pipes", () => {
  it("loads the access token from the linear Pipes provider", async () => {
    loadPipesAccessToken.mockResolvedValue(ok("token_1"));

    const result = await loadLinearPipesAccessToken({
      localOrganizationId: "org_1",
      workosUserId: "user_1",
    });

    expect(isOk(result) && result.value).toBe("token_1");
    expect(loadPipesAccessToken).toHaveBeenCalledWith({
      provider: "linear",
      localOrganizationId: "org_1",
      workosUserId: "user_1",
    });
  });

  it.each([
    ["pipes_not_connected", "linear_not_connected"],
    ["pipes_needs_reauthorization", "linear_pipes_needs_reauthorization"],
    ["pipes_unavailable", "linear_pipes_unavailable"],
  ])("maps %s to %s", async (pipesCode, linearCode) => {
    getPipesAccountStatus.mockResolvedValue(err({ code: pipesCode, message: "x" }));

    const result = await getLinearPipesConnectionStatus({
      localOrganizationId: "org_1",
      workosUserId: "user_1",
    });

    expect(isErr(result) && result.error.code).toBe(linearCode);
  });

  it("returns not connected without a WorkOS user", async () => {
    const result = await loadLinearClient({ localOrganizationId: "org_1" });

    expect(isErr(result) && result.error.code).toBe("linear_not_connected");
    expect(loadPipesAccessToken).not.toHaveBeenCalled();
  });

  it("builds a client from the Pipes token", async () => {
    loadPipesAccessToken.mockResolvedValue(ok("token_1"));

    const result = await loadLinearClient({ localOrganizationId: "org_1", workosUserId: "user_1" });

    expect(isOk(result) && result.value.workosUserId).toBe("user_1");
  });
});
