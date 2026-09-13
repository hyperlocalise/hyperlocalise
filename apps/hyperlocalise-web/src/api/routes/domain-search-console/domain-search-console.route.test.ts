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
import "dotenv/config";

import { testClient } from "hono/testing";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  resolveApiAuthContextFromSessionMock: vi.fn(
    (options) =>
      globalThis.__resolveTestApiAuthContextFromSession?.(options) ??
      globalThis.__testApiAuthContext ??
      null,
  ),
  workspaceDomainsFlagRunMock: vi.fn(async () => true),
  loadGscPipesAccessToken: vi.fn(),
}));

vi.mock("@/api/auth/workos-session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/auth/workos-session")>();
  return {
    ...actual,
    resolveApiAuthContextFromSession: mocks.resolveApiAuthContextFromSessionMock,
  };
});

vi.mock("@/lib/gsc/pipes", () => ({
  loadGscPipesAccessToken: (...args: unknown[]) => mocks.loadGscPipesAccessToken(...args),
}));

vi.mock("@/lib/flags/workspace-flags", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/flags/workspace-flags")>();
  return {
    ...actual,
    workspaceDomainsFlag: { run: mocks.workspaceDomainsFlagRunMock },
  };
});

import { createApp } from "@/api/app";
import type { AppType } from "@/api/typed-app";
import { createAuthTestFixture } from "@/api/test-auth.fixture";
import { db, schema } from "@/lib/database/client";
import { resetGscProviderForTests, setGscProviderForTests } from "@/lib/gsc/provider";
import { hostnameToDomainSlug } from "@/lib/localisation-audit/domain-slug";
import { err, ok } from "@/lib/primitives/result/results";

const client = testClient<AppType>(createApp());
const fixture = createAuthTestFixture();

async function insertVerifiedDomain(organizationId: string, userId: string) {
  const domainKey = `gsc-${crypto.randomUUID().slice(0, 8)}.example`;
  const domainSlug = hostnameToDomainSlug(domainKey);
  const [audit] = await db
    .insert(schema.localisationAudits)
    .values({
      domainKey,
      domainSlug,
      sourceUrl: `https://${domainKey}/`,
      status: "succeeded",
      score: 72,
      teaser: {
        score: 72,
        domainKey,
        domainSlug,
        detectedLocales: [],
        headlineFindings: [],
        findingsCount: 0,
        pagesCrawled: 1,
        completedAt: new Date().toISOString(),
      },
      report: {
        score: 72,
        domainKey,
        domainSlug,
        sourceUrl: `https://${domainKey}/`,
        focusLocales: [],
        detectedLocales: [],
        findings: [],
        pages: [],
        linguisticNotes: [],
        pagesCrawled: 1,
        completedAt: new Date().toISOString(),
      },
      completedAt: new Date(),
    })
    .returning();
  const [linkedDomain] = await db
    .insert(schema.linkedDomains)
    .values({
      organizationId,
      createdByUserId: userId,
      domainKey,
      domainSlug: audit!.domainSlug,
      sourceUrl: audit!.sourceUrl,
      status: "verified",
      verificationToken: `token_${crypto.randomUUID()}`,
      verifiedMethod: "dns_txt",
      verifiedAt: new Date(),
      localisationAuditId: audit!.id,
    })
    .returning();
  return { linkedDomain: linkedDomain!, domainKey };
}

describe("domainSearchConsoleRoutes", () => {
  beforeAll(async () => {
    await db.$client.query("select 1");
  });

  beforeEach(() => {
    mocks.workspaceDomainsFlagRunMock.mockResolvedValue(true);
    mocks.loadGscPipesAccessToken.mockReset();
    mocks.loadGscPipesAccessToken.mockResolvedValue(
      err({
        code: "gsc_not_connected",
        message: "Connect Google Search Console in Integrations before using it.",
      }),
    );
  });

  afterEach(async () => {
    resetGscProviderForTests();
    vi.clearAllMocks();
    await fixture.cleanup();
  });

  it("returns disconnected Search Console state before a grant exists", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const headers = await fixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";
    const organizationId = globalThis.__testApiAuthContext?.organization.localOrganizationId;
    const userId = globalThis.__testApiAuthContext?.user.localUserId;
    const { linkedDomain } = await insertVerifiedDomain(organizationId!, userId!);

    const response = await client.api.orgs[":organizationSlug"]["linked-domains"][
      ":linkedDomainId"
    ]["search-console"].$get(
      {
        param: { organizationSlug, linkedDomainId: linkedDomain.id },
        query: {},
      },
      { headers },
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    if (!("searchConsole" in body)) {
      throw new Error("expected searchConsole");
    }
    expect(body.searchConsole.status).toBe("disconnected");
  });

  it("returns matched performance after a grant is stored", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const headers = await fixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";
    const organizationId = globalThis.__testApiAuthContext?.organization.localOrganizationId;
    const userId = globalThis.__testApiAuthContext?.user.localUserId;
    const { linkedDomain, domainKey } = await insertVerifiedDomain(organizationId!, userId!);

    mocks.loadGscPipesAccessToken.mockResolvedValue(ok("ya29.gsc-token"));

    setGscProviderForTests({
      async listSites() {
        return ok([{ siteUrl: `sc-domain:${domainKey}`, permissionLevel: "siteOwner" }]);
      },
      async queryPerformance(input) {
        if (input.dimensions?.[0] === "query") {
          return ok({
            rows: [{ keys: ["localisation"], clicks: 4, impressions: 40, ctr: 0.1, position: 7 }],
            startDate: "2026-08-17",
            endDate: "2026-09-13",
          });
        }
        if (input.dimensions?.[0] === "page") {
          return ok({
            rows: [
              {
                keys: [`https://${domainKey}/fr`],
                clicks: 3,
                impressions: 20,
                ctr: 0.15,
                position: 5,
              },
            ],
            startDate: "2026-08-17",
            endDate: "2026-09-13",
          });
        }
        return ok({
          rows: [{ keys: ["2026-09-01"], clicks: 9, impressions: 90, ctr: 0.1, position: 8 }],
          startDate: "2026-08-17",
          endDate: "2026-09-13",
        });
      },
      async inspectUrl() {
        return ok({
          indexStatusResult: { verdict: "PASS", coverageState: "Submitted and indexed" },
        });
      },
    });

    const response = await client.api.orgs[":organizationSlug"]["linked-domains"][
      ":linkedDomainId"
    ]["search-console"].$get(
      {
        param: { organizationSlug, linkedDomainId: linkedDomain.id },
        query: { dateRange: "last_28_days", locale: "france-fr" },
      },
      { headers },
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    if (!("searchConsole" in body)) {
      throw new Error("expected searchConsole");
    }
    expect(body.searchConsole.status).toBe("ready");
    expect(body.searchConsole.totals.clicks).toBe(9);
    expect(body.searchConsole.queries[0]?.query).toBe("localisation");

    const inspect = await client.api.orgs[":organizationSlug"]["linked-domains"][":linkedDomainId"][
      "search-console"
    ].inspect.$post(
      {
        param: { organizationSlug, linkedDomainId: linkedDomain.id },
        json: { url: `https://${domainKey}/fr` },
      },
      { headers },
    );
    expect(inspect.status).toBe(200);
    const inspectBody = await inspect.json();
    if (!("inspection" in inspectBody)) {
      throw new Error("expected inspection");
    }
    expect(inspectBody.inspection?.indexStatusResult?.verdict).toBe("PASS");
  });
});
