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

import { isOk } from "@/lib/primitives/result/results";

const mocks = vi.hoisted(() => ({
  getWorkosServerClient: vi.fn(),
  getDataIntegration: vi.fn(),
  listUserDataProviders: vi.fn(),
}));

vi.mock("@/lib/workos/server-client", () => ({
  getWorkosServerClient: (...args: unknown[]) => mocks.getWorkosServerClient(...args),
}));

import {
  getWorkosPipesProviderAvailability,
  isPipesProviderConnectable,
  isWorkosPipesConfigured,
  resetPipesProviderAvailabilityCacheForTests,
  supportsPipesApiKey,
  supportsPipesOAuth,
} from "./availability";

describe("pipes availability", () => {
  afterEach(() => {
    mocks.getWorkosServerClient.mockReset();
    mocks.getDataIntegration.mockReset();
    mocks.listUserDataProviders.mockReset();
    resetPipesProviderAvailabilityCacheForTests();
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
        supportedAuthMethods: [],
      });
    }
    expect(isWorkosPipesConfigured()).toBe(false);
  });

  it("reports provider availability from WorkOS getDataIntegration", async () => {
    mocks.getWorkosServerClient.mockReturnValue({
      pipes: {
        getDataIntegration: mocks.getDataIntegration,
        listUserDataProviders: mocks.listUserDataProviders,
      },
    });
    mocks.getDataIntegration.mockResolvedValue({ enabled: true });
    mocks.listUserDataProviders.mockResolvedValue({
      data: [{ slug: "sanity", authMethods: ["oauth", "api_key"] }],
    });

    const result = await getWorkosPipesProviderAvailability("sanity", {
      workosUserId: "user_123",
      workosOrganizationId: "org_123",
    });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value).toEqual({
        workosConfigured: true,
        providerConfigured: true,
        providerEnabled: true,
        supportedAuthMethods: ["oauth", "api_key"],
      });
      expect(isPipesProviderConnectable(result.value)).toBe(true);
      expect(supportsPipesOAuth(result.value)).toBe(true);
      expect(supportsPipesApiKey(result.value)).toBe(true);
    }
  });

  it("reports API-key-only auth when WorkOS lists no OAuth method", async () => {
    mocks.getWorkosServerClient.mockReturnValue({
      pipes: {
        getDataIntegration: mocks.getDataIntegration,
        listUserDataProviders: mocks.listUserDataProviders,
      },
    });
    mocks.getDataIntegration.mockResolvedValue({ enabled: true });
    mocks.listUserDataProviders.mockResolvedValue({
      data: [{ slug: "sanity", authMethods: ["api_key"] }],
    });

    const result = await getWorkosPipesProviderAvailability("sanity", {
      workosUserId: "user_123",
      workosOrganizationId: "org_123",
    });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.supportedAuthMethods).toEqual(["api_key"]);
      expect(supportsPipesOAuth(result.value)).toBe(false);
      expect(supportsPipesApiKey(result.value)).toBe(true);
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

  it("treats unexpected WorkOS integration errors as unavailable provider state", async () => {
    mocks.getWorkosServerClient.mockReturnValue({
      pipes: { getDataIntegration: mocks.getDataIntegration },
    });
    mocks.getDataIntegration.mockRejectedValue(new Error("upstream failure"));

    const result = await getWorkosPipesProviderAvailability("sanity");
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value).toEqual({
        workosConfigured: true,
        providerConfigured: false,
        providerEnabled: false,
        supportedAuthMethods: ["oauth", "api_key"],
      });
      expect(isPipesProviderConnectable(result.value)).toBe(false);
    }
  });

  it("falls back to default auth methods when listing user data providers times out", async () => {
    vi.useFakeTimers();
    mocks.getWorkosServerClient.mockReturnValue({
      pipes: {
        getDataIntegration: mocks.getDataIntegration,
        listUserDataProviders: mocks.listUserDataProviders,
      },
    });
    mocks.getDataIntegration.mockResolvedValue({ enabled: true });
    mocks.listUserDataProviders.mockImplementation(
      () =>
        new Promise(() => {
          /* never resolves */
        }),
    );

    const resultPromise = getWorkosPipesProviderAvailability("sanity", {
      workosUserId: "user_123",
      workosOrganizationId: "org_123",
    });
    await vi.advanceTimersByTimeAsync(2_500);
    const result = await resultPromise;
    vi.useRealTimers();

    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.supportedAuthMethods).toEqual(["oauth", "api_key"]);
      expect(result.value.providerEnabled).toBe(true);
    }
  });
});
