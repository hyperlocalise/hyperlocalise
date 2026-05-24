import "dotenv/config";

import { testClient } from "hono/testing";
import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";

import { app } from "@/api/app";
import { db } from "@/lib/database";
import { upsertOrganizationExternalTmsProviderCredential } from "@/lib/providers/organization-external-tms-provider-credentials";
import { createProviderCredentialTestFixture } from "../provider-credential/provider-credential.fixture";

const { resolveApiAuthContextFromSessionMock } = vi.hoisted(() => ({
  resolveApiAuthContextFromSessionMock: vi.fn(
    (options) =>
      globalThis.__resolveTestApiAuthContextFromSession?.(options) ??
      globalThis.__testApiAuthContext ??
      null,
  ),
}));

vi.mock("@/api/auth/workos-session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/auth/workos-session")>();
  return {
    ...actual,
    resolveApiAuthContextFromSession: resolveApiAuthContextFromSessionMock,
  };
});

const client = testClient(app);
const fixture = createProviderCredentialTestFixture(client);

describe("tmsDashboardSummaryRoutes", () => {
  beforeAll(async () => {
    await db.$client.query("select 1");
  });

  afterEach(async () => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    await fixture.cleanup();
  });

  it("returns an empty summary when no providers are connected", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const headers = await fixture.authHeadersFor(identity);

    const response = await client.api.orgs[":organizationSlug"]["tms-dashboard-summary"].$get(
      {
        param: { organizationSlug: identity.organization.slug ?? "missing" },
      },
      { headers },
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    if ("error" in body) throw new Error(String(body.error));
    expect(body.tmsDashboardSummary.counts.connectedProviders).toBe(0);
    expect(body.tmsDashboardSummary.providers).toEqual([]);
    expect(body.tmsDashboardSummary.localeReadiness).toEqual([]);
  });

  it("returns provider details when credentials exist", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const headers = await fixture.authHeadersFor(identity);
    const authContext = globalThis.__testApiAuthContext!;

    await upsertOrganizationExternalTmsProviderCredential({
      organizationId: authContext.organization.localOrganizationId,
      userId: authContext.user.localUserId,
      role: "admin",
      providerKind: "crowdin",
      displayName: "Crowdin Prod",
      secretMaterial: "crowdin-token-super-secret",
    });

    const response = await client.api.orgs[":organizationSlug"]["tms-dashboard-summary"].$get(
      {
        param: { organizationSlug: identity.organization.slug ?? "missing" },
      },
      { headers },
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    if ("error" in body) throw new Error(String(body.error));
    expect(body.tmsDashboardSummary.counts.connectedProviders).toBe(1);
    expect(body.tmsDashboardSummary.providers).toHaveLength(1);
    expect(body.tmsDashboardSummary.providers[0]?.providerKind).toBe("crowdin");
  });
});
