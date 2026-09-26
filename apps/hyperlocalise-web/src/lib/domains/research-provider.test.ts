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

vi.mock("@/lib/env", () => ({
  env: {
    GO_SVC_URL: "http://127.0.0.1:8080",
  },
}));

import { createGoSvcDomainResearchProvider } from "./research-provider";

describe("createGoSvcDomainResearchProvider error mapping", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("maps configured, rate-limit, validation, and generic provider failures", async () => {
    const cases = [
      {
        status: 503,
        body: { error: "dataforseo_not_configured", message: "missing keys" },
        code: "provider_not_configured",
      },
      {
        status: 500,
        body: { error: "dataforseo_not_configured", message: "still missing" },
        code: "provider_not_configured",
      },
      {
        status: 429,
        body: { error: "dataforseo_rate_limited", message: "slow down" },
        code: "provider_rate_limited",
      },
      {
        status: 400,
        body: { error: "dataforseo_validation_error", message: "bad market" },
        code: "provider_validation_failed",
      },
      {
        status: 502,
        body: { error: "upstream_failed", message: "bad gateway" },
        code: "provider_failed",
      },
    ] as const;

    for (const testCase of cases) {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: false,
          status: testCase.status,
          json: async () => testCase.body,
        }),
      );

      const result = await createGoSvcDomainResearchProvider().marketVisibility({
        organizationSlug: "acme",
        targetDomain: "example.com",
        marketId: "france-fr",
        locationCode: 2250,
        languageCode: "fr",
      });
      expect(result).toMatchObject({
        ok: false,
        error: { code: testCase.code, message: testCase.body.message },
      });
    }
  });

  it("maps transport failures to provider_unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    const result = await createGoSvcDomainResearchProvider().expandKeywordIdeas({
      keyword: "localisation",
      locationCode: 2840,
      languageCode: "en",
      limit: 10,
    });
    expect(result).toMatchObject({
      ok: false,
      error: { code: "provider_unavailable" },
    });
  });

  it("filters blank keyword ideas and defaults unknown intent", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          keywords: [
            { keyword: "  keep me  ", volume: 100, kd: 12, cpc: 1.5, intent: "commercial" },
            { keyword: "   ", volume: 50, kd: 1, cpc: 0.1, intent: "transactional" },
            { keyword: "fallback", volume: 10, kd: 2, cpc: 0.2, intent: "mystery" },
          ],
        }),
      }),
    );

    const result = await createGoSvcDomainResearchProvider().expandKeywordIdeas({
      keyword: "localisation",
      locationCode: 2840,
      languageCode: "en",
      limit: 10,
    });

    expect(result).toEqual({
      ok: true,
      value: [
        {
          keyword: "keep me",
          volume: 100,
          kd: 12,
          cpc: 1.5,
          intent: "commercial",
        },
        {
          keyword: "fallback",
          volume: 10,
          kd: 2,
          cpc: 0.2,
          intent: "informational",
        },
      ],
    });
  });
});
