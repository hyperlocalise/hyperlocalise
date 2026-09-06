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

import { ok } from "@/lib/primitives/result/results";

const mocks = vi.hoisted(() => ({
  getAhrefsPipesConnectionStatus: vi.fn(),
}));

vi.mock("@/lib/ahrefs/pipes", () => ({
  getAhrefsPipesConnectionStatus: (...args: unknown[]) =>
    mocks.getAhrefsPipesConnectionStatus(...args),
}));

import { getPipesConnectionStatus } from "./status";

describe("getPipesConnectionStatus", () => {
  beforeEach(() => {
    mocks.getAhrefsPipesConnectionStatus.mockReset();
  });

  it("dispatches Ahrefs to the Ahrefs Pipes status loader", async () => {
    const status = {
      connected: true,
      needsReauthorization: false,
      apiKeyLast4: "abcd",
    };
    mocks.getAhrefsPipesConnectionStatus.mockResolvedValue(ok(status));

    const input = {
      provider: "ahrefs" as const,
      localOrganizationId: "org-local",
      workosUserId: "user_workos",
    };

    await expect(getPipesConnectionStatus(input)).resolves.toEqual(ok(status));
    expect(mocks.getAhrefsPipesConnectionStatus).toHaveBeenCalledWith(input);
  });
});
