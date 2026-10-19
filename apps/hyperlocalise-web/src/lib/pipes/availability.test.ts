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
import { NotFoundException } from "@workos-inc/node";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { isErr, isOk } from "@/lib/primitives/result/results";

const mocks = vi.hoisted(() => ({
  getWorkosServerClient: vi.fn(),
  getDataIntegration: vi.fn(),
}));

vi.mock("@/lib/workos/server-client", () => ({
  getWorkosServerClient: (...args: unknown[]) => mocks.getWorkosServerClient(...args),
}));

import {
  getWorkosPipesProviderAvailability,
  isPipesProviderConnectable,
  isWorkosPipesConfigured,
} from "./availability";

describe("pipes availability", () => {
  afterEach(() => {
    mocks.getWorkosServerClient.mockReset();
    mocks.getDataIntegration.mockReset();
  });

  it("reports WorkOS as not configured when the server client is missing", async () => {
    mocks.getWorkosServerClient.mockReturnValue(null);

    const result = await getWorkosPipesProviderAvailability("sanity");
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value).toEqual({
        workosConfigured: false,
        providerConfigured: false,
        providerEnabled: false,
      });
    }
    expect(isWorkosPipesConfigured()).toBe(false);
  });

  it("reports provider availability from WorkOS getDataIntegration", async () => {
    mocks.getWorkosServerClient.mockReturnValue({
      pipes: { getDataIntegration: mocks.getDataIntegration },
    });
    mocks.getDataIntegration.mockResolvedValue({ enabled: true });

    const result = await getWorkosPipesProviderAvailability("sanity");
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value).toEqual({
        workosConfigured: true,
        providerConfigured: true,
        providerEnabled: true,
      });
      expect(isPipesProviderConnectable(result.value)).toBe(true);
    }
  });

  it("treats a missing data integration as not configured", async () => {
    mocks.getWorkosServerClient.mockReturnValue({
      pipes: { getDataIntegration: mocks.getDataIntegration },
    });
    mocks.getDataIntegration.mockRejectedValue(
      new NotFoundException({
        path: "/data-integrations/sanity",
        requestID: "req_test_not_found",
        message: "missing",
      }),
    );

    const result = await getWorkosPipesProviderAvailability("sanity");
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.providerConfigured).toBe(false);
      expect(isPipesProviderConnectable(result.value)).toBe(false);
    }
  });

  it("maps unexpected WorkOS errors to pipes_unavailable", async () => {
    mocks.getWorkosServerClient.mockReturnValue({
      pipes: { getDataIntegration: mocks.getDataIntegration },
    });
    mocks.getDataIntegration.mockRejectedValue(new Error("upstream failure"));

    const result = await getWorkosPipesProviderAvailability("sanity");
    expect(isErr(result)).toBe(true);
  });
});
