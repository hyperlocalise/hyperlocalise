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

import { eq } from "drizzle-orm";
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
}));

vi.mock("@/api/auth/workos-session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/auth/workos-session")>();
  return {
    ...actual,
    resolveApiAuthContextFromSession: mocks.resolveApiAuthContextFromSessionMock,
  };
});

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
import {
  resetDomainResearchProviderForTests,
  setDomainResearchProviderForTests,
} from "@/lib/domains/research-provider";
import { hostnameToDomainSlug } from "@/lib/localisation-audit/domain-slug";
import { ok } from "@/lib/primitives/result/results";

const client = testClient<AppType>(createApp());
const fixture = createAuthTestFixture();

async function insertSucceededAudit(domainKey: string) {
  const domainSlug = hostnameToDomainSlug(domainKey);
  const completedAt = new Date().toISOString();
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
        completedAt,
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
        completedAt,
      },
      completedAt: new Date(),
    })
    .returning();
  return audit;
}

async function insertVerifiedDomain(organizationId: string, userId: string) {
  const domainKey = `research-${crypto.randomUUID().slice(0, 8)}.example`;
  const audit = await insertSucceededAudit(domainKey);
  const [linkedDomain] = await db
    .insert(schema.linkedDomains)
    .values({
      organizationId,
      createdByUserId: userId,
      domainKey,
      domainSlug: audit.domainSlug,
      sourceUrl: audit.sourceUrl,
      status: "verified",
      verificationToken: `token_${crypto.randomUUID()}`,
      verifiedMethod: "dns_txt",
      verifiedAt: new Date(),
      localisationAuditId: audit.id,
    })
    .returning();
  return { linkedDomain: linkedDomain!, audit };
}

describe("domainResearchRoutes", () => {
  beforeAll(async () => {
    await db.$client.query("select 1");
  });

  beforeEach(() => {
    mocks.workspaceDomainsFlagRunMock.mockResolvedValue(true);
    setDomainResearchProviderForTests({
      expandKeywordIdeas: async () =>
        ok([
          {
            keyword: "seo tools",
            volume: 1200,
            kd: 38,
            cpc: 2.4,
            intent: "commercial",
          },
        ]),
      liveSerp: async () =>
        ok([
          {
            position: 1,
            title: "SEO tools",
            url: "https://www.example.com/seo",
            snippet: "Live SERP row",
            isOwn: true,
          },
        ]),
      rankCheck: async (input) =>
        ok({
          keywordId: input.keywordId,
          keyword: input.keyword,
          position: 7,
          url: "https://www.example.com/seo",
        }),
      rankCheckBatch: async (input) =>
        ok(
          input.keywords.map((keyword) => ({
            keywordId: keyword.keywordId,
            keyword: keyword.keyword,
            position: 7,
            url: "https://www.example.com/seo",
          })),
        ),
    });
  });

  afterEach(async () => {
    resetDomainResearchProviderForTests();
    vi.clearAllMocks();
    await fixture.cleanup();
  });

  it("expands saves inspects and tracks keywords through DataForSEO", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const headers = await fixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";
    const organizationId = globalThis.__testApiAuthContext?.organization.localOrganizationId;
    const userId = globalThis.__testApiAuthContext?.user.localUserId;
    expect(organizationId).toBeTruthy();
    expect(userId).toBeTruthy();

    const { linkedDomain } = await insertVerifiedDomain(organizationId!, userId!);
    const param = { organizationSlug, linkedDomainId: linkedDomain.id };

    const empty = await client.api.orgs[":organizationSlug"]["linked-domains"][":linkedDomainId"][
      "research"
    ].$get({ param }, { headers });
    expect(empty.status).toBe(200);
    const emptyBody = await empty.json();
    if (!("catalog" in emptyBody)) {
      throw new Error("expected catalog");
    }
    expect(emptyBody.catalog.keywords).toEqual([]);

    const expanded = await client.api.orgs[":organizationSlug"]["linked-domains"][
      ":linkedDomainId"
    ].research.keywords.expand.$post(
      { param, json: { seedKeyword: "seo", marketId: "france-fr" } },
      { headers },
    );
    expect(expanded.status).toBe(200);
    const expandedBody = await expanded.json();
    if (!("ideas" in expandedBody)) {
      throw new Error("expected ideas");
    }
    expect(expandedBody.ideas[0]?.keyword).toBe("seo tools");

    const saved = await client.api.orgs[":organizationSlug"]["linked-domains"][
      ":linkedDomainId"
    ].research.keywords.save.$post(
      {
        param,
        json: {
          marketId: "france-fr",
          seedKeyword: "seo",
          keywords: expandedBody.ideas,
        },
      },
      { headers },
    );
    expect(saved.status).toBe(200);
    const savedBody = await saved.json();
    if (!("keywords" in savedBody)) {
      throw new Error("expected keywords");
    }
    expect(savedBody.keywords).toHaveLength(1);

    const serp = await client.api.orgs[":organizationSlug"]["linked-domains"][
      ":linkedDomainId"
    ].research.serp.$post(
      { param, json: { keyword: "seo tools", marketId: "france-fr" } },
      { headers },
    );
    expect(serp.status).toBe(200);
    const serpBody = await serp.json();
    if (!("results" in serpBody)) {
      throw new Error("expected results");
    }
    expect(serpBody.results[0]?.isOwn).toBe(true);

    const tracked = await client.api.orgs[":organizationSlug"]["linked-domains"][
      ":linkedDomainId"
    ].research.ranks.$post(
      {
        param,
        json: {
          marketId: "france-fr",
          keywords: savedBody.keywords,
        },
      },
      { headers },
    );
    expect(tracked.status).toBe(200);
    const trackedBody = await tracked.json();
    if (!("ranks" in trackedBody)) {
      throw new Error("expected ranks");
    }
    expect(trackedBody.ranks[0]?.position).toBe(7);

    const catalog = await client.api.orgs[":organizationSlug"]["linked-domains"][":linkedDomainId"][
      "research"
    ].$get({ param }, { headers });
    const catalogBody = await catalog.json();
    if (!("catalog" in catalogBody)) {
      throw new Error("expected catalog");
    }
    expect(catalogBody.catalog.keywords).toHaveLength(1);
    expect(catalogBody.catalog.ranks[0]?.url).toBe("https://www.example.com/seo");
    expect(catalogBody.catalog.serpByKeywordId[savedBody.keywords[0]!.id]?.[0]?.url).toBe(
      "https://www.example.com/seo",
    );

    const refreshed = await client.api.orgs[":organizationSlug"]["linked-domains"][
      ":linkedDomainId"
    ].research.ranks.refresh.$post({ param }, { headers });
    expect(refreshed.status).toBe(200);
    const refreshedBody = await refreshed.json();
    if (!("ranks" in refreshedBody)) {
      throw new Error("expected ranks");
    }
    expect(refreshedBody.ranks[0]?.previousPosition).toBe(7);
    expect(refreshedBody.ranks[0]?.position).toBe(7);

    await db
      .delete(schema.localisationAudits)
      .where(eq(schema.localisationAudits.id, linkedDomain.localisationAuditId!));
  });

  it("rejects unknown markets", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const headers = await fixture.authHeadersFor(identity);
    const organizationSlug = identity.organization.slug ?? "missing-slug";
    const organizationId = globalThis.__testApiAuthContext?.organization.localOrganizationId;
    const userId = globalThis.__testApiAuthContext?.user.localUserId;
    const { linkedDomain } = await insertVerifiedDomain(organizationId!, userId!);

    const response = await client.api.orgs[":organizationSlug"]["linked-domains"][
      ":linkedDomainId"
    ].research.keywords.expand.$post(
      {
        param: { organizationSlug, linkedDomainId: linkedDomain.id },
        json: { seedKeyword: "seo", marketId: "unknown" },
      },
      { headers },
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "market_not_found" });
  });
});
