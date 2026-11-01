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
  getPipesAccountStatus: vi.fn(),
  loadPipesAccessToken,
}));

vi.mock("@/lib/database/client", () => ({
  db: { select: vi.fn() },
  schema: { users: { id: "id", workosUserId: "workosUserId" } },
}));

import { loadHubspotPipesAccessToken } from "./pipes";

describe("loadHubspotPipesAccessToken", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("maps a missing Pipes account to hubspot_not_connected", async () => {
    loadPipesAccessToken.mockResolvedValue(
      err({ code: "pipes_not_connected", message: "Connect HubSpot first." }),
    );

    const result = await loadHubspotPipesAccessToken({
      localOrganizationId: "org-1",
      workosUserId: "user_123",
    });

    expect(isErr(result) && result.error.code).toBe("hubspot_not_connected");
    expect(loadPipesAccessToken).toHaveBeenCalledWith({
      provider: "hubspot",
      localOrganizationId: "org-1",
      workosUserId: "user_123",
    });
  });

  it("maps a stale install to hubspot_pipes_needs_reauthorization", async () => {
    loadPipesAccessToken.mockResolvedValue(
      err({
        code: "pipes_needs_reauthorization",
        message: "Reconnect HubSpot.",
      }),
    );

    const result = await loadHubspotPipesAccessToken({
      localOrganizationId: "org-1",
      workosUserId: "user_123",
    });

    expect(isErr(result) && result.error.code).toBe("hubspot_pipes_needs_reauthorization");
  });

  it("vends the OAuth access token from Pipes", async () => {
    loadPipesAccessToken.mockResolvedValue(ok("oauth-token"));

    const result = await loadHubspotPipesAccessToken({
      localOrganizationId: "org-1",
      workosUserId: "user_123",
    });

    expect(isOk(result) && result.value).toBe("oauth-token");
  });
});
