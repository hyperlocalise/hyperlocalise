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

import type { DomainMarketVisibility } from "./research-provider";

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

const encoder = new TextEncoder();

function mockHomepageHtml(html: string) {
  withPublicHttpFetchMock.mockResolvedValue({
    kind: "body",
    bytes: encoder.encode(html),
  });
}

function visibility(
  input: Partial<DomainMarketVisibility> & Pick<DomainMarketVisibility, "marketId">,
): DomainMarketVisibility {
  return {
    marketId: input.marketId,
    locationCode: input.locationCode ?? 1,
    languageCode: input.languageCode ?? "en",
    organicCount: input.organicCount ?? 0,
    organicEtv: input.organicEtv ?? 0,
    top10Count: input.top10Count ?? 0,
    hasOrganicVisibility: input.hasOrganicVisibility ?? false,
  };
}

function stubVisibilityByMarket(rows: Record<string, DomainMarketVisibility>) {
  marketVisibilityMock.mockImplementation(async (input: { marketId: string }) => {
    const row = rows[input.marketId] ?? visibility({ marketId: input.marketId });
    return ok(row);
  });
}

describe("recommendDomainMarkets", () => {
  beforeEach(() => {
    marketVisibilityMock.mockReset();
    withPublicHttpFetchMock.mockReset();
  });

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
      organizationSlug: "acme",
      signal: controller.signal,
    });

    expect(homepageSignal.aborted).toBe(false);
    controller.abort();

    await expect(recommendation).resolves.toMatchObject({ ok: false });
    expect(homepageSignal.aborted).toBe(true);
  });

  it("rejects invalid domains before fetching", async () => {
    const result = await recommendDomainMarkets({
      domain: "not a domain",
      organizationSlug: "acme",
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "invalid_domain" },
    });
    expect(withPublicHttpFetchMock).not.toHaveBeenCalled();
    expect(marketVisibilityMock).not.toHaveBeenCalled();
  });

  it("falls back to default markets when the homepage cannot be fetched", async () => {
    withPublicHttpFetchMock.mockRejectedValue(new Error("homepage_unreachable"));
    stubVisibilityByMarket({
      "france-fr": visibility({
        marketId: "france-fr",
        organicEtv: 10,
        hasOrganicVisibility: true,
      }),
      "germany-de": visibility({ marketId: "germany-de", organicEtv: 1 }),
      "japan-ja": visibility({ marketId: "japan-ja", organicEtv: 2 }),
      "vietnam-vi": visibility({
        marketId: "vietnam-vi",
        organicEtv: 20,
        hasOrganicVisibility: true,
      }),
    });

    const result = await recommendDomainMarkets({
      domain: "example.com",
      organizationSlug: "acme",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(
      marketVisibilityMock.mock.calls
        .map((call) => call[0].marketId as string)
        .toSorted((left, right) => left.localeCompare(right)),
    ).toEqual(["france-fr", "germany-de", "japan-ja", "vietnam-vi"]);
    expect(result.value.candidates.map((row) => row.marketId)).toEqual([
      "vietnam-vi",
      "france-fr",
      "japan-ja",
      "germany-de",
    ]);
    expect(result.value.recommended.map((row) => row.marketId)).toEqual([
      "vietnam-vi",
      "france-fr",
    ]);
  });

  it("expands candidates from page language signals and ranks by organic etv", async () => {
    mockHomepageHtml(`<!doctype html>
<html lang="es-ES">
  <head>
    <meta property="og:locale" content="es_MX" />
    <link rel="alternate" hreflang="x-default" href="https://example.com/" />
    <link rel="alternate" hreflang="es-ES" href="https://example.com/es/" />
  </head>
</html>`);
    stubVisibilityByMarket({
      "france-fr": visibility({ marketId: "france-fr", organicEtv: 5 }),
      "germany-de": visibility({ marketId: "germany-de", organicEtv: 4 }),
      "japan-ja": visibility({ marketId: "japan-ja", organicEtv: 3 }),
      "vietnam-vi": visibility({ marketId: "vietnam-vi", organicEtv: 2 }),
      "spain-es": visibility({
        marketId: "spain-es",
        organicEtv: 50,
        organicCount: 9,
        hasOrganicVisibility: true,
      }),
      "mexico-es": visibility({
        marketId: "mexico-es",
        organicEtv: 50,
        organicCount: 3,
        hasOrganicVisibility: true,
      }),
    });

    const result = await recommendDomainMarkets({
      domain: "example.com",
      organizationSlug: "acme",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(
      marketVisibilityMock.mock.calls
        .map((call) => call[0].marketId as string)
        .toSorted((left, right) => left.localeCompare(right)),
    ).toEqual(["france-fr", "germany-de", "japan-ja", "mexico-es", "spain-es", "vietnam-vi"]);
    expect(result.value.candidates.slice(0, 2).map((row) => row.marketId)).toEqual([
      "spain-es",
      "mexico-es",
    ]);
    expect(result.value.recommended.map((row) => row.marketId)).toEqual(["spain-es", "mexico-es"]);
  });

  it("returns the first provider failure when every market visibility call fails", async () => {
    mockHomepageHtml('<html lang="en"><body>ok</body></html>');
    marketVisibilityMock.mockResolvedValue({
      ok: false,
      error: { code: "provider_rate_limited", message: "Slow down." },
    });

    const result = await recommendDomainMarkets({
      domain: "example.com",
      organizationSlug: "acme",
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "provider_rate_limited", message: "Slow down." },
    });
  });
});
