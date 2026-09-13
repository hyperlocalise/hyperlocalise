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

import { err, ok } from "@/lib/primitives/result/results";

const mocks = vi.hoisted(() => ({
  loadGscPipesAccessToken: vi.fn(),
}));

vi.mock("./pipes", () => ({
  loadGscPipesAccessToken: (...args: unknown[]) => mocks.loadGscPipesAccessToken(...args),
}));

import { loadSearchConsolePerformance } from "./performance-loader";
import { resetGscProviderForTests, setGscProviderForTests } from "./provider";

describe("loadSearchConsolePerformance", () => {
  afterEach(() => {
    resetGscProviderForTests();
    vi.clearAllMocks();
  });

  it("returns disconnected when Search Console is not connected through Pipes", async () => {
    mocks.loadGscPipesAccessToken.mockResolvedValue(
      err({
        code: "gsc_not_connected",
        message: "Connect Google Search Console in Integrations before using it.",
      }),
    );

    const result = await loadSearchConsolePerformance({
      organizationId: "org_local",
      workosUserId: "user_workos",
      domainKey: "hyperlocalise.com",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe("disconnected");
    }
  });

  it("returns unconfigured when WorkOS Pipes is unavailable", async () => {
    mocks.loadGscPipesAccessToken.mockResolvedValue(
      err({
        code: "gsc_pipes_unavailable",
        message: "WorkOS is not configured, so Search Console cannot connect through Pipes.",
      }),
    );

    const result = await loadSearchConsolePerformance({
      organizationId: "org_local",
      workosUserId: "user_workos",
      domainKey: "hyperlocalise.com",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe("unconfigured");
    }
  });

  it("loads matched property performance", async () => {
    mocks.loadGscPipesAccessToken.mockResolvedValue(ok("ya29.gsc-token"));

    setGscProviderForTests({
      async listSites() {
        return ok([{ siteUrl: "sc-domain:hyperlocalise.com", permissionLevel: "siteOwner" }]);
      },
      async queryPerformance(input) {
        if (input.dimensions?.[0] === "date") {
          return ok({
            rows: [{ keys: ["2026-09-01"], clicks: 10, impressions: 100, ctr: 0.1, position: 8 }],
            startDate: "2026-08-17",
            endDate: "2026-09-13",
          });
        }
        if (input.dimensions?.[0] === "query") {
          return ok({
            rows: [{ keys: ["traduction"], clicks: 6, impressions: 40, ctr: 0.15, position: 5 }],
            startDate: "2026-08-17",
            endDate: "2026-09-13",
          });
        }
        return ok({
          rows: [
            {
              keys: ["https://hyperlocalise.com/fr"],
              clicks: 8,
              impressions: 70,
              ctr: 0.114,
              position: 6,
            },
          ],
          startDate: "2026-08-17",
          endDate: "2026-09-13",
        });
      },
      async inspectUrl() {
        return ok(null);
      },
    });

    const result = await loadSearchConsolePerformance({
      organizationId: "org_local",
      workosUserId: "user_workos",
      domainKey: "hyperlocalise.com",
      marketId: "france-fr",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe("ready");
      expect(result.value.siteUrl).toBe("sc-domain:hyperlocalise.com");
      expect(result.value.totals.clicks).toBe(10);
      expect(result.value.queries[0]?.query).toBe("traduction");
      expect(result.value.pages[0]?.page).toBe("https://hyperlocalise.com/fr");
    }
    expect(mocks.loadGscPipesAccessToken).toHaveBeenCalledWith({
      localOrganizationId: "org_local",
      workosUserId: "user_workos",
    });
  });
});
