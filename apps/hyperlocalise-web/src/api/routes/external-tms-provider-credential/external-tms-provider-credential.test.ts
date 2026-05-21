import "dotenv/config";

import { and, eq } from "drizzle-orm";
import { testClient } from "hono/testing";
import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";

import { app } from "@/api/app";
import { db, schema } from "@/lib/database";
import {
  getOrganizationExternalTmsProviderCredentialSummary,
  upsertOrganizationExternalTmsProviderCredential,
} from "@/lib/providers/organization-external-tms-provider-credentials";
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

    const response = await client.api.orgs[":organizationSlug"][
      "external-tms-provider-credential"
    ].$put(
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
      .where(
        eq(
          schema.organizationExternalTmsProviderCredentials.organizationId,
          authContext!.organization.localOrganizationId,
        ),
      );
    expect(stored?.ciphertext).not.toContain("crowdin-token-super-secret");
  });

  it("refreshes updatedAt when admins replace external TMS credentials", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const headers = await fixture.authHeadersFor(identity);

    await client.api.orgs[":organizationSlug"]["external-tms-provider-credential"].$put(
      {
        param: { organizationSlug: identity.organization.slug ?? "missing" },
        json: {
          providerKind: "crowdin",
          displayName: "Crowdin",
          secretMaterial: "first-secret",
        },
      },
      { headers },
    );

    const authContext = globalThis.__testApiAuthContext;
    const [first] = await db
      .select()
      .from(schema.organizationExternalTmsProviderCredentials)
      .where(
        and(
          eq(
            schema.organizationExternalTmsProviderCredentials.organizationId,
            authContext!.organization.localOrganizationId,
          ),
          eq(schema.organizationExternalTmsProviderCredentials.providerKind, "crowdin"),
        ),
      );

    await new Promise((resolve) => setTimeout(resolve, 10));

    const response = await client.api.orgs[":organizationSlug"][
      "external-tms-provider-credential"
    ].$put(
      {
        param: { organizationSlug: identity.organization.slug ?? "missing" },
        json: {
          providerKind: "crowdin",
          displayName: "Crowdin",
          secretMaterial: "second-secret",
        },
      },
      { headers },
    );

    expect(response.status).toBe(200);
    const [updated] = await db
      .select()
      .from(schema.organizationExternalTmsProviderCredentials)
      .where(
        and(
          eq(
            schema.organizationExternalTmsProviderCredentials.organizationId,
            authContext!.organization.localOrganizationId,
          ),
          eq(schema.organizationExternalTmsProviderCredentials.providerKind, "crowdin"),
        ),
      );

    expect(updated!.updatedAt.getTime()).toBeGreaterThan(first!.updatedAt.getTime());
  });

  it("returns external TMS credential summaries for the requested provider", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    await fixture.authHeadersFor(identity);
    const authContext = globalThis.__testApiAuthContext!;

    await upsertOrganizationExternalTmsProviderCredential({
      organizationId: authContext.organization.localOrganizationId,
      userId: authContext.user.localUserId,
      role: authContext.membership.role,
      providerKind: "crowdin",
      displayName: "Crowdin",
      secretMaterial: "crowdin-secret",
    });
    await upsertOrganizationExternalTmsProviderCredential({
      organizationId: authContext.organization.localOrganizationId,
      userId: authContext.user.localUserId,
      role: authContext.membership.role,
      providerKind: "phrase",
      displayName: "Phrase",
      secretMaterial: "phrase-secret",
    });

    const summary = await getOrganizationExternalTmsProviderCredentialSummary(
      authContext.organization.localOrganizationId,
      "phrase",
    );

    expect(summary?.providerKind).toBe("phrase");
    expect(summary?.displayName).toBe("Phrase");
  });

  it("blocks non-admin mutation", async () => {
    const identity = fixture.createWorkosIdentityWithRole("member");
    const headers = await fixture.authHeadersFor(identity);

    const response = await client.api.orgs[":organizationSlug"][
      "external-tms-provider-credential"
    ].$put(
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

  it("blocks non-admin direct upsert calls", async () => {
    const identity = fixture.createWorkosIdentityWithRole("member");
    await fixture.authHeadersFor(identity);
    const authContext = globalThis.__testApiAuthContext!;

    await expect(
      upsertOrganizationExternalTmsProviderCredential({
        organizationId: authContext.organization.localOrganizationId,
        userId: authContext.user.localUserId,
        role: authContext.membership.role,
        providerKind: "crowdin",
        displayName: "Crowdin",
        secretMaterial: "secret",
      }),
    ).rejects.toThrow("forbidden");
  });

  it("rejects invalid provider kinds on delete", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const headers = await fixture.authHeadersFor(identity);

    const response = await client.api.orgs[":organizationSlug"]["external-tms-provider-credential"][
      ":providerKind"
    ].$delete(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing",
          providerKind: "unknownprovider",
        },
      },
      { headers },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "invalid_external_tms_provider_kind",
    });
  });
});
