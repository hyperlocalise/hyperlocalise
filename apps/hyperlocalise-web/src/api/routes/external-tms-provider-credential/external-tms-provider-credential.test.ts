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
  resolveApiAuthContextFromSessionMock: vi.fn(
    (options) =>
      globalThis.__resolveTestApiAuthContextFromSession?.(options) ??
      globalThis.__testApiAuthContext ??
      null,
  ),
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

  it("lists all external TMS credentials for the organization with enriched details", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const headers = await fixture.authHeadersFor(identity);
    const authContext = globalThis.__testApiAuthContext!;

    await upsertOrganizationExternalTmsProviderCredential({
      organizationId: authContext.organization.localOrganizationId,
      userId: authContext.user.localUserId,
      role: authContext.membership.role,
      providerKind: "crowdin",
      displayName: "Crowdin",
      secretMaterial: "crowdin-secret",
    });

    await db.insert(schema.projects).values({
      id: "crowdin-project-1",
      organizationId: authContext.organization.localOrganizationId,
      name: "Crowdin Project",
      source: "external_tms",
      externalProviderKind: "crowdin",
      externalProjectId: "123",
    });

    const response = await client.api.orgs[":organizationSlug"][
      "external-tms-provider-credential"
    ].$get(
      {
        param: { organizationSlug: identity.organization.slug ?? "missing" },
      },
      { headers },
    );

    expect(response.status).toBe(200);
    const data = (await response.json()) as {
      externalTmsProviderCredentials: Array<{
        providerKind: string;
        projectCount: number;
        capabilities: Record<string, { supported: boolean; label: string }>;
      }>;
    };
    expect(data.externalTmsProviderCredentials).toHaveLength(1);
    const crowdin = data.externalTmsProviderCredentials[0];
    expect(crowdin.providerKind).toBe("crowdin");
    expect(crowdin.projectCount).toBe(1);
    expect(crowdin.capabilities["projects.read"]).toMatchObject({
      supported: true,
      label: "Read projects",
    });
  });

  it("rejects non-admins from listing external TMS credentials", async () => {
    const identity = fixture.createWorkosIdentityWithRole("member");
    const headers = await fixture.authHeadersFor(identity);
    const authContext = globalThis.__testApiAuthContext!;

    await upsertOrganizationExternalTmsProviderCredential({
      organizationId: authContext.organization.localOrganizationId,
      userId: authContext.user.localUserId,
      role: "admin",
      providerKind: "lokalise",
      displayName: "Lokalise",
      secretMaterial: "lokalise-secret",
    });

    const response = await client.api.orgs[":organizationSlug"][
      "external-tms-provider-credential"
    ].$get(
      {
        param: { organizationSlug: identity.organization.slug ?? "missing" },
      },
      { headers },
    );

    expect(response.status).toBe(403);
    const data = (await response.json()) as { error: string };
    expect(data.error).toBe("forbidden");
  });

  it("returns connected provider health and records a health check sync run", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const headers = await fixture.authHeadersFor(identity);
    const authContext = globalThis.__testApiAuthContext!;
    const fetchMock = vi.fn(async () => {
      return new Response("{}", {
        status: 200,
        headers: {
          "x-ratelimit-limit": "100",
          "x-ratelimit-remaining": "99",
        },
      });
    });

    vi.stubGlobal("fetch", fetchMock);

    await upsertOrganizationExternalTmsProviderCredential({
      organizationId: authContext.organization.localOrganizationId,
      userId: authContext.user.localUserId,
      role: authContext.membership.role,
      providerKind: "crowdin",
      displayName: "Crowdin",
      secretMaterial: "crowdin-secret",
    });

    const response = await client.api.orgs[":organizationSlug"]["external-tms-provider-credential"][
      ":providerKind"
    ]["health-check"].$post(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing",
          providerKind: "crowdin",
        },
      },
      { headers },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      externalTmsProviderHealth: {
        providerKind: "crowdin",
        status: "connected",
        availability: "available",
        authValidity: "valid",
        errorCode: null,
        rateLimit: {
          limit: "100",
          remaining: "99",
        },
      },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.crowdin.com/api/v2/user",
      expect.objectContaining({
        headers: { Authorization: "Bearer crowdin-secret" },
      }),
    );

    const [syncRun] = await db
      .select()
      .from(schema.providerSyncRuns)
      .where(
        and(
          eq(schema.providerSyncRuns.organizationId, authContext.organization.localOrganizationId),
          eq(schema.providerSyncRuns.providerKind, "crowdin"),
          eq(schema.providerSyncRuns.kind, "health_check"),
        ),
      );

    expect(syncRun?.status).toBe("succeeded");
    expect(syncRun?.providerMetadata).toMatchObject({
      status: "connected",
      authValidity: "valid",
    });
  });

  it("does not record a health check sync run when the credential is missing", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const headers = await fixture.authHeadersFor(identity);
    const authContext = globalThis.__testApiAuthContext!;

    const response = await client.api.orgs[":organizationSlug"]["external-tms-provider-credential"][
      ":providerKind"
    ]["health-check"].$post(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing",
          providerKind: "crowdin",
        },
      },
      { headers },
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "provider_credential_not_found",
    });

    const syncRuns = await db
      .select()
      .from(schema.providerSyncRuns)
      .where(
        and(
          eq(schema.providerSyncRuns.organizationId, authContext.organization.localOrganizationId),
          eq(schema.providerSyncRuns.providerKind, "crowdin"),
          eq(schema.providerSyncRuns.kind, "health_check"),
        ),
      );

    expect(syncRuns).toHaveLength(0);
  });

  it("rejects unsafe provider base URLs before fetching", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const headers = await fixture.authHeadersFor(identity);
    const authContext = globalThis.__testApiAuthContext!;
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));

    vi.stubGlobal("fetch", fetchMock);

    await upsertOrganizationExternalTmsProviderCredential({
      organizationId: authContext.organization.localOrganizationId,
      userId: authContext.user.localUserId,
      role: authContext.membership.role,
      providerKind: "crowdin",
      displayName: "Crowdin",
      secretMaterial: "crowdin-secret",
      baseUrl: "https://169.254.169.254/latest/meta-data",
    });

    const response = await client.api.orgs[":organizationSlug"]["external-tms-provider-credential"][
      ":providerKind"
    ]["health-check"].$post(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing",
          providerKind: "crowdin",
        },
      },
      { headers },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      externalTmsProviderHealth: {
        providerKind: "crowdin",
        status: "error",
        availability: "unknown",
        authValidity: "unknown",
        errorCode: "provider_base_url_invalid",
        message: "Provider base URL is invalid.",
      },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns a generic message when provider fetch fails", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const headers = await fixture.authHeadersFor(identity);
    const authContext = globalThis.__testApiAuthContext!;
    const fetchMock = vi.fn(async () => {
      throw new Error("connect ECONNREFUSED internal.service.local");
    });

    vi.stubGlobal("fetch", fetchMock);

    await upsertOrganizationExternalTmsProviderCredential({
      organizationId: authContext.organization.localOrganizationId,
      userId: authContext.user.localUserId,
      role: authContext.membership.role,
      providerKind: "crowdin",
      displayName: "Crowdin",
      secretMaterial: "crowdin-secret",
    });

    const response = await client.api.orgs[":organizationSlug"]["external-tms-provider-credential"][
      ":providerKind"
    ]["health-check"].$post(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing",
          providerKind: "crowdin",
        },
      },
      { headers },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      externalTmsProviderHealth: {
        providerKind: "crowdin",
        status: "degraded",
        availability: "unavailable",
        authValidity: "unknown",
        errorCode: "provider_unavailable",
        message: "Provider health check failed.",
      },
    });
  });

  it("returns a stable error code when provider auth is invalid", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const headers = await fixture.authHeadersFor(identity);
    const authContext = globalThis.__testApiAuthContext!;
    const fetchMock = vi.fn(async () => new Response("{}", { status: 401 }));

    vi.stubGlobal("fetch", fetchMock);

    await upsertOrganizationExternalTmsProviderCredential({
      organizationId: authContext.organization.localOrganizationId,
      userId: authContext.user.localUserId,
      role: authContext.membership.role,
      providerKind: "phrase",
      displayName: "Phrase",
      secretMaterial: "phrase-secret",
    });

    const response = await client.api.orgs[":organizationSlug"]["external-tms-provider-credential"][
      ":providerKind"
    ]["health-check"].$post(
      {
        param: {
          organizationSlug: identity.organization.slug ?? "missing",
          providerKind: "phrase",
        },
      },
      { headers },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      externalTmsProviderHealth: {
        providerKind: "phrase",
        status: "error",
        availability: "available",
        authValidity: "invalid",
        errorCode: "provider_auth_invalid",
      },
    });

    const summary = await getOrganizationExternalTmsProviderCredentialSummary(
      authContext.organization.localOrganizationId,
      "phrase",
    );

    expect(summary?.validationStatus).toBe("error");
    expect(summary?.validationMessage).toBe("Provider rejected the stored credential.");
    expect(summary?.lastValidatedAt).not.toBeNull();
  });
});
