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

const { upsertPipesApiKey } = vi.hoisted(() => ({
  upsertPipesApiKey: vi.fn(),
}));

vi.mock("@/lib/pipes/accounts", () => ({
  getPipesAccountStatus: vi.fn(),
  loadPipesApiKey: vi.fn(),
  upsertPipesApiKey,
}));

vi.mock("@/lib/database/client", () => ({
  db: { select: vi.fn() },
  schema: { users: { id: "id", workosUserId: "workosUserId" } },
}));

import { saveHubspotPipesApiKey } from "./pipes";

describe("saveHubspotPipesApiKey", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("reports a missing WorkOS provider when Pipes does not know hubspot", async () => {
    upsertPipesApiKey.mockResolvedValue(
      err({ code: "pipes_not_connected", message: "No such provider." }),
    );

    const result = await saveHubspotPipesApiKey({
      localOrganizationId: "org-1",
      workosUserId: "user_123",
      apiKey: "pat-1",
    });

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.code).toBe("hubspot_pipes_provider_missing");
    }
    expect(upsertPipesApiKey).toHaveBeenCalledWith({
      provider: "hubspot",
      localOrganizationId: "org-1",
      workosUserId: "user_123",
      secret: "pat-1",
    });
  });

  it("stores the token when Pipes accepts the provider", async () => {
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
