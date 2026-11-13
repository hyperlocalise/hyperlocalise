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

import { err, isErr, isOk, ok } from "@/lib/primitives/result/results";

const {
  resolveBrazePipesWorkosUserId,
  loadBrazePipesApiKey,
  loadBrazeRestEndpoint,
  createBrazeTemplatesClient,
} = vi.hoisted(() => ({
  resolveBrazePipesWorkosUserId: vi.fn(),
  loadBrazePipesApiKey: vi.fn(),
  loadBrazeRestEndpoint: vi.fn(),
  createBrazeTemplatesClient: vi.fn(),
}));

vi.mock("./pipes", () => ({
  resolveBrazePipesWorkosUserId: (...args: unknown[]) => resolveBrazePipesWorkosUserId(...args),
  loadBrazePipesApiKey: (...args: unknown[]) => loadBrazePipesApiKey(...args),
}));

vi.mock("./settings", () => ({
  loadBrazeRestEndpoint: (...args: unknown[]) => loadBrazeRestEndpoint(...args),
}));

vi.mock("./client", () => ({
  createBrazeTemplatesClient: (...args: unknown[]) => createBrazeTemplatesClient(...args),
}));

import { loadBrazeAutomationClient } from "./credentials";

describe("loadBrazeAutomationClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createBrazeTemplatesClient.mockReturnValue({ kind: "client" });
  });

  it("fails closed when no WorkOS identity can be resolved", async () => {
    resolveBrazePipesWorkosUserId.mockResolvedValue(null);

    const result = await loadBrazeAutomationClient({
      localOrganizationId: "org-1",
      localUserId: "local-1",
    });

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.code).toBe("braze_not_connected");
    }
    expect(loadBrazePipesApiKey).not.toHaveBeenCalled();
  });

  it("returns the Pipes key error without asking for a cluster", async () => {
    resolveBrazePipesWorkosUserId.mockResolvedValue("user_123");
    loadBrazePipesApiKey.mockResolvedValue(
      err({ code: "braze_pipes_needs_reauthorization", message: "Reconnect Braze." }),
    );

    const result = await loadBrazeAutomationClient({
      localOrganizationId: "org-1",
      workosUserId: "user_123",
    });

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.code).toBe("braze_pipes_needs_reauthorization");
    }
    expect(loadBrazeRestEndpoint).not.toHaveBeenCalled();
  });

  it("builds a client when Pipes and the REST cluster are configured", async () => {
    resolveBrazePipesWorkosUserId.mockResolvedValue("user_123");
    loadBrazePipesApiKey.mockResolvedValue(ok("api-key"));
    loadBrazeRestEndpoint.mockResolvedValue(ok("iad-03"));

    const result = await loadBrazeAutomationClient({
      localOrganizationId: "org-1",
      workosUserId: "user_123",
    });

    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.restEndpoint).toBe("iad-03");
      expect(result.value.client).toEqual({ kind: "client" });
    }
    expect(createBrazeTemplatesClient).toHaveBeenCalledWith({
      apiKey: "api-key",
      restEndpoint: "iad-03",
    });
  });
});
