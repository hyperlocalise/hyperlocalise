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
import { afterEach, beforeAll, describe, expect, it } from "vite-plus/test";

import { createAuthTestFixture } from "@/api/test-auth.fixture";
import { db } from "@/lib/database/client";
import { ok } from "@/lib/primitives/result/results";

import { upsertGscConnection } from "./connections";
import { loadSearchConsolePerformance } from "./performance-loader";
import { resetGscProviderForTests, setGscProviderForTests } from "./provider";

const fixture = createAuthTestFixture();

describe("loadSearchConsolePerformance", () => {
  beforeAll(async () => {
    await db.$client.query("select 1");
  });

  afterEach(async () => {
    resetGscProviderForTests();
    await fixture.cleanup();
  });

  it("returns disconnected when the org has no Search Console grant", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    await fixture.authHeadersFor(identity);

    const result = await loadSearchConsolePerformance({
      organizationId: identity.organization.localOrganizationId,
      domainKey: "hyperlocalise.com",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe("disconnected");
    }
  });

  it("loads matched property performance", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    await fixture.authHeadersFor(identity);
    await upsertGscConnection({
      organizationId: identity.organization.localOrganizationId,
      userId: identity.user.localUserId,
      googleSubject: "subject-1",
      accountEmail: "seo@acme.test",
      refreshToken: "refresh-token",
      accessToken: "access-token",
      accessTokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
      scopes: "openid email",
    });

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
      organizationId: identity.organization.localOrganizationId,
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
  });
});
