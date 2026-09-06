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
  getPipesAccountStatus: vi.fn(),
}));

vi.mock("./accounts", () => ({
  getPipesAccountStatus: (...args: unknown[]) => mocks.getPipesAccountStatus(...args),
}));

import { getPipesConnectionStatus } from "./status";

describe("getPipesConnectionStatus", () => {
  beforeEach(() => {
    mocks.getPipesAccountStatus.mockReset();
  });

  it("loads status for any configured Pipes provider", async () => {
    const status = {
      connected: true,
      needsReauthorization: false,
      apiKeyLast4: "abcd",
    };
    mocks.getPipesAccountStatus.mockResolvedValue(ok(status));

    const input = {
      provider: "intercom" as const,
      localOrganizationId: "org-local",
      workosUserId: "user_workos",
    };

    await expect(getPipesConnectionStatus(input)).resolves.toEqual(ok(status));
    expect(mocks.getPipesAccountStatus).toHaveBeenCalledWith(input);
  });
});
