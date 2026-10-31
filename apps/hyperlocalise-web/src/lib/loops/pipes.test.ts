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

const { getPipesAccountStatus, loadPipesApiKey, upsertPipesApiKey } = vi.hoisted(() => ({
  getPipesAccountStatus: vi.fn(),
  loadPipesApiKey: vi.fn(),
  upsertPipesApiKey: vi.fn(),
}));

vi.mock("@/lib/pipes/accounts", () => ({
  getPipesAccountStatus,
  loadPipesApiKey,
  upsertPipesApiKey,
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

import { saveLoopsPipesApiKey } from "./pipes";

describe("saveLoopsPipesApiKey", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("reports a missing WorkOS provider when Pipes does not know loops", async () => {
    upsertPipesApiKey.mockResolvedValue(
      err({ code: "pipes_not_connected", message: "No such provider." }),
    );

    const result = await saveLoopsPipesApiKey({
      localOrganizationId: "org-1",
      workosUserId: "user_123",
      apiKey: "loops-key",
    });

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.code).toBe("loops_pipes_provider_missing");
    }
    expect(upsertPipesApiKey).toHaveBeenCalledWith({
      provider: "loops",
      localOrganizationId: "org-1",
      workosUserId: "user_123",
      secret: "loops-key",
    });
  });

  it("passes through a stored Pipes status", async () => {
    upsertPipesApiKey.mockResolvedValue(
      ok({ connected: true, needsReauthorization: false, apiKeyLast4: "7890" }),
    );

    const result = await saveLoopsPipesApiKey({
      localOrganizationId: "org-1",
      workosUserId: "user_123",
      apiKey: "loops-key",
    });

    expect(isOk(result)).toBe(true);
  });

  it("requires an API key", async () => {
    const result = await saveLoopsPipesApiKey({
      localOrganizationId: "org-1",
      workosUserId: "user_123",
      apiKey: "   ",
    });

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.code).toBe("loops_api_key_required");
    }
    expect(upsertPipesApiKey).not.toHaveBeenCalled();
  });
});
