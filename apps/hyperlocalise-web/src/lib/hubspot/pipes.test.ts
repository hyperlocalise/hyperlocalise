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

const { loadPipesAccessToken, loadPipesApiKey, upsertPipesApiKey } = vi.hoisted(() => ({
  loadPipesAccessToken: vi.fn(),
  loadPipesApiKey: vi.fn(),
  upsertPipesApiKey: vi.fn(),
}));

vi.mock("@/lib/pipes/accounts", () => ({
  getPipesAccountStatus: vi.fn(),
  loadPipesAccessToken,
  loadPipesApiKey,
  upsertPipesApiKey,
}));

vi.mock("@/lib/database/client", () => ({
  db: { select: vi.fn() },
  schema: { users: { id: "id", workosUserId: "workosUserId" } },
}));

import { loadHubspotPipesCredential, saveHubspotPipesApiKey } from "./pipes";

describe("loadHubspotPipesCredential", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("uses the OAuth access token when HubSpot is authorized", async () => {
    loadPipesAccessToken.mockResolvedValue(ok("oauth-token"));

    const result = await loadHubspotPipesCredential({
      localOrganizationId: "org-1",
      workosUserId: "user_123",
    });

    expect(isOk(result) && result.value).toBe("oauth-token");
    expect(loadPipesApiKey).not.toHaveBeenCalled();
  });

  it("uses the private-app token when OAuth is not connected", async () => {
    loadPipesAccessToken.mockResolvedValue(
      err({ code: "pipes_not_connected", message: "Connect HubSpot first." }),
    );
    loadPipesApiKey.mockResolvedValue(ok("pat-token"));

    const result = await loadHubspotPipesCredential({
      localOrganizationId: "org-1",
      workosUserId: "user_123",
    });

    expect(isOk(result) && result.value).toBe("pat-token");
    expect(loadPipesApiKey).toHaveBeenCalledWith({
      provider: "hubspot",
      localOrganizationId: "org-1",
      workosUserId: "user_123",
    });
  });

  it("does not fall back to an access token when OAuth needs reconnecting", async () => {
    loadPipesAccessToken.mockResolvedValue(
      err({ code: "pipes_needs_reauthorization", message: "Reconnect HubSpot." }),
    );

    const result = await loadHubspotPipesCredential({
      localOrganizationId: "org-1",
      workosUserId: "user_123",
    });

    expect(isErr(result) && result.error.code).toBe("hubspot_pipes_needs_reauthorization");
    expect(loadPipesApiKey).not.toHaveBeenCalled();
  });
});

describe("saveHubspotPipesApiKey", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("reports a missing WorkOS provider when Pipes cannot store an access token", async () => {
    upsertPipesApiKey.mockResolvedValue(
      err({ code: "pipes_not_connected", message: "No such provider." }),
    );

    const result = await saveHubspotPipesApiKey({
      localOrganizationId: "org-1",
      workosUserId: "user_123",
      apiKey: "pat-1",
    });

    expect(isErr(result) && result.error.code).toBe("hubspot_pipes_provider_missing");
  });

  it("stores the private-app token when Pipes accepts it", async () => {
    upsertPipesApiKey.mockResolvedValue(
      ok({ connected: true, needsReauthorization: false, apiKeyLast4: "pat1" }),
    );

    const result = await saveHubspotPipesApiKey({
      localOrganizationId: "org-1",
      workosUserId: "user_123",
      apiKey: "pat-1",
    });

    expect(isOk(result)).toBe(true);
  });
});
