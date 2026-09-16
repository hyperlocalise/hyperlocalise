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
import { describe, expect, it, vi } from "vite-plus/test";

const { marketVisibilityMock, withPublicHttpFetchMock } = vi.hoisted(() => ({
  marketVisibilityMock: vi.fn(),
  withPublicHttpFetchMock: vi.fn(),
}));

vi.mock("@/lib/security/public-http-fetch", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/security/public-http-fetch")>();

  return {
    ...actual,
    withPublicHttpFetch: withPublicHttpFetchMock,
  };
});

vi.mock("./research-provider", () => ({
  getDomainResearchProvider: () => ({ marketVisibility: marketVisibilityMock }),
}));

import { recommendDomainMarkets } from "./market-recommendations";

describe("recommendDomainMarkets", () => {
  it("propagates caller cancellation to the homepage request", async () => {
    let homepageSignal = AbortSignal.abort();
    withPublicHttpFetchMock.mockImplementation((_url, init) => {
      homepageSignal = init.signal;
      return new Promise((_resolve, reject) => {
        homepageSignal.addEventListener("abort", () => reject(homepageSignal.reason), {
          once: true,
        });
      });
    });
    marketVisibilityMock.mockResolvedValue({
      ok: false,
      error: { code: "provider_unavailable", message: "Provider unavailable." },
    });

    const controller = new AbortController();
    const recommendation = recommendDomainMarkets({
      domain: "example.com",
      signal: controller.signal,
    });

    expect(homepageSignal.aborted).toBe(false);
    controller.abort();

    await expect(recommendation).resolves.toMatchObject({ ok: false });
    expect(homepageSignal.aborted).toBe(true);
  });
});
