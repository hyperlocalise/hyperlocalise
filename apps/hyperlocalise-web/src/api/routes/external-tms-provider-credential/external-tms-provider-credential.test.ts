import "dotenv/config";

import { eq } from "drizzle-orm";
import { testClient } from "hono/testing";
import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";

import { app } from "@/api/app";
import { db, schema } from "@/lib/database";
import { createProviderCredentialTestFixture } from "../provider-credential/provider-credential.fixture";

const { resolveApiAuthContextFromSessionMock } = vi.hoisted(() => ({
  resolveApiAuthContextFromSessionMock: vi.fn(() => globalThis.__testApiAuthContext ?? null),
}));

vi.mock("@/api/auth/workos-session", () => ({
  resolveApiAuthContextFromSession: resolveApiAuthContextFromSessionMock,
}));

const client = testClient(app);
const fixture = createProviderCredentialTestFixture(client);

describe("externalTmsProviderCredentialRoutes", () => {
  beforeAll(async () => {
    await db.$client.query("select 1");
  });

  afterEach(async () => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    await fixture.cleanup();
  });

  it("stores encrypted external TMS credentials for admins", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const headers = await fixture.authHeadersFor(identity);

    const response = await client.api.orgs[":organizationSlug"]["external-tms-provider-credential"].$put(
      {
        param: { organizationSlug: identity.organization.slug ?? "missing" },
        json: {
          providerKind: "crowdin",
          displayName: "Crowdin Prod",
          secretMaterial: "crowdin-token-super-secret",
          region: "us",
        },
      },
      { headers },
    );

    expect(response.status).toBe(200);
    const authContext = globalThis.__testApiAuthContext;
    const [stored] = await db
      .select()
      .from(schema.organizationExternalTmsProviderCredentials)
      .where(eq(schema.organizationExternalTmsProviderCredentials.organizationId, authContext!.organization.localOrganizationId));
    expect(stored?.ciphertext).not.toContain("crowdin-token-super-secret");
  });

  it("blocks non-admin mutation", async () => {
    const identity = fixture.createWorkosIdentityWithRole("member");
    const headers = await fixture.authHeadersFor(identity);

    const response = await client.api.orgs[":organizationSlug"]["external-tms-provider-credential"].$put(
      {
        param: { organizationSlug: identity.organization.slug ?? "missing" },
        json: {
          providerKind: "crowdin",
          displayName: "Crowdin",
          secretMaterial: "secret",
        },
      },
      { headers },
    );

    expect(response.status).toBe(403);
  });
});
